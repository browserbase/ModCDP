# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/injector/BBExtensionInjector.ts
# - ./go/modcdp/injector/BBExtensionInjector.go
from __future__ import annotations

import json
import os
import tempfile
import urllib.error
import urllib.request
import uuid
import zipfile
from pathlib import Path

from ..launcher.BrowserLauncher import LauncherConfig
from ..injector.ExtensionInjector import ExtensionInjector, ExtensionInjectionResult, InjectorConfig

class BBExtensionInjector(ExtensionInjector):
    def __init__(self, config: InjectorConfig | dict | None = None) -> None:
        config = config.model_dump() if isinstance(config, InjectorConfig) else dict(config or {})
        super().__init__({**config, "injector_mode": "bb"})
        self.extension_id: str | None = None
        self.zip_path: str | None = None
        self.cleanup_dir: tempfile.TemporaryDirectory[str] | None = None

    def prepare(self) -> None:
        configured_extension_id = _first_string(self.config.injector_bb_extension_id)
        if configured_extension_id:
            self.extension_id = configured_extension_id
            return
        if self.extension_id:
            return
        extension_path = self.config.injector_bb_extension_path
        if not extension_path:
            return
        self.update({"injector_bb_extension_path": extension_path})
        self.zip_path = extension_path if extension_path.endswith(".zip") else self._zipExtensionDir(extension_path)
        try:
            self.extension_id = self._uploadExtension(self.zip_path)
            self.update({"injector_bb_extension_id": self.extension_id})
        except Exception:
            self.close()
            raise

    def configForLauncher(self) -> LauncherConfig | dict:
        return {
            **dict(super().configForLauncher()),
            "launcher_bb_extension_id": self.extension_id or self.config.injector_bb_extension_id,
        }

    def inject(self) -> ExtensionInjectionResult | None:
        discovered = self._waitForReadyServiceWorker(
            self.config.injector_service_worker_ready_timeout_ms,
            matched_only=self.config.injector_trust_service_worker_target,
        )
        if discovered is None:
            return None
        discovered.source = "bb"
        return discovered

    def close(self) -> None:
        if self.cleanup_dir:
            self.cleanup_dir.cleanup()
            self.cleanup_dir = None

    def _zipExtensionDir(self, extension_path: str) -> str:
        self.cleanup_dir = tempfile.TemporaryDirectory(prefix="modcdp-bb-extension-")
        zip_path = str(Path(self.cleanup_dir.name) / "extension.zip")
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path in Path(extension_path).rglob("*"):
                if path.is_file():
                    archive.write(path, path.relative_to(extension_path))
        return zip_path

    def _uploadExtension(self, zip_path: str) -> str:
        browserbase_api_key = _first_string(self.config.injector_bb_api_key, os.environ.get("BROWSERBASE_API_KEY"))
        if not browserbase_api_key:
            raise RuntimeError("BBExtensionInjector requires BROWSERBASE_API_KEY or injector.injector_bb_api_key.")
        base_url = self.config.injector_bb_base_url
        boundary = f"----modcdp-{uuid.uuid4().hex}"
        zip_bytes = Path(zip_path).read_bytes()
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{Path(zip_path).name}"\r\n'
            "Content-Type: application/zip\r\n\r\n"
        ).encode() + zip_bytes + f"\r\n--{boundary}--\r\n".encode()
        request = urllib.request.Request(
            f"{base_url.rstrip('/')}/v1/extensions",
            data=body,
            method="POST",
            headers={
                "X-BB-API-Key": browserbase_api_key,
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
        )
        try:
            with urllib.request.urlopen(request) as response:
                payload = json.loads(response.read())
        except urllib.error.HTTPError as error:
            error_text = error.read().decode(errors="replace")
            raise RuntimeError(f"Browserbase POST /v1/extensions -> {error.code}{f': {error_text}' if error_text else ''}") from error
        extension_id = payload.get("id") if isinstance(payload, dict) else None
        if not isinstance(extension_id, str) or not extension_id:
            raise RuntimeError(f"Browserbase extension upload returned no id (got {payload})")
        return extension_id


def _first_string(*values: object) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None
