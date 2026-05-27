# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/injector/DiscoverExtensionInjector.ts
# - ./go/modcdp/injector/DiscoverExtensionInjector.go
from __future__ import annotations

import tempfile
from typing import Any

from ..injector.ExtensionInjector import (
    DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS,
    DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS,
    ExtensionInjector,
    ExtensionInjectionResult,
    extensionIdFromManifestKey,
    prepareUnpackedExtension,
)


def _timeout(value: Any, fallback: int) -> int:
    return fallback if value is None else int(value)


class DiscoverExtensionInjector(ExtensionInjector):
    def __init__(self, options=None) -> None:
        super().__init__(options)
        self.cleanup_dir: tempfile.TemporaryDirectory[str] | None = None

    def prepare(self) -> None:
        extension_path = self.options.get("injector_discover_extension_path")
        if not self.options.get("injector_service_worker_extension_id") and extension_path:
            manifest_path = extension_path
            if extension_path.endswith(".zip"):
                manifest_path, self.cleanup_dir = prepareUnpackedExtension(extension_path)
            self.options["injector_service_worker_extension_id"] = extensionIdFromManifestKey(manifest_path)
        super().prepare()

    def inject(self) -> ExtensionInjectionResult | None:
        discovered = self._discoverReadyServiceWorker()
        if discovered:
            return {**discovered, "source": "discover"}
        if self.options.get("injector_trust_service_worker_target"):
            waited = self._waitForReadyServiceWorker(
                _timeout(self.options.get("injector_service_worker_probe_timeout_ms"), DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS),
                matched_only=True,
            )
            if waited:
                return {**waited, "source": "discover"}
        if not self.options.get("injector_require_service_worker_target"):
            return None
        waited = self._waitForReadyServiceWorker(
            _timeout(self.options.get("injector_service_worker_ready_timeout_ms"), DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS),
            matched_only=bool(self.options.get("injector_trust_service_worker_target")),
        )
        if waited:
            return {**waited, "source": "discover"}
        matchers = ", ".join(
            [
                *(self.options.get("injector_service_worker_url_includes") or []),
                *(self.options.get("injector_service_worker_url_suffixes") or []),
            ]
        )
        raise RuntimeError(f"Required ModCDP service worker target was not visible ({matchers or 'no matcher'}).")

    def close(self) -> None:
        super().close()
        if self.cleanup_dir:
            self.cleanup_dir.cleanup()
            self.cleanup_dir = None
