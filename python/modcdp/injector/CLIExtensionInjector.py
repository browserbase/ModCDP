# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/injector/CLIExtensionInjector.ts
# - ./go/modcdp/injector/CLIExtensionInjector.go
from __future__ import annotations

from collections.abc import Callable

from ..injector.ExtensionInjector import (
    ExtensionInjector,
    ExtensionInjectionResult,
    InjectorConfig,
)
from ..injector.NodeExtensionFiles import (
    defaultModCDPExtensionPath,
    extensionIdFromManifestKey,
    prepareUnpackedExtension,
)


class CLIExtensionInjector(ExtensionInjector):
    def __init__(self, config: InjectorConfig | dict | None = None) -> None:
        config = config.model_dump() if isinstance(config, InjectorConfig) else dict(config or {})
        super().__init__({**config, "injector_mode": "cli"})
        self.unpacked_extension_path: str | None = None
        self.extension_id: str | None = None
        self.cleanup: Callable[[], None] | None = None

    def prepare(self) -> None:
        extension_path = self.config.injector_cli_extension_path or defaultModCDPExtensionPath()
        if not extension_path or self.unpacked_extension_path:
            super().prepare()
            return
        prepared = prepareUnpackedExtension(extension_path)
        self.unpacked_extension_path = prepared.unpacked_extension_path
        self.cleanup = prepared.cleanup
        self._resolveExtensionId()
        super().prepare()

    def inject(self) -> ExtensionInjectionResult | None:
        discovered = self._waitForReadyServiceWorker(
            self.config.injector_service_worker_ready_timeout_ms,
            matched_only=self.config.injector_trust_service_worker_target,
        )
        if discovered is None:
            return None
        discovered.source = "cli"
        return discovered

    def close(self) -> None:
        super().close()
        if self.cleanup:
            self.cleanup()
            self.cleanup = None

    def _resolveExtensionId(self) -> str | None:
        if self.extension_id:
            return self.extension_id
        configured_extension_id = self.config.injector_cli_extension_id
        if configured_extension_id:
            self.extension_id = configured_extension_id
        elif self.unpacked_extension_path:
            self.extension_id = extensionIdFromManifestKey(self.unpacked_extension_path)
        if self.extension_id:
            self.service_worker_extension_id = self.extension_id
            self.update({"injector_cli_extension_id": self.extension_id, "injector_service_worker_extension_id": self.extension_id})
        if self.unpacked_extension_path:
            self.extra_args = [f"--load-extension={self.unpacked_extension_path}"]
        return self.extension_id
