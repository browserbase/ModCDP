from __future__ import annotations

import json
import threading
from typing import Any

from ..transport.UpstreamTransport import UpstreamTransport, UpstreamTransportOptions


class PipeUpstreamTransport(UpstreamTransport):
    upstream_mode = "pipe"

    def __init__(self, options: UpstreamTransportOptions | None = None) -> None:
        super().__init__(options)
        options = options or {}
        self.pipe_read = options.get("upstream_pipe_read")
        self.pipe_write = options.get("upstream_pipe_write")
        self._read_thread: threading.Thread | None = None

    def update(self, config: dict[str, Any] | None = None) -> "PipeUpstreamTransport":
        config = config or {}
        self.pipe_read = config.get("upstream_pipe_read") or self.pipe_read
        self.pipe_write = config.get("upstream_pipe_write") or self.pipe_write
        return self

    def configForLauncher(self) -> dict[str, Any]:
        return {"launcher_local_cdp_transport": "pipe"}

    def connect(self) -> None:
        if self.pipe_read is None or self.pipe_write is None:
            raise RuntimeError("upstream.upstream_mode=pipe requires launcher-provided CDP pipe handles.")
        if self._read_thread is not None:
            return
        self._read_thread = threading.Thread(target=self._read_loop, daemon=True)
        self._read_thread.start()

    def send(self, message: dict[str, Any]) -> None:
        if self._read_thread is None or self.pipe_write is None:
            raise RuntimeError("CDP pipe is not connected.")
        self.pipe_write.write(json.dumps(message).encode() + b"\0")
        self.pipe_write.flush()

    def close(self) -> None:
        self._read_thread = None
        for pipe in (self.pipe_read, self.pipe_write):
            try:
                if pipe is not None:
                    pipe.close()
            except Exception:
                pass

    def _read_loop(self) -> None:
        read_thread = threading.current_thread()
        buffer = b""
        try:
            while self._read_thread is read_thread and self.pipe_read is not None:
                chunk = self.pipe_read.read(1)
                if not chunk:
                    if self._read_thread is read_thread:
                        self._handle_close(RuntimeError("CDP pipe closed"))
                    break
                buffer += chunk
                if b"\0" not in buffer:
                    continue
                raw, buffer = buffer.split(b"\0", 1)
                if raw:
                    self._parse_and_emit_recv(raw)
        except Exception as error:
            if self._read_thread is read_thread:
                self._handle_close(error if isinstance(error, Exception) else Exception(str(error)))

    def _handle_close(self, error: Exception) -> None:
        self._read_thread = None
        self._emit_close(error)
