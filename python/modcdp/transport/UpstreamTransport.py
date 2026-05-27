# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/transport/UpstreamTransport.ts
# - ./go/modcdp/transport/UpstreamTransport.go
from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any, Literal, TypedDict, cast


UpstreamMode = Literal["ws"]


class UpstreamTransportOptions(TypedDict, total=False):
    upstream_mode: UpstreamMode
    upstream_ws_cdp_url: str | None
    upstream_ws_connect_error_settle_timeout_ms: int | None
    upstream_cdp_send_timeout_ms: int | None


class UpstreamTransport:
    upstream_mode: UpstreamMode = "ws"
    url: str | None = None

    def __init__(self, options: UpstreamTransportOptions | None = None) -> None:
        options = cast(UpstreamTransportOptions, dict(options or {}))
        self.upstream_ws_cdp_url = options.get("upstream_ws_cdp_url")
        self.upstream_ws_connect_error_settle_timeout_ms = options.get("upstream_ws_connect_error_settle_timeout_ms")
        self.upstream_cdp_send_timeout_ms = options.get("upstream_cdp_send_timeout_ms") or 10_000
        self._recv_listeners: list[Callable[[dict[str, Any]], None]] = []
        self._close_listeners: list[Callable[[Exception], None]] = []

    def connect(self) -> None:
        raise NotImplementedError(f"{type(self).__name__}.connect is not implemented.")

    def update(self, config: dict[str, Any] | None = None) -> "UpstreamTransport":
        config = config or {}
        self.upstream_ws_cdp_url = config.get("upstream_ws_cdp_url") or self.upstream_ws_cdp_url
        self.upstream_ws_connect_error_settle_timeout_ms = config.get("upstream_ws_connect_error_settle_timeout_ms") or self.upstream_ws_connect_error_settle_timeout_ms
        self.upstream_cdp_send_timeout_ms = config.get("upstream_cdp_send_timeout_ms") or self.upstream_cdp_send_timeout_ms
        return self

    def configForLauncher(self) -> dict[str, Any]:
        return {}

    def configForInjector(self) -> dict[str, Any]:
        return {}

    def configForServer(self) -> dict[str, Any]:
        return {}

    def close(self) -> None:
        return None

    def send(self, message: dict[str, Any]) -> None:
        raise NotImplementedError(f"{type(self).__name__}.send is not implemented.")

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
        for listener in list(self._close_listeners):
            listener(error)

    def _parse_and_emit_recv(self, data: str | bytes) -> None:
        try:
            raw = data.decode() if isinstance(data, bytes) else data
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                self._emit_recv(parsed)
        except Exception:
            return
