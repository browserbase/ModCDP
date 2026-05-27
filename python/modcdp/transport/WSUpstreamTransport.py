# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/transport/WSUpstreamTransport.ts
# - ./go/modcdp/transport/WSUpstreamTransport.go
from __future__ import annotations

import json
import threading
from typing import Any, overload

from websocket import create_connection

from ..launcher.BrowserLauncher import resolveCdpWebSocketUrl
from ..transport.UpstreamTransport import UpstreamTransport, UpstreamTransportConfig
from ..types.modcdp import ProtocolPayload, ProtocolResult


class WSUpstreamTransport(UpstreamTransport):
    upstream_mode = "ws"

    def __init__(self, config: UpstreamTransportConfig | dict[str, Any] | None = None) -> None:
        super().__init__(config)
        self.url = self.config.upstream_ws_cdp_url or ""
        self.ws: Any | None = None
        self._reader_thread: threading.Thread | None = None
        self._generation = 0
        self._connect_lock = threading.Lock()

    def update(self, config: UpstreamTransportConfig | dict[str, Any] | None = None) -> "WSUpstreamTransport":
        super().update(config)
        if self.config.upstream_ws_cdp_url:
            self.url = self.config.upstream_ws_cdp_url
        return self

    def connect(self) -> None:
        with self._connect_lock:
            if self.ws is not None:
                return
            if not self.url:
                raise RuntimeError("WSUpstreamTransport requires upstream_ws_cdp_url or launcher-provided cdp_url.")
            # cdp_url may start as an HTTP discovery endpoint; from here on it is the resolved WebSocket CDP endpoint.
            self.url = resolveCdpWebSocketUrl(self.url, "upstream_ws_cdp_url")
            self.config = UpstreamTransportConfig.model_validate({**self.config.model_dump(), "upstream_ws_cdp_url": self.url})
            self._generation += 1
            generation = self._generation
            self.ws = create_connection(self.url, timeout=10)
            self._reader_thread = threading.Thread(target=lambda: self._read_loop(generation), daemon=True)
            self._reader_thread.start()

    @overload
    def send(
        self,
        command: str,
        params: ProtocolPayload | None = None,
        session_id: str | None = None,
        *,
        timeout_ms: int | None = None,
    ) -> ProtocolResult: ...

    @overload
    def send(
        self,
        command: dict[str, Any],
        params: ProtocolPayload | None = None,
        session_id: str | None = None,
        *,
        timeout_ms: int | None = None,
    ) -> None: ...

    def send(
        self,
        command: dict[str, Any] | str,
        params: ProtocolPayload | None = None,
        session_id: str | None = None,
        *,
        timeout_ms: int | None = None,
    ) -> ProtocolResult | None:
        if isinstance(command, str):
            if self.ws is None:
                self.connect()
            return super().send(command, params, session_id, timeout_ms=timeout_ms)
        message = command
        if self.ws is None:
            raise RuntimeError("CDP websocket is not connected.")
        self.ws.send(json.dumps(message))
        return None

    def _recv(self) -> Any:
        if self.ws is None:
            raise RuntimeError("CDP websocket is not connected.")
        return self.ws.recv()

    def close(self) -> None:
        self._generation += 1
        had_connection = self.ws is not None
        if self.ws is not None:
            self.ws.close()
        self.ws = None
        if had_connection:
            self._settle_pending(RuntimeError("CDP websocket closed"))
        if self._reader_thread is not None and self._reader_thread.is_alive():
            self._reader_thread.join(timeout=1)
        self._reader_thread = None

    def toJSON(self) -> dict[str, object]:
        json_value = super().toJSON()
        state_raw = json_value.get("state")
        state: dict[str, object] = {str(key): value for key, value in state_raw.items()} if isinstance(state_raw, dict) else {}
        state["connected"] = self.ws is not None
        return {**json_value, "state": state}

    def _read_loop(self, generation: int | None = None) -> None:
        generation = self._generation if generation is None else generation
        ws = self.ws
        if ws is None:
            return
        try:
            while self.ws is ws and self._generation == generation:
                raw = ws.recv()
                if not raw:
                    break
                self._parse_and_emit_recv(raw)
        except Exception as error:
            if self.ws is ws and self._generation == generation:
                self._emit_close(error if isinstance(error, Exception) else RuntimeError(str(error)))
