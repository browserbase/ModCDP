# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/router/AutoSessionRouter.ts
# - ./go/modcdp/router/AutoSessionRouter.go
from __future__ import annotations

import threading
from collections.abc import Callable, Mapping
from typing import Any


SendCDP = Callable[[str, dict[str, Any], str | None], dict[str, Any]]
targetAutoAttachParams = {"autoAttach": True, "waitForDebuggerOnStart": False, "flatten": True}
browserLevelDomains = {"Browser", "Target", "SystemInfo"}


class AutoSessionRouter:
    def __init__(self, send: SendCDP, defaultExecutionContextTimeoutMs: Callable[[], int], config: dict[str, Any] | None = None) -> None:
        self.config = {
            "router_routes": {},
            "loopback_execution_context_timeout_ms": defaultExecutionContextTimeoutMs(),
            **(config or {}),
        }
        self._send = send
        self.defaultExecutionContextTimeoutMs = defaultExecutionContextTimeoutMs
        self.sessionId_from_targetId: dict[str, str] = {}
        self.targetId_from_sessionId: dict[str, str] = {}
        self.targets: dict[str, dict[str, Any]] = {}
        self.contexts: dict[str, dict[str, Any]] = {}
        self._execution_context_waiters: dict[str, list[tuple[threading.Event, dict[str, Any], Callable[[dict[str, Any]], bool]]]] = {}
        self._lock = threading.RLock()

    def start(self) -> None:
        self._send("Target.setAutoAttach", targetAutoAttachParams, None)
        self._send("Target.setDiscoverTargets", {"discover": True}, None)

    def stop(self) -> None:
        return None

    def send(self, method: str, params: dict[str, Any] | None = None, requested_session_id: str | None = None) -> dict[str, Any]:
        command_params = dict(params or {})
        domain = method.split(".", 1)[0]
        if requested_session_id is not None:
            target_id = self.targetId_from_sessionId.get(requested_session_id)
            if target_id is None:
                raise RuntimeError(f"No target is recorded for sessionId={requested_session_id}.")
            routed_params = (
                self._callFunctionOnParamsForRoute(command_params, target_id, requested_session_id)
                if method == "Runtime.callFunctionOn"
                else command_params
            )
            return self._send(method, routed_params, requested_session_id)
        if domain in browserLevelDomains:
            return self._send(method, command_params, None)
        target_id = self._resolveTargetId(command_params)
        target_id, session_id = self.ensureRouteForTarget(target_id)
        routed_params = (
            self._callFunctionOnParamsForRoute(command_params, target_id, session_id)
            if method == "Runtime.callFunctionOn"
            else command_params
        )
        return self._send(method, routed_params, session_id)

    def attachToTarget(self, target_id: str) -> str | None:
        with self._lock:
            session_id = self.sessionId_from_targetId.get(target_id)
        if session_id is not None:
            return session_id
        result = self._send("Target.attachToTarget", {"targetId": target_id, "flatten": True}, None)
        session_id = result.get("sessionId")
        if isinstance(session_id, str) and session_id:
            with self._lock:
                self._recordTargetSession(target_id, session_id, self.targets.get(target_id))
            return session_id
        return None

    def ensureSessionForTarget(self, target_id: str) -> str:
        _target_id, session_id = self.ensureRouteForTarget(target_id)
        if session_id is None:
            raise RuntimeError(f"Upstream attached targetId={target_id} without a CDP session id.")
        return session_id

    def ensureRouteForTarget(self, target_id: str | None) -> tuple[str, str | None]:
        resolved_target_id = target_id or self._resolveTargetId({})
        if resolved_target_id is not None:
            session_id = self.sessionId_from_targetId.get(resolved_target_id)
            if session_id is not None:
                return resolved_target_id, session_id
            target = self.targets.get(resolved_target_id)
            if target and target.get("sessionId") is None:
                return resolved_target_id, None
        if resolved_target_id is None:
            created = self._send("Target.createTarget", {"url": "about:blank#modcdp"}, None)
            created_target_id = created.get("targetId")
            if not isinstance(created_target_id, str) or not created_target_id:
                raise RuntimeError("Target.createTarget returned no targetId")
            resolved_target_id = created_target_id
        session_id = self.attachToTarget(resolved_target_id)
        if session_id is None:
            self._recordTargetSessionlessAttachment(resolved_target_id)
            return resolved_target_id, None
        return resolved_target_id, session_id

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
        if not session_id:
            raise RuntimeError("Cannot wait for a Runtime execution context without a session.")
        return int(self._waitForExecutionContextMatching(lambda context: context.get("sessionId") == session_id, session_id, timeout_ms)["id"])

    def ensureExecutionContext(self, frame: Mapping[str, str], selector: Mapping[str, str] | None = None) -> dict[str, Any]:
        selected = {"world": "main", **dict(selector or {})}
        frame_id = frame["frameId"]
        target_id = frame["targetId"]
        route_target_id, session_id = self.ensureRouteForTarget(target_id)
        existing = self._findExecutionContext(route_target_id, session_id, frame_id, selected)
        if existing is not None:
            return existing
        self._send("Runtime.enable", {}, session_id)
        if selected["world"] in ("isolated", "piercer"):
            created = self._send(
                "Page.createIsolatedWorld",
                {
                    "frameId": frame_id,
                    **({"worldName": selected.get("worldName") or "__modcdp_piercer__"} if selected["world"] == "piercer" else {}),
                    "grantUniveralAccess": True,
                },
                session_id,
            )
            created_context = self._findExecutionContext(route_target_id, session_id, frame_id, selected)
            execution_context_id = created.get("executionContextId")
            if created_context and created_context.get("id") == execution_context_id:
                return created_context
            context = {
                "id": execution_context_id,
                "sessionId": session_id,
                "targetId": route_target_id,
                "frameId": frame_id,
                "world": "piercer" if selected["world"] == "piercer" else selected.get("worldName") or "isolated",
                "name": selected.get("worldName"),
            }
            self.contexts[self._contextKey(route_target_id, session_id, int(execution_context_id), None)] = context
            return context
        return self._waitForExecutionContextMatching(
            lambda context: context.get("targetId") == route_target_id
            and context.get("sessionId") == session_id
            and context.get("frameId") == frame_id
            and context.get("world") == selected["world"],
            session_id or route_target_id,
        )

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

    def _recordTargetSessionlessAttachment(self, target_id: str) -> None:
        existing = self.targets.get(target_id)
        self.targets[target_id] = {**existing, "sessionId": None} if existing else {"targetId": target_id, "type": "page", "sessionId": None}

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
            result["context"] = topology_context
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

    def _callFunctionOnParamsForRoute(self, params: Mapping[str, Any], target_id: str, session_id: str | None) -> dict[str, Any]:
        call_params = dict(params)
        if call_params.get("executionContextId") is not None or call_params.get("uniqueContextId") is not None or call_params.get("objectId") is not None:
            return call_params
        context = self._waitForExecutionContextMatching(
            lambda current_context: current_context.get("targetId") == target_id
            and (session_id is None or current_context.get("sessionId") == session_id),
            session_id or target_id,
        )
        call_params["executionContextId"] = context["id"]
        return call_params

    def _findExecutionContext(self, target_id: str, session_id: str | None, frame_id: str, selector: Mapping[str, str]) -> dict[str, Any] | None:
        for context in self.contexts.values():
            if context.get("targetId") != target_id or context.get("frameId") != frame_id:
                continue
            if session_id is not None and context.get("sessionId") != session_id:
                continue
            if selector.get("world") == "piercer" and context.get("world") == "piercer":
                return context
            if selector.get("world") == "isolated" and context.get("name") == selector.get("worldName"):
                return context
            if selector.get("world") == "main" and context.get("world") == "main":
                return context
            if context.get("world") == selector.get("world"):
                return context
        return None

    def _waitForExecutionContextMatching(
        self,
        matches: Callable[[dict[str, Any]], bool],
        waiter_key: str | None,
        timeout_ms: int | None = None,
    ) -> dict[str, Any]:
        effective_timeout_ms = timeout_ms if timeout_ms is not None else self.config.get("loopback_execution_context_timeout_ms", self.defaultExecutionContextTimeoutMs())
        with self._lock:
            for context in self.contexts.values():
                if matches(context):
                    return context
            if not waiter_key:
                raise RuntimeError("Cannot wait for a Runtime execution context without a route.")
            event = threading.Event()
            result: dict[str, Any] = {}
            self._execution_context_waiters.setdefault(waiter_key, []).append((event, result, matches))
        if not event.wait(effective_timeout_ms / 1000):
            with self._lock:
                waiters = self._execution_context_waiters.get(waiter_key, [])
                remaining_waiters = [item for item in waiters if item[0] is not event]
                if remaining_waiters:
                    self._execution_context_waiters[waiter_key] = remaining_waiters
                else:
                    self._execution_context_waiters.pop(waiter_key, None)
            raise RuntimeError(f"Timed out waiting for Runtime.executionContextCreated for route {waiter_key}.")
        error = result.get("error")
        if isinstance(error, BaseException):
            raise error
        return result["context"]

    def _resolveTargetId(self, params: Mapping[str, Any]) -> str | None:
        explicit_target_id = params.get("targetId")
        if isinstance(explicit_target_id, str) and explicit_target_id:
            return explicit_target_id
        target_infos = self._send("Target.getTargets", {}, None).get("targetInfos")
        if isinstance(target_infos, list):
            for raw_target_info in target_infos:
                if isinstance(raw_target_info, Mapping):
                    self._recordTarget(raw_target_info)
            for raw_target_info in target_infos:
                if isinstance(raw_target_info, Mapping) and raw_target_info.get("type") == "page":
                    url = raw_target_info.get("url")
                    if isinstance(url, str) and not url.startswith("devtools://"):
                        target_id = raw_target_info.get("targetId")
                        return target_id if isinstance(target_id, str) else None
        return None

    def _contextKey(self, target_id: str, session_id: str | None, context_id: int, unique_id: object) -> str:
        return unique_id if isinstance(unique_id, str) else f"{session_id or target_id}:{context_id}"
