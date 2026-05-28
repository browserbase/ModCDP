# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/transport/UpstreamTransport.ts
# - ./go/modcdp/transport/UpstreamTransport.go
from __future__ import annotations

import json
import threading
from collections.abc import Callable, Mapping
from queue import Empty, Queue
from typing import Any, Literal, TypeAlias, overload

from pydantic import BaseModel

from ..types.modcdp import ModCDPUpstreamConfig, ProtocolPayload, ProtocolResult, _isObjectMap
from ..types.toJSON import modCDPToJSON


UpstreamMode: TypeAlias = Literal["ws"]
UpstreamPeerKind: TypeAlias = Literal["browser_cdp", "modcdp_server"]
UpstreamTransportConfig: TypeAlias = ModCDPUpstreamConfig


class UpstreamTransport:
    upstream_mode: UpstreamMode = "ws"
    peer_kind: UpstreamPeerKind = "browser_cdp"
    url: str | None = None

    def __init__(self, config: UpstreamTransportConfig | dict[str, Any] | None = None) -> None:
        self.config = _upstream_transport_config(config)
        self._next_id = 0
        self._pending: dict[int, tuple[str, Queue[dict[str, Any]]]] = {}
        self._lock = threading.Lock()
        self._recv_listeners: list[Callable[[dict[str, Any]], None]] = []
        self._close_listeners: list[Callable[[Exception], None]] = []
        self._event_listeners: dict[str, list[Callable[[dict[str, Any], str | None, str | None], None]]] = {}

    def connect(self) -> None:
        raise NotImplementedError(f"{type(self).__name__}.connect is not implemented.")

    def update(self, config: UpstreamTransportConfig | dict[str, Any] | None = None) -> "UpstreamTransport":
        incoming = _upstream_transport_config(config)
        self.config = UpstreamTransportConfig.model_validate({**self.config.model_dump(), **incoming.model_dump(exclude_unset=True)})
        return self

    def configForLauncher(self) -> dict[str, Any]:
        return {}

    def close(self) -> None:
        return None

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
        command: dict[str, Any] | str | object,
        params: ProtocolPayload | None = None,
        session_id: str | None = None,
        *,
        timeout_ms: int | None = None,
    ) -> ProtocolResult | None:
        if isinstance(command, dict):
            raise NotImplementedError(f"{type(self).__name__}.send is not implemented.")
        method = _cdp_name(command)
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

    def on(self, event: Any, listener: Callable[[dict[str, Any], str | None, str | None], None]) -> Callable[[], None]:
        event_name = _cdp_event_name(event)

        def typed_listener(payload: dict[str, Any], target_id: str | None, session_id: str | None) -> None:
            listener(_parse_event_payload(event, payload), target_id, session_id)

        listeners = self._event_listeners.setdefault(event_name, [])
        listeners.append(typed_listener)

        removed = False

        def stop() -> None:
            nonlocal removed
            if removed:
                return
            removed = True
            current_listeners = self._event_listeners.get(event_name)
            if current_listeners is None:
                return
            try:
                current_listeners.remove(typed_listener)
            except ValueError:
                return
            if not current_listeners:
                self._event_listeners.pop(event_name, None)

        return stop

    def getTargets(self) -> list[dict[str, Any]]:
        result = self.send("Target.getTargets", {})
        target_infos = result.get("targetInfos") if isinstance(result, dict) else None
        return [target for target in target_infos if _isObjectMap(target)] if isinstance(target_infos, list) else []

    def resolveTargetId(self, params: dict[str, Any] | None = None) -> str | None:
        target_id = (params or {}).get("targetId")
        return target_id if isinstance(target_id, str) and target_id else None

    def createTarget(self, url: str) -> str:
        result = self.send("Target.createTarget", {"url": url})
        target_id = result.get("targetId") if isinstance(result, dict) else None
        if not isinstance(target_id, str) or not target_id:
            raise RuntimeError("Target.createTarget returned no targetId")
        return target_id

    def attachToTarget(self, target_id: str) -> str | None:
        result = self.send("Target.attachToTarget", {"targetId": target_id, "flatten": True})
        session_id = result.get("sessionId") if isinstance(result, dict) else None
        return session_id if isinstance(session_id, str) and session_id else None

    def detachFromTarget(self, session_id: str) -> None:
        self.send("Target.detachFromTarget", {"sessionId": session_id})

    def waitForPeer(self, config: dict[str, Any] | None = None) -> None:
        return None

    def toJSON(self) -> dict[str, object]:
        config = self.config.model_dump(mode="json")
        return modCDPToJSON(
            self,
            {
                "config": config,
                "state": {
                    "pending": len(self._pending),
                    "recv_listeners": len(self._recv_listeners),
                    "close_listeners": len(self._close_listeners),
                    "event_listeners": len(self._event_listeners),
                }
            },
        )

    def _emit_recv(self, message: dict[str, Any]) -> None:
        for listener in list(self._recv_listeners):
            listener(message)

    def _emit_close(self, error: Exception) -> None:
        self._settle_pending(error)
        for listener in list(self._close_listeners):
            listener(error)

    def _settle_pending(self, error: Exception) -> None:
        with self._lock:
            pending = list(self._pending.values())
            self._pending.clear()
        for _, done in pending:
            done.put({"error": {"message": str(error)}})

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
        method = parsed.get("method")
        params = parsed.get("params")
        session_id = parsed.get("sessionId")
        if isinstance(method, str):
            event_params = params if isinstance(params, dict) else {}
            self._emit_upstream_event(method, event_params, None, session_id if isinstance(session_id, str) else None)
        self._emit_recv(parsed)

    def _emit_upstream_event(
        self,
        method: str,
        payload: dict[str, Any],
        target_id: str | None,
        session_id: str | None,
    ) -> None:
        for listener in list(self._event_listeners.get(method, [])):
            listener(payload, target_id, session_id)
def _upstream_transport_config(config: UpstreamTransportConfig | dict[str, Any] | None = None) -> UpstreamTransportConfig:
    if isinstance(config, UpstreamTransportConfig):
        return config
    return UpstreamTransportConfig.model_validate(config or {})


def _cdp_name(command: object) -> str:
    if isinstance(command, str):
        return command
    meta_fn = getattr(command, "meta", None)
    meta = meta_fn() if callable(meta_fn) else None
    candidates = (
        getattr(command, "cdp_command_name", None),
        getattr(command, "id", None),
        getattr(meta, "cdp_command_name", None) if meta is not None else None,
        meta.get("cdp_command_name") if isinstance(meta, Mapping) else None,
        meta.get("id") if isinstance(meta, Mapping) else None,
        getattr(command, "name", None),
    )
    name = next((candidate for candidate in candidates if isinstance(candidate, str) and candidate), None)
    if name is None:
        raise TypeError("command must be a CDP method string or generated command object")
    return name


def _cdp_event_name(event: object) -> str:
    if isinstance(event, str):
        return event
    meta_fn = getattr(event, "meta", None)
    meta = meta_fn() if callable(meta_fn) else None
    candidates = (
        getattr(event, "cdp_event_name", None),
        getattr(meta, "cdp_event_name", None) if meta is not None else None,
        meta.get("cdp_event_name") if isinstance(meta, Mapping) else None,
        getattr(event, "id", None),
        getattr(meta, "id", None) if meta is not None else None,
        meta.get("id") if isinstance(meta, Mapping) else None,
        getattr(event, "name", None),
    )
    name = next((candidate for candidate in candidates if isinstance(candidate, str) and candidate), None)
    if name is None:
        raise TypeError("event must be a CDP event name string or generated event object")
    return name


def _parse_event_payload(event: object, payload: dict[str, Any]) -> dict[str, Any]:
    if isinstance(event, type) and issubclass(event, BaseModel):
        parsed = event.model_validate(payload)
        return parsed.model_dump(mode="json", exclude_none=True, by_alias=True)
    return payload
