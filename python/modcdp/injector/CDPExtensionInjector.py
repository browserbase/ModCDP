# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/injector/CDPExtensionInjector.ts
# - ./go/modcdp/injector/CDPExtensionInjector.go
from __future__ import annotations

import time
from collections.abc import Callable

from ..injector.ExtensionInjector import ExtensionInjector, ExtensionInjectionResult, InjectorConfig
from ..injector.NodeExtensionFiles import defaultModCDPExtensionPath, prepareUnpackedExtension


class CDPExtensionInjector(ExtensionInjector):
    def __init__(self, config: InjectorConfig | dict | None = None) -> None:
        config = config.model_dump() if isinstance(config, InjectorConfig) else dict(config or {})
        super().__init__({**config, "injector_mode": "cdp"})
        self.unpacked_extension_path: str | None = None
        self.cleanup: Callable[[], None] | None = None

    def prepare(self) -> None:
        extension_path = self.config.injector_cdp_extension_path or defaultModCDPExtensionPath()
        if not extension_path or self.unpacked_extension_path:
            super().prepare()
            return
        prepared = prepareUnpackedExtension(extension_path)
        self.unpacked_extension_path = prepared.unpacked_extension_path
        self.cleanup = prepared.cleanup
        super().prepare()

    def inject(self) -> ExtensionInjectionResult | None:
        extension_path = self.unpacked_extension_path
        if not extension_path:
            return None
        try:
            load_result = self._sendWithTimeout("Extensions.loadUnpacked", {"path": extension_path})
        except RuntimeError as error:
            if "Method not available" in str(error) or "wasn't found" in str(error) or "Method not found" in str(error):
                return None
            raise RuntimeError(
                f"Extensions.loadUnpacked failed for {extension_path}: {error}\n"
                "If the path is correct and the manifest is valid, load the ModCDP extension manually in chrome://extensions and reconnect."
            ) from error
        extension_id = load_result.get("id")
        if not isinstance(extension_id, str) or not extension_id:
            raise RuntimeError(f"Extensions.loadUnpacked returned no extension id (got {load_result})")
        self.extension_id = extension_id
        self.service_worker_extension_id = extension_id

        sw_url_prefix = f"chrome-extension://{extension_id}/"
        deadline = time.monotonic() + self.config.injector_service_worker_ready_timeout_ms / 1000
        while time.monotonic() < deadline:
            for target in self._targetInfos():
                if target.type != "service_worker" or not target.url.startswith(sw_url_prefix):
                    continue
                probed = self._probeTarget(
                    target,
                    self.config.injector_service_worker_probe_timeout_ms,
                    allow_attach=True,
                )
                if probed:
                    probed.source = "cdp"
                    probed.extension_id = extension_id
                    return probed
            time.sleep(self.config.injector_service_worker_poll_interval_ms / 1000)
        raise RuntimeError(f"Timed out waiting for service worker target for extension {extension_id}.")

    def close(self) -> None:
        super().close()
        if self.cleanup:
            self.cleanup()
            self.cleanup = None
