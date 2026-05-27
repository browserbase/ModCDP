# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/router/AutoSessionRouter.ts
# - ./go/modcdp/router/AutoSessionRouter.go
from __future__ import annotations

import threading
from collections.abc import Callable, Mapping
from typing import Any


SendCDP = Callable[[str, dict[str, Any], str | None], dict[str, Any]]


class AutoSessionRouter:
    def __init__(self, send: SendCDP, defaultExecutionContextTimeoutMs: Callable[[], int], config: dict[str, Any] | None = None) -> None:
        self.config = config or {}
        self.send = send
        self.defaultExecutionContextTimeoutMs = defaultExecutionContextTimeoutMs
        self.sessionId_from_targetId: dict[str, str] = {}
        self.targetId_from_sessionId: dict[str, str] = {}
        self.targets: dict[str, dict[str, Any]] = {}
        self.contexts: dict[str, dict[str, Any]] = {}
        self._execution_context_waiters: dict[str, list[tuple[threading.Event, dict[str, Any], Callable[[dict[str, Any]], bool]]]] = {}
        self._lock = threading.RLock()

    def attachToTarget(self, target_id: str) -> str | None:
        with self._lock:
            session_id = self.sessionId_from_targetId.get(target_id)
        if session_id is not None:
            return session_id
        result = self.send("Target.attachToTarget", {"targetId": target_id, "flatten": True}, None)
        session_id = result.get("sessionId")
        if isinstance(session_id, str) and session_id:
            with self._lock:
                self._recordTargetSession(target_id, session_id, self.targets.get(target_id))
            return session_id
        return None

    def recordProtocolEvent(self, method: str, data: object, session_id: str | None) -> None:
        event_data = dict(data) if isinstance(data, Mapping) else {}
        if method == "Target.attachedToTarget":
            attached_session_id = event_data.get("sessionId") if isinstance(event_data.get("sessionId"), str) else session_id
            raw_target_info = event_data.get("targetInfo")
            target_info = dict(raw_target_info) if isinstance(raw_target_info, Mapping) else None
            target_id = target_info.get("targetId") if target_info else None
            if isinstance(attached_session_id, str) and isinstance(target_id, str) and target_info:
                with self._lock:
                    self._recordTargetSession(target_id, attached_session_id, target_info)
        elif method == "Target.targetInfoChanged":
            raw_target_info = event_data.get("targetInfo")
            if isinstance(raw_target_info, Mapping):
                with self._lock:
                    self._recordTarget(dict(raw_target_info))
        elif method == "Target.targetDestroyed":
            target_id = event_data.get("targetId")
            if isinstance(target_id, str):
                self._forgetTarget(target_id)
        elif method == "Runtime.executionContextCreated":
            raw_context = event_data.get("context")
            context = dict(raw_context) if isinstance(raw_context, Mapping) else None
            context_id = context.get("id") if context else None
            if session_id and isinstance(context_id, int) and context is not None:
                self._recordExecutionContext(None, session_id, context)
        elif method == "Runtime.executionContextDestroyed":
            context_id = event_data.get("executionContextId")
            if session_id and isinstance(context_id, int):
                self._forgetExecutionContextById(session_id, context_id)
        elif method == "Runtime.executionContextsCleared":
            if session_id:
                self._forgetExecutionContextsForRoute(session_id)
        elif method == "Page.frameNavigated":
            raw_frame = event_data.get("frame")
            frame = dict(raw_frame) if isinstance(raw_frame, Mapping) else {}
            frame_id = frame.get("id")
            target_id = self.targetId_from_sessionId.get(session_id) if session_id else None
            if isinstance(frame_id, str):
                self._forgetExecutionContextsForFrame(session_id, target_id, frame_id)
        elif method == "Page.frameDetached":
            frame_id = event_data.get("frameId")
            target_id = self.targetId_from_sessionId.get(session_id) if session_id else None
            if isinstance(frame_id, str):
                self._forgetExecutionContextsForFrame(session_id, target_id, frame_id)
        elif method == "Target.detachedFromTarget":
            detached_session_id = event_data.get("sessionId") if isinstance(event_data.get("sessionId"), str) else session_id
            if isinstance(detached_session_id, str):
                self._forgetSession(detached_session_id)

    def waitForExecutionContext(self, session_id: str | None, timeout_ms: int | None = None) -> int:
        effective_timeout_ms = timeout_ms if timeout_ms is not None else self.defaultExecutionContextTimeoutMs()
        if not session_id:
            raise RuntimeError("Cannot wait for a Runtime execution context without a session.")
        with self._lock:
            for context in self.contexts.values():
                if context.get("sessionId") == session_id and isinstance(context.get("id"), int):
                    return int(context["id"])
            event = threading.Event()
            result: dict[str, Any] = {}
            self._execution_context_waiters.setdefault(session_id, []).append((event, result, lambda context: context.get("sessionId") == session_id))
        if not event.wait(effective_timeout_ms / 1000):
            with self._lock:
                waiters = self._execution_context_waiters.get(session_id, [])
                remaining_waiters = [item for item in waiters if item[0] is not event]
                if remaining_waiters:
                    self._execution_context_waiters[session_id] = remaining_waiters
                else:
                    self._execution_context_waiters.pop(session_id, None)
            raise RuntimeError(f"Timed out waiting for Runtime.executionContextCreated for session {session_id}.")
        error = result.get("error")
        if isinstance(error, BaseException):
            raise error
        return result["context_id"]

    def _recordTarget(self, target_info: Mapping[str, Any]) -> None:
        target_id = target_info.get("targetId")
        if not isinstance(target_id, str):
            return
        session_id = self.sessionId_from_targetId.get(target_id)
        existing = self.targets.get(target_id)
        target = {**dict(target_info)}
        if session_id is not None:
            target["sessionId"] = session_id
        elif existing and existing.get("sessionId") is None:
            target["sessionId"] = None
        self.targets[target_id] = target

    def _recordTargetSession(self, target_id: str, session_id: str, target_info: Mapping[str, Any] | None) -> None:
        self.sessionId_from_targetId[target_id] = session_id
        self.targetId_from_sessionId[session_id] = target_id
        target = {**dict(target_info or self.targets.get(target_id) or {"targetId": target_id, "type": "page"})}
        target["targetId"] = target_id
        target["sessionId"] = session_id
        self.targets[target_id] = target

    def _recordExecutionContext(self, event_target_id: str | None, session_id: str | None, context: Mapping[str, Any]) -> None:
        with self._lock:
            target_id = event_target_id or (self.targetId_from_sessionId.get(session_id) if session_id else None)
            if target_id is None:
                return
            context_id = int(context["id"])
            aux_data = context.get("auxData") if isinstance(context.get("auxData"), Mapping) else {}
            frame_id = aux_data.get("frameId") if isinstance(aux_data.get("frameId"), str) else None
            context_name = context.get("name") if isinstance(context.get("name"), str) else ""
            aux_type = aux_data.get("type")
            world = (
                "piercer"
                if context_name == "__modcdp_piercer__"
                else "main"
                if aux_type == "default"
                else context_name or str(aux_type or "isolated")
            )
            topology_context = {
                **dict(context),
                "id": context_id,
                "sessionId": session_id,
                "targetId": target_id,
                "frameId": frame_id,
                "world": world,
            }
            context_key = self._contextKey(target_id, session_id, context_id, context.get("uniqueId"))
            self.contexts[context_key] = topology_context
            waiter_key = session_id or target_id
            waiters = self._execution_context_waiters.get(waiter_key, [])
            matched_waiters = [item for item in waiters if item[2](topology_context)]
            remaining_waiters = [item for item in waiters if item not in matched_waiters]
            if remaining_waiters:
                self._execution_context_waiters[waiter_key] = remaining_waiters
            else:
                self._execution_context_waiters.pop(waiter_key, None)
        for event, result, _matches in matched_waiters:
            result["context_id"] = context_id
            event.set()

    def _forgetTarget(self, target_id: str) -> None:
        with self._lock:
            session_id = self.sessionId_from_targetId.get(target_id)
            self.targets.pop(target_id, None)
        if session_id:
            self._forgetSession(session_id)
        self._forgetExecutionContextsForRoute(target_id)

    def _forgetSession(self, session_id: str) -> None:
        with self._lock:
            target_id = self.targetId_from_sessionId.pop(session_id, None)
            if target_id is not None:
                self.sessionId_from_targetId.pop(target_id, None)
            self._forgetExecutionContextsForRoute(session_id)
            waiters = self._execution_context_waiters.pop(session_id, [])
        error = RuntimeError(f"Runtime execution context wait cancelled because session {session_id} detached.")
        for event, result, _matches in waiters:
            result["error"] = error
            event.set()

    def _forgetExecutionContextById(self, route_key: str, context_id: int) -> None:
        with self._lock:
            for context_key, context in list(self.contexts.items()):
                if (context.get("sessionId") == route_key or context.get("targetId") == route_key) and context.get("id") == context_id:
                    self.contexts.pop(context_key, None)

    def _forgetExecutionContextsForRoute(self, route_key: str) -> None:
        for context_key, context in list(self.contexts.items()):
            if context.get("sessionId") == route_key or context.get("targetId") == route_key:
                self.contexts.pop(context_key, None)

    def _forgetExecutionContextsForFrame(self, session_id: str | None, target_id: str | None, frame_id: str) -> None:
        with self._lock:
            for context_key, context in list(self.contexts.items()):
                if context.get("frameId") != frame_id:
                    continue
                if session_id is not None and context.get("sessionId") == session_id:
                    self.contexts.pop(context_key, None)
                elif target_id is not None and context.get("targetId") == target_id:
                    self.contexts.pop(context_key, None)

    def _contextKey(self, target_id: str, session_id: str | None, context_id: int, unique_id: object) -> str:
        return unique_id if isinstance(unique_id, str) else f"{session_id or target_id}:{context_id}"
