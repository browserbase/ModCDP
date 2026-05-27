# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/injector/DiscoverExtensionInjector.ts
# - ./go/modcdp/injector/DiscoverExtensionInjector.go
from __future__ import annotations

from ..injector.ExtensionInjector import (
    ExtensionInjector,
    ExtensionInjectionResult,
    InjectorConfig,
)
from ..injector.NodeExtensionFiles import (
    PreparedExtension,
    extensionIdFromManifestKey,
    prepareUnpackedExtension,
)


class DiscoverExtensionInjector(ExtensionInjector):
    def __init__(self, config: InjectorConfig | dict | None = None) -> None:
        config = config.model_dump() if isinstance(config, InjectorConfig) else dict(config or {})
        super().__init__({**config, "injector_mode": "discover"})
        self.prepared_extension: PreparedExtension | None = None

    def prepare(self) -> None:
        extension_path = self.config.injector_discover_extension_path
        if not self.config.injector_service_worker_extension_id and extension_path:
            manifest_path = extension_path
            if extension_path.endswith(".zip"):
                self.prepared_extension = prepareUnpackedExtension(extension_path)
                manifest_path = self.prepared_extension.unpacked_extension_path
            self.service_worker_extension_id = extensionIdFromManifestKey(manifest_path)
        super().prepare()

    def inject(self) -> ExtensionInjectionResult | None:
        discovered = self._discoverReadyServiceWorker()
        if discovered:
            discovered.source = "discover"
            return discovered
        if self.config.injector_trust_service_worker_target:
            waited = self._waitForReadyServiceWorker(
                self.config.injector_service_worker_probe_timeout_ms,
                matched_only=True,
            )
            if waited:
                waited.source = "discover"
                return waited
        if not self.config.injector_require_service_worker_target:
            return None
        waited = self._waitForReadyServiceWorker(
            self.config.injector_service_worker_ready_timeout_ms,
            matched_only=self.config.injector_trust_service_worker_target,
        )
        if waited:
            waited.source = "discover"
            return waited
        matchers = ", ".join(
            [
                *self.config.injector_service_worker_url_includes,
                *self.config.injector_service_worker_url_suffixes,
            ]
        )
        raise RuntimeError(f"Required ModCDP service worker target was not visible ({matchers or 'no matcher'}).")

    def close(self) -> None:
        super().close()
        if self.prepared_extension:
            self.prepared_extension.cleanup()
            self.prepared_extension = None
