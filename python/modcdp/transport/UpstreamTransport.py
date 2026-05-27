# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/transport/UpstreamTransport.ts
# - ./go/modcdp/transport/UpstreamTransport.go
from __future__ import annotations

import json
import threading
from collections.abc import Callable
from queue import Empty, Queue
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict
from ..types.modcdp import ProtocolPayload, ProtocolResult


UpstreamMode = Literal["ws"]


class UpstreamTransportConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True)

    upstream_mode: UpstreamMode = "ws"
    upstream_ws_cdp_url: str | None = None
    upstream_ws_connect_error_settle_timeout_ms: int = 250
    upstream_cdp_send_timeout_ms: int = 10_000


class UpstreamTransport:
    upstream_mode: UpstreamMode = "ws"
    url: str | None = None

    def __init__(self, config: UpstreamTransportConfig | dict[str, Any] | None = None) -> None:
        self.config = _upstream_transport_config(config)
        self._next_id = 0
        self._pending: dict[int, tuple[str, Queue[dict[str, Any]]]] = {}
        self._lock = threading.Lock()
        self._recv_listeners: list[Callable[[dict[str, Any]], None]] = []
        self._close_listeners: list[Callable[[Exception], None]] = []

    def connect(self) -> None:
        raise NotImplementedError(f"{type(self).__name__}.connect is not implemented.")

    def update(self, config: UpstreamTransportConfig | dict[str, Any] | None = None) -> "UpstreamTransport":
        incoming = _upstream_transport_config(config)
        self.config = UpstreamTransportConfig.model_validate({**self.config.model_dump(), **incoming.model_dump(exclude_unset=True)})
        return self

    def configForLauncher(self) -> dict[str, Any]:
        return {}

    def configForServer(self) -> dict[str, Any]:
        return {}

    def close(self) -> None:
        return None

    def send(
        self,
        command: dict[str, Any] | str,
        params: ProtocolPayload | None = None,
        session_id: str | None = None,
        *,
        timeout_ms: int | None = None,
    ) -> ProtocolResult | None:
        if isinstance(command, dict):
            raise NotImplementedError(f"{type(self).__name__}.send is not implemented.")
        method = command
        effective_timeout_ms = timeout_ms if timeout_ms is not None else self.config.upstream_cdp_send_timeout_ms
        with self._lock:
            self._next_id += 1
            msg_id = self._next_id
            done: Queue[dict[str, Any]] = Queue()
            self._pending[msg_id] = (method, done)
        message: dict[str, Any] = {"id": msg_id, "method": method, "params": params or {}}
        if session_id:
            message["sessionId"] = session_id
        try:
            self.send(message)
        except Exception:
            with self._lock:
                self._pending.pop(msg_id, None)
            raise
        try:
            response = done.get(timeout=effective_timeout_ms / 1000 if effective_timeout_ms > 0 else None)
        except Empty:
            with self._lock:
                self._pending.pop(msg_id, None)
            raise RuntimeError(f"{method} timed out after {effective_timeout_ms}ms")
        err = response.get("error")
        if err:
            raise RuntimeError(f"{method} failed: {err.get('message', err) if isinstance(err, dict) else err}")
        result = response.get("result")
        return result if isinstance(result, dict) else {}

    def onRecv(self, listener: Callable[[dict[str, Any]], None]) -> Callable[[], None]:
        self._recv_listeners.append(listener)

        removed = False

        def stop() -> None:
            nonlocal removed
            if removed:
                return
            removed = True
            try:
                self._recv_listeners.remove(listener)
            except ValueError:
                return

        return stop

    def onClose(self, listener: Callable[[Exception], None]) -> Callable[[], None]:
        self._close_listeners.append(listener)

        removed = False

        def stop() -> None:
            nonlocal removed
            if removed:
                return
            removed = True
            try:
                self._close_listeners.remove(listener)
            except ValueError:
                return

        return stop

    def waitForPeer(self) -> None:
        return None

    def _emit_recv(self, message: dict[str, Any]) -> None:
        for listener in list(self._recv_listeners):
            listener(message)

    def _emit_close(self, error: Exception) -> None:
        with self._lock:
            pending = list(self._pending.values())
            self._pending.clear()
        for _, done in pending:
            done.put({"error": {"message": str(error)}})
        for listener in list(self._close_listeners):
            listener(error)

    def _parse_and_emit_recv(self, data: str | bytes) -> None:
        raw = data.decode() if isinstance(data, bytes) else data
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return
        if isinstance(parsed.get("id"), int):
            with self._lock:
                entry = self._pending.pop(parsed["id"], None)
            if entry:
                entry[1].put(parsed)
            self._emit_recv(parsed)
            return
        self._emit_recv(parsed)


def _upstream_transport_config(config: UpstreamTransportConfig | dict[str, Any] | None = None) -> UpstreamTransportConfig:
    if isinstance(config, UpstreamTransportConfig):
        return config
    return UpstreamTransportConfig.model_validate(config or {})
