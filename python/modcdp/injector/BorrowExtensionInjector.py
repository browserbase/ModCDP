from __future__ import annotations

import tempfile
import time
from pathlib import Path
from typing import Any, Mapping, cast

from ..injector.ExtensionInjector import (
    DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS,
    DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS,
    DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS,
    EXT_ID_FROM_URL_RE,
    MODCDP_READY_EXPRESSION,
    ExtensionInjectionResult,
    ExtensionInjector,
    InjectorOptions,
    defaultModCDPExtensionPath,
    prepareUnpackedExtension,
)

BORROW_BOOTSTRAP_STATUS_EXPRESSION = """
(() => ({
  ok: Boolean(globalThis.ModCDP?.handleCommand && globalThis.ModCDP?.addCustomEvent),
  extension_id: globalThis.chrome?.runtime?.id ?? null,
  has_tabs: Boolean(globalThis.chrome?.tabs?.query),
  has_debugger: Boolean(globalThis.chrome?.debugger?.sendCommand && globalThis.chrome?.debugger?.getTargets),
}))()
"""


class BorrowExtensionInjector(ExtensionInjector):
    def __init__(self, options: InjectorOptions | None = None) -> None:
        super().__init__(options)
        self.unpacked_extension_path: str | None = None
        self.cleanup: tempfile.TemporaryDirectory[str] | None = None
        self.bootstrap_modcdp_server_expression: str | None = None

    def prepare(self) -> None:
        if self.bootstrap_modcdp_server_expression is not None:
            super().prepare()
            return
        extension_path = self.options.get("injector_borrow_extension_path") or defaultModCDPExtensionPath()
        if not extension_path:
            raise FileNotFoundError("Unable to locate bundled ModCDP extension for borrow injector.")
        self.unpacked_extension_path, self.cleanup = prepareUnpackedExtension(extension_path)
        try:
            source = (Path(self.unpacked_extension_path) / "modcdp" / "service_worker.js").read_text()
        except BaseException:
            self.cleanup.cleanup()
            self.cleanup = None
            self.unpacked_extension_path = None
            raise
        self.bootstrap_modcdp_server_expression = (
            "async function() {\n"
            "if (!globalThis.ModCDP) {\n"
            f"{source}\n"
            "}\n"
            "const ModCDP = globalThis.ModCDP;\n"
            "return {\n"
            "  ok: Boolean(ModCDP?.handleCommand && ModCDP?.addCustomEvent),\n"
            "  extension_id: globalThis.chrome?.runtime?.id ?? null,\n"
            "  has_tabs: Boolean(globalThis.chrome?.tabs?.query),\n"
            "  has_debugger: Boolean(globalThis.chrome?.debugger?.sendCommand && globalThis.chrome?.debugger?.getTargets),\n"
            "};\n"
            "}"
        )
        super().prepare()

    def close(self) -> None:
        super().close()
        if self.cleanup is not None:
            self.cleanup.cleanup()
            self.cleanup = None

    def inject(self) -> ExtensionInjectionResult | None:
        deadline = time.monotonic() + (self.options.get("injector_service_worker_ready_timeout_ms") or DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS) / 1000
        while True:
            borrowed = self._borrowVisibleServiceWorkers()
            if borrowed:
                return borrowed
            if time.monotonic() >= deadline:
                return None
            time.sleep((self.options.get("injector_service_worker_poll_interval_ms") or DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS) / 1000)

    def _borrowVisibleServiceWorkers(self) -> ExtensionInjectionResult | None:
        borrowed: list[tuple[ExtensionInjectionResult, bool, bool]] = []
        visible_service_workers = [
            target
            for target in self._targetInfos()
            if target.get("type") == "service_worker" and isinstance(target.get("url"), str) and target["url"].startswith("chrome-extension://")
        ]
        has_configured_matcher = bool(
            self.options.get("injector_service_worker_extension_id")
            or self.options.get("injector_service_worker_url_includes")
            or self.options.get("injector_service_worker_url_suffixes")
        )
        candidates = [target for target in visible_service_workers if self._serviceWorkerTargetMatches(target)] if has_configured_matcher else visible_service_workers
        for target in candidates:
            try:
                bootstrapped = self._bootstrapTarget(target)
            except Exception:
                bootstrapped = None
            if bootstrapped:
                borrowed.append(bootstrapped)
        borrowed.sort(key=lambda item: (item[2], item[1]), reverse=True)
        return borrowed[0][0] if borrowed else None

    def _bootstrapTarget(self, target) -> tuple[ExtensionInjectionResult, bool, bool] | None:
        attached = self._sendWithTimeout(
            "Target.attachToTarget",
            {"targetId": target["targetId"], "flatten": True},
            None,
            self.options.get("injector_service_worker_probe_timeout_ms") or DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS,
        )
        session_id = attached.get("sessionId")
        if not isinstance(session_id, str) or not session_id:
            raise RuntimeError(f"Target.attachToTarget returned no sessionId for targetId={target['targetId']}")
        try:
            try:
                self._sendWithTimeout("Runtime.enable", {}, session_id)
            except Exception:
                pass
            status = self._sendWithTimeout(
                "Runtime.evaluate",
                {
                    "expression": BORROW_BOOTSTRAP_STATUS_EXPRESSION,
                    "returnByValue": True,
                },
                session_id,
            )
            result = cast(Mapping[str, Any], status.get("result")) if isinstance(status.get("result"), Mapping) else {}
            raw_value = result.get("value")
            value = cast(Mapping[str, Any], raw_value) if isinstance(raw_value, Mapping) else {}
            if not bool(value.get("has_tabs")) or not bool(value.get("has_debugger")):
                self._sendWithTimeout("Target.detachFromTarget", {"sessionId": session_id})
                return None
            if not bool(value.get("ok")):
                if self.bootstrap_modcdp_server_expression is None:
                    raise RuntimeError("BorrowExtensionInjector requires prepare before inject.")
                bootstrap = self._sendWithTimeout(
                    "Runtime.evaluate",
                    {
                        "expression": f"({self.bootstrap_modcdp_server_expression})()",
                        "awaitPromise": True,
                        "returnByValue": True,
                    },
                    session_id,
                )
                result = cast(Mapping[str, Any], bootstrap.get("result")) if isinstance(bootstrap.get("result"), Mapping) else {}
                raw_value = result.get("value")
                value = cast(Mapping[str, Any], raw_value) if isinstance(raw_value, Mapping) else {}
            if not bool(value.get("has_tabs")) or not bool(value.get("has_debugger")):
                self._sendWithTimeout("Target.detachFromTarget", {"sessionId": session_id})
                return None
            ready = bool(value.get("ok"))
            if ready and self._readyExpression() != MODCDP_READY_EXPRESSION:
                probe = self._sendWithTimeout(
                    "Runtime.evaluate",
                    {
                        "expression": self._readyExpression(),
                        "returnByValue": True,
                    },
                    session_id,
                )
                probe_result = cast(Mapping[str, Any], probe.get("result")) if isinstance(probe.get("result"), Mapping) else {}
                ready = bool(probe_result.get("value"))
            if not ready:
                self._sendWithTimeout("Target.detachFromTarget", {"sessionId": session_id})
                return None
            match = EXT_ID_FROM_URL_RE.match(target["url"])
            extension_id = value.get("extension_id") if isinstance(value.get("extension_id"), str) else None
            result: ExtensionInjectionResult = {
                "source": "borrow",
                "extension_id": extension_id or (match.group(1) if match else None),
                "target_id": target["targetId"],
                "url": target["url"],
                "session_id": session_id,
            }
            return result, bool(value.get("has_tabs")), bool(value.get("has_debugger"))
        except BaseException:
            self._sendWithTimeout("Target.detachFromTarget", {"sessionId": session_id})
            raise
