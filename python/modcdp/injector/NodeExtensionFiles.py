# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/injector/NodeExtensionFiles.ts
# - ./go/modcdp/injector/NodeExtensionFiles.go
from __future__ import annotations

import base64
import hashlib
import json
import shutil
import tempfile
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path


@dataclass
class PreparedExtension:
    unpacked_extension_path: str
    cleanup: Callable[[], None]


def defaultModCDPExtensionPath() -> str:
    return str(Path(__file__).resolve().parent.parent / "extension.zip")


def prepareUnpackedExtension(extension_path: str) -> PreparedExtension:
    cleanup_dir = tempfile.TemporaryDirectory(prefix="modcdp-extension-")
    try:
        if extension_path.endswith(".zip"):
            with zipfile.ZipFile(extension_path) as archive:
                _extract_zip(archive, cleanup_dir.name)
        else:
            shutil.copytree(extension_path, cleanup_dir.name, dirs_exist_ok=True)
        return PreparedExtension(
            unpacked_extension_path=_extension_root(cleanup_dir.name),
            cleanup=cleanup_dir.cleanup,
        )
    except BaseException:
        cleanup_dir.cleanup()
        raise


def extensionIdFromManifestKey(extension_path: str) -> str | None:
    manifest_path = Path(extension_path) / "manifest.json"
    if not manifest_path.exists():
        return None
    manifest = json.loads(manifest_path.read_text())
    key = _first_string(manifest.get("key") if isinstance(manifest, dict) else None)
    if not key:
        return None
    digest = hashlib.sha256(base64.b64decode(key)).digest()[:16]
    alphabet = "abcdefghijklmnop"
    return "".join(alphabet[byte >> 4] + alphabet[byte & 0x0F] for byte in digest)


def _first_string(*values: object) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _extension_root(unpacked_path: str) -> str:
    if (Path(unpacked_path) / "manifest.json").exists():
        return unpacked_path
    nested_path = Path(unpacked_path) / "extension"
    if (nested_path / "manifest.json").exists():
        return str(nested_path)
    return unpacked_path


def _extract_zip(archive: zipfile.ZipFile, destination: str) -> None:
    root = Path(destination).resolve()
    for member in archive.infolist():
        target = (root / member.filename).resolve()
        if target != root and root not in target.parents:
            raise RuntimeError(f'zip entry "{member.filename}" escapes extension extraction directory')
    archive.extractall(destination)
