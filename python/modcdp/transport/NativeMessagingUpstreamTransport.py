from __future__ import annotations

import json
import struct
import sys
import threading
from pathlib import Path
from collections.abc import Mapping
from typing import Any

from ..transport.UpstreamTransport import UpstreamTransport


DEFAULT_UPSTREAM_NATIVEMESSAGING_HOST_NAME = "com.modcdp.bridge"


class NativeMessagingUpstreamTransport(UpstreamTransport):
    mode = "nativemessaging"
    endpoint_kind = "modcdp_server"

    def __init__(self, options: Mapping[str, Any] | None = None) -> None:
        super().__init__()
        normalized_options = dict(options or {})
        self.upstream_nativemessaging_host_name = str(normalized_options.get("upstream_nativemessaging_host_name") or DEFAULT_UPSTREAM_NATIVEMESSAGING_HOST_NAME)
        self.url = f"native://{self.upstream_nativemessaging_host_name}"
        self.connected = False
        self._closed = False
        self._reader: threading.Thread | None = None

    def update(self, config: dict[str, Any] | None = None) -> "NativeMessagingUpstreamTransport":
        return self

    def getServerConfig(self) -> dict[str, Any]:
        return {}

    def getInjectorConfig(self) -> dict[str, Any]:
        return {"upstream_nativemessaging_host_name": self.upstream_nativemessaging_host_name}

    def connect(self) -> None:
        if self.connected:
            return
        self.connected = True
        self._closed = False
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()

    def send(self, message: dict[str, Any]) -> None:
        if not self.connected:
            raise RuntimeError(f"Native messaging stdio is not connected for {self.upstream_nativemessaging_host_name}.")
        _write_length_prefixed_json(sys.stdout.buffer, message)

    def waitForPeer(self) -> None:
        if not self.connected:
            raise RuntimeError(f"Native messaging stdio is not connected for {self.upstream_nativemessaging_host_name}.")

    def close(self) -> None:
        self._closed = True
        self.connected = False

    def _read_loop(self) -> None:
        try:
            for message in _read_length_prefixed_json_messages(sys.stdin.buffer):
                if self._closed:
                    return
                self._emit_recv(message)
        except Exception as error:
            if not self._closed:
                self._emit_close(error if isinstance(error, Exception) else Exception(str(error)))

def default_native_messaging_manifest_paths(upstream_nativemessaging_host_name: str, home: str | None = None) -> list[str]:
    home = home or str(Path.home())
    if sys.platform == "darwin":
        return [
            f"{home}/Library/Application Support/Google/Chrome/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/Library/Application Support/Google/ChromeForTesting/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/Library/Application Support/Google/Chrome SxS/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/Library/Application Support/Chromium/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
        ]
    if sys.platform.startswith("linux"):
        return [
            f"{home}/.config/google-chrome/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/.config/google-chrome-for-testing/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/.config/chromium/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/.config/chromium-browser/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
        ]
    if sys.platform.startswith("win"):
        return [str(Path(home) / ".modcdp" / "native-messaging" / f"{upstream_nativemessaging_host_name}.json")]
    raise RuntimeError("Native messaging host manifest path discovery is not supported on this platform.")


def _write_length_prefixed_json(stream: Any, message: dict[str, Any]) -> None:
    body = json.dumps(message).encode()
    stream.write(struct.pack("<I", len(body)) + body)
    stream.flush()


def _read_exact(source: Any, length: int) -> bytes:
    chunks: list[bytes] = []
    remaining = length
    while remaining > 0:
        chunk = source.read(remaining)
        if not chunk:
            raise RuntimeError("native messaging stdin closed")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def _read_length_prefixed_json_messages(source: Any):
    while True:
        header = _read_exact(source, 4)
        length = struct.unpack("<I", header)[0]
        body = _read_exact(source, length)
        message = json.loads(body.decode())
        if isinstance(message, dict):
            yield message
