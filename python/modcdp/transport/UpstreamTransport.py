from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any, Literal, TypedDict


UpstreamMode = Literal["ws", "pipe", "nativemessaging", "reversews", "nats", "chromedebugger"]


class UpstreamTransportOptions(TypedDict, total=False):
    upstream_mode: UpstreamMode
    upstream_ws_cdp_url: str | None
    upstream_pipe_read: Any
    upstream_pipe_write: Any
    upstream_nats_url: str | None
    upstream_nats_subject_prefix: str | None
    upstream_nats_role: str | None
    upstream_nats_wait_timeout_ms: int | None
    upstream_reversews_bind: str | None
    upstream_reversews_wait_timeout_ms: int | None
    upstream_nativemessaging_host_name: str | None
    upstream_ws_connect_error_settle_timeout_ms: int | None
    upstream_cdp_send_timeout_ms: int | None


class UpstreamTransport:
    upstream_mode: UpstreamMode = "ws"
    url: str | None = None

    def __init__(self, options: UpstreamTransportOptions | None = None) -> None:
        options = options or {}
        self.upstream_ws_cdp_url = options.get("upstream_ws_cdp_url")
        self.upstream_nats_url = options.get("upstream_nats_url")
        self.upstream_nats_subject_prefix = options.get("upstream_nats_subject_prefix")
        self.upstream_nats_wait_timeout_ms = options.get("upstream_nats_wait_timeout_ms")
        self.upstream_reversews_bind = options.get("upstream_reversews_bind")
        self.upstream_reversews_wait_timeout_ms = options.get("upstream_reversews_wait_timeout_ms")
        self.upstream_nativemessaging_host_name = options.get("upstream_nativemessaging_host_name")
        self.upstream_ws_connect_error_settle_timeout_ms = options.get("upstream_ws_connect_error_settle_timeout_ms")
        self.upstream_cdp_send_timeout_ms = options.get("upstream_cdp_send_timeout_ms") or 10_000
        self._recv_listeners: list[Callable[[dict[str, Any]], None]] = []
        self._close_listeners: list[Callable[[Exception], None]] = []

    def connect(self) -> None:
        raise NotImplementedError(f"{type(self).__name__}.connect is not implemented.")

    def update(self, config: dict[str, Any] | None = None) -> "UpstreamTransport":
        config = config or {}
        self.upstream_ws_cdp_url = config.get("upstream_ws_cdp_url") or self.upstream_ws_cdp_url
        self.upstream_nats_url = config.get("upstream_nats_url") or self.upstream_nats_url
        self.upstream_nats_subject_prefix = config.get("upstream_nats_subject_prefix") or self.upstream_nats_subject_prefix
        self.upstream_nats_wait_timeout_ms = config.get("upstream_nats_wait_timeout_ms") or self.upstream_nats_wait_timeout_ms
        self.upstream_reversews_bind = config.get("upstream_reversews_bind") or self.upstream_reversews_bind
        self.upstream_reversews_wait_timeout_ms = config.get("upstream_reversews_wait_timeout_ms") or self.upstream_reversews_wait_timeout_ms
        self.upstream_nativemessaging_host_name = config.get("upstream_nativemessaging_host_name") or self.upstream_nativemessaging_host_name
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
