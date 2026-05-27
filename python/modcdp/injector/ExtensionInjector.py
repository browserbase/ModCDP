# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/injector/ExtensionInjector.ts
# - ./go/modcdp/injector/ExtensionInjector.go
from __future__ import annotations

import base64
import hashlib
import json
import re
import shutil
import tempfile
import threading
import time
import zipfile
from collections.abc import Callable, Mapping
from pathlib import Path
from queue import Empty, Queue
from typing import Any, Literal, TypedDict, cast

from pydantic import BaseModel, ConfigDict, Field
from ..launcher.BrowserLauncher import LauncherConfig
from ..types.modcdp import ProtocolParams, ProtocolResult, TargetInfo

EXT_ID_FROM_URL_RE = re.compile(r"^chrome-extension://([a-z]+)/")
DEFAULT_MODCDP_EXTENSION_ID = "mdedooklbnfejodmnhmkdpkaedafkehf"
DEFAULT_MODCDP_SERVICE_WORKER_URL_SUFFIXES = ["/modcdp/service_worker.js"]
MODCDP_READY_EXPRESSION = (
    "Boolean(globalThis.ModCDP?.handleCommand && globalThis.ModCDP?.addCustomEvent)"
)
DEFAULT_CDP_SEND_TIMEOUT_MS = 10_000
DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS = 10_000
DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS = 10_000
DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS = 60_000
DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS = 100
DEFAULT_TARGET_SESSION_POLL_INTERVAL_MS = 20

SendCDP = Callable[[str, ProtocolParams | None, str | None], ProtocolResult]


class InjectorConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True)

    injector_mode: Literal["cli", "cdp", "bb", "discover", "borrow", "none"] = "none"
    send: Any | None = None
    injector_cli_extension_path: str | None = None
    injector_cli_extension_id: str | None = None
    injector_cdp_extension_path: str | None = None
    injector_cdp_extension_id: str | None = None
    injector_bb_extension_path: str | None = None
    injector_bb_extension_id: str | None = None
    injector_discover_extension_path: str | None = None
    injector_borrow_extension_path: str | None = None
    injector_service_worker_extension_id: str | None = None
    injector_service_worker_url_includes: list[str] = Field(default_factory=list)
    injector_service_worker_url_suffixes: list[str] = Field(default_factory=lambda: [*DEFAULT_MODCDP_SERVICE_WORKER_URL_SUFFIXES])
    injector_trust_service_worker_target: bool = False
    injector_require_service_worker_target: bool = False
    injector_service_worker_ready_expression: str = MODCDP_READY_EXPRESSION
    injector_cdp_send_timeout_ms: int = DEFAULT_CDP_SEND_TIMEOUT_MS
    injector_execution_context_timeout_ms: int = DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS
    injector_service_worker_probe_timeout_ms: int = DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS
    injector_service_worker_ready_timeout_ms: int = DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS
    injector_service_worker_poll_interval_ms: int = DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS
    injector_target_session_poll_interval_ms: int = DEFAULT_TARGET_SESSION_POLL_INTERVAL_MS
    injector_bb_api_key: str | None = None
    injector_bb_base_url: str = "https://api.browserbase.com"


def defaultModCDPExtensionPath() -> str | None:
    bundled_extension = Path(__file__).resolve().parent.parent / "extension.zip"
    return str(bundled_extension) if bundled_extension.exists() else None


def prepareUnpackedExtension(extension_path: str) -> tuple[str, tempfile.TemporaryDirectory[str]]:
    cleanup_dir = tempfile.TemporaryDirectory(prefix="modcdp-extension-")
    try:
        if extension_path.endswith(".zip"):
            with zipfile.ZipFile(extension_path) as archive:
                _extract_zip(archive, cleanup_dir.name)
        else:
            shutil.copytree(extension_path, cleanup_dir.name, dirs_exist_ok=True)
        return _extension_root(cleanup_dir.name), cleanup_dir
    except BaseException:
        cleanup_dir.cleanup()
        raise


def extensionIdFromManifestKey(extension_path: str) -> str | None:
    manifest_path = Path(extension_path) / "manifest.json"
    if not manifest_path.exists():
        return None
    manifest = json.loads(manifest_path.read_text())
    key = manifest.get("key") if isinstance(manifest, dict) else None
    if not isinstance(key, str) or not key.strip():
        return None
    digest = hashlib.sha256(base64.b64decode(key)).digest()[:16]
    alphabet = "abcdefghijklmnop"
    return "".join(alphabet[byte >> 4] + alphabet[byte & 0x0F] for byte in digest)


def _extension_root(unpacked_path: str) -> str:
    if (Path(unpacked_path) / "manifest.json").exists():
        return unpacked_path
    nested = Path(unpacked_path) / "extension"
    if (nested / "manifest.json").exists():
        return str(nested)
    return unpacked_path


def _extract_zip(archive: zipfile.ZipFile, destination: str) -> None:
    root = Path(destination).resolve()
    for member in archive.infolist():
        target = (root / member.filename).resolve()
        if target != root and root not in target.parents:
            raise RuntimeError(f'zip entry "{member.filename}" escapes extension extraction directory')
    archive.extractall(destination)


def _defaulted(value: Any, fallback: int) -> int:
    return fallback if value is None else int(value)


class ExtensionInjectionResult(TypedDict):
    source: str
    extension_id: str | None
    target_id: str
    url: str
    session_id: str


class ExtensionInjector:
    def __init__(self, config: InjectorConfig | dict[str, Any] | None = None) -> None:
        self.config = _injector_config(config)
        self.unusable_target_ids: set[str] = set()
        self.source: str | None = None
        self.extension_id: str | None = None
        self.target_id: str | None = None
        self.url: str | None = None
        self.session_id: str | None = None
        self.extra_args: list[str] = []

    def update(self, config: InjectorConfig | dict[str, Any] | None = None) -> "ExtensionInjector":
        incoming = _injector_config(config)
        self.config = InjectorConfig.model_validate({**self.config.model_dump(), **incoming.model_dump(exclude_unset=True)})
        return self

    def configForLauncher(self) -> LauncherConfig | dict[str, Any]:
        return {
            "launcher_local_extra_args": self.extra_args,
            "launcher_bb_extension_id": self.config.injector_bb_extension_id,
        }

    def configForUpstream(self) -> dict[str, Any]:
        return {}

    def prepare(self) -> None:
        return None

    def close(self) -> None:
        return None

    def inject(self) -> ExtensionInjectionResult | None:
        raise NotImplementedError(f"{type(self).__name__}.inject is not implemented.")

    def recordInjectionResult(self, result: ExtensionInjectionResult) -> "ExtensionInjector":
        self.source = result["source"]
        self.extension_id = result.get("extension_id")
        self.target_id = result["target_id"]
        self.url = result.get("url")
        self.session_id = result["session_id"]
        return self

    def _readyExpression(self) -> str:
        expression = self.config.injector_service_worker_ready_expression
        if expression == MODCDP_READY_EXPRESSION:
            return MODCDP_READY_EXPRESSION
        return f"({MODCDP_READY_EXPRESSION}) && Boolean({expression})"

    def _sendWithTimeout(
        self,
        method: str,
        params: ProtocolParams | None = None,
        session_id: str | None = None,
        timeout_ms: int | None = None,
    ) -> ProtocolResult:
        send = self.config.send
        if send is None:
            raise RuntimeError(f"{type(self).__name__} requires a CDP send function.")
        effective_timeout_ms = _defaulted(
            timeout_ms if timeout_ms is not None else self.config.injector_cdp_send_timeout_ms,
            DEFAULT_CDP_SEND_TIMEOUT_MS,
        )
        if effective_timeout_ms <= 0:
            return send(method, params or {}, session_id)

        result_queue: Queue[tuple[ProtocolResult | None, BaseException | None]] = Queue(maxsize=1)

        def runSend() -> None:
            try:
                result_queue.put((send(method, params or {}, session_id), None))
            except BaseException as error:
                result_queue.put((None, error))

        threading.Thread(target=runSend, daemon=True).start()
        try:
            result, error = result_queue.get(timeout=effective_timeout_ms / 1000)
        except Empty as error:
            raise TimeoutError(f"{method} timed out after {effective_timeout_ms}ms") from error
        if error is not None:
            raise error
        return result or {}

    def _targetInfos(self) -> list[TargetInfo]:
        result = self._sendWithTimeout("Target.getTargets")
        raw_targets = result.get("targetInfos")
        if not isinstance(raw_targets, list):
            return []
        targets: list[TargetInfo] = []
        for raw_target in raw_targets:
            if not isinstance(raw_target, Mapping):
                continue
            target_id = raw_target.get("targetId")
            target_type = raw_target.get("type")
            target_url = raw_target.get("url")
            if isinstance(target_id, str) and isinstance(target_type, str) and isinstance(target_url, str):
                targets.append({"targetId": target_id, "type": target_type, "url": target_url})
        return targets

    def _probeTarget(
        self,
        target: TargetInfo,
        session_timeout_ms: int = 0,
        *,
        allow_attach: bool = False,
    ) -> ExtensionInjectionResult | None:
        target_id = target["targetId"]
        if target_id in self.unusable_target_ids:
            return None
        attached = self._sendWithTimeout(
            "Target.attachToTarget",
            {"targetId": target_id, "flatten": True},
            None,
            session_timeout_ms,
        )
        session_id = attached.get("sessionId")
        if not isinstance(session_id, str) or not session_id:
            raise RuntimeError(f"Target.attachToTarget returned no sessionId for targetId={target_id}")
        try:
            self._sendWithTimeout("Runtime.enable", {}, session_id)
            probe = self._sendWithTimeout(
                "Runtime.evaluate",
                {
                    "expression": self._readyExpression(),
                    "returnByValue": True,
                },
                session_id,
            )
            result = cast(Mapping[str, Any], probe.get("result")) if isinstance(probe.get("result"), Mapping) else {}
            value = result.get("value")
            if value is not True:
                self._sendWithTimeout("Target.detachFromTarget", {"sessionId": session_id})
                return None
            match = EXT_ID_FROM_URL_RE.match(target.get("url") or "")
            return {
                "source": "discover",
                "extension_id": match.group(1) if match else None,
                "target_id": target_id,
                "url": target["url"],
                "session_id": session_id,
            }
        except BaseException:
            self._sendWithTimeout("Target.detachFromTarget", {"sessionId": session_id})
            raise

    def _discoverReadyServiceWorker(self, *, matched_only: bool = False) -> ExtensionInjectionResult | None:
        target_infos = self._targetInfos()
        if self.config.injector_trust_service_worker_target:
            for candidate in target_infos:
                if not self._serviceWorkerTargetMatches(candidate):
                    continue
                probed = self._probeTarget(
                    candidate,
                    self.config.injector_service_worker_probe_timeout_ms,
                    allow_attach=True,
                )
                if probed:
                    return {**probed, "source": "trusted"}
        if self.config.injector_trust_service_worker_target or matched_only:
            return None
        for candidate in target_infos:
            if candidate["type"] != "service_worker":
                continue
            if not candidate["url"].startswith("chrome-extension://"):
                continue
            try:
                probed = self._probeTarget(
                    candidate,
                    self.config.injector_service_worker_probe_timeout_ms,
                )
            except Exception:
                continue
            if probed:
                return probed
        return None

    def _waitForReadyServiceWorker(self, timeout_ms: int, *, matched_only: bool = False) -> ExtensionInjectionResult | None:
        deadline = time.monotonic() + timeout_ms / 1000
        while time.monotonic() < deadline:
            discovered = self._discoverReadyServiceWorker(matched_only=matched_only)
            if discovered:
                return discovered
            time.sleep(self.config.injector_service_worker_poll_interval_ms / 1000)
        return None

    def _serviceWorkerTargetMatches(self, candidate: Mapping[str, object]) -> bool:
        raw_target_url = candidate.get("url")
        target_url = raw_target_url if isinstance(raw_target_url, str) else ""
        if candidate.get("type") != "service_worker":
            return False
        if not target_url.startswith("chrome-extension://"):
            return False
        extension_id = self.config.injector_service_worker_extension_id
        has_extension_id = bool(extension_id)
        if extension_id and not target_url.startswith(f"chrome-extension://{extension_id}/"):
            return False
        includes = self.config.injector_service_worker_url_includes
        suffixes = self.config.injector_service_worker_url_suffixes
        if includes and not all(part in target_url for part in includes):
            return False
        if suffixes and not any(target_url.endswith(suffix) for suffix in suffixes):
            return False
        return bool(has_extension_id or includes or suffixes)


def _injector_config(config: InjectorConfig | dict[str, Any] | None = None) -> InjectorConfig:
    if isinstance(config, InjectorConfig):
        return config
    return InjectorConfig.model_validate(config or {})
