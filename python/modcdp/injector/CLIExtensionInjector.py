# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/injector/CLIExtensionInjector.ts
# - ./go/modcdp/injector/CLIExtensionInjector.go
from __future__ import annotations

import tempfile

from ..launcher.BrowserLauncher import LauncherConfig
from ..injector.ExtensionInjector import (
    ExtensionInjector,
    ExtensionInjectionResult,
    defaultModCDPExtensionPath,
    extensionIdFromManifestKey,
    prepareUnpackedExtension,
)


class CLIExtensionInjector(ExtensionInjector):
    def __init__(self, options=None) -> None:
        super().__init__(options)
        self.unpacked_extension_path: str | None = None
        self.extension_id: str | None = None
        self.cleanup_dir: tempfile.TemporaryDirectory[str] | None = None

    def prepare(self) -> None:
        extension_path = self.config.injector_cli_extension_path or defaultModCDPExtensionPath()
        if not extension_path or self.unpacked_extension_path:
            super().prepare()
            return
        self.update({"injector_cli_extension_path": extension_path})
        self.unpacked_extension_path, self.cleanup_dir = prepareUnpackedExtension(extension_path)
        self._resolveExtensionId()
        super().prepare()

    def configForLauncher(self) -> LauncherConfig | dict:
        if not self.unpacked_extension_path:
            return {}
        return {"launcher_local_extra_args": [f"--load-extension={self.unpacked_extension_path}"]}

    def inject(self) -> ExtensionInjectionResult | None:
        discovered = self._discoverReadyServiceWorker(
            matched_only=self.config.injector_trust_service_worker_target,
        )
        return {**discovered, "source": "cli"} if discovered else None

    def close(self) -> None:
        super().close()
        if self.cleanup_dir:
            self.cleanup_dir.cleanup()
            self.cleanup_dir = None

    def _resolveExtensionId(self) -> str | None:
        if self.extension_id:
            return self.extension_id
        configured_extension_id = self.config.injector_cli_extension_id
        if configured_extension_id:
            self.extension_id = configured_extension_id
        elif self.unpacked_extension_path:
            self.extension_id = extensionIdFromManifestKey(self.unpacked_extension_path)
        if self.extension_id:
            self.update({"injector_cli_extension_id": self.extension_id, "injector_service_worker_extension_id": self.extension_id})
        return self.extension_id
