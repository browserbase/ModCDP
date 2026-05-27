# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/router/AutoSessionRouter.ts
# - ./go/modcdp/router/AutoSessionRouter.go
from __future__ import annotations

import threading
import time
from collections.abc import Callable, Mapping
from typing import Any

from ..translate.translate import DEFAULT_CLIENT_ROUTES
from ..transport.UpstreamTransport import UpstreamTransport
from ..types.CDPTypes import CDPTypes
from ..types.generated.cdp import PageDomain, RuntimeDomain, TargetDomain
from ..types.modcdp import ModCDPRouterConfig, ProtocolParams, ProtocolResult, _isObjectMap
from ..types.toJSON import modCDPToJSON

targetAutoAttachParams = {"autoAttach": True, "waitForDebuggerOnStart": False, "flatten": True}
browserLevelDomains = {"Browser", "Target", "SystemInfo"}
DEFAULT_ROUTER_EXECUTION_CONTEXT_TIMEOUT_MS = 10_000
RouterConfig = ModCDPRouterConfig


class AutoSessionRouter:
    def __init__(
        self,
        upstream: UpstreamTransport,
        types: CDPTypes,
        config: RouterConfig | Mapping[str, Any] | None = None,
    ) -> None:
        raw_config = dict(config.model_dump() if isinstance(config, RouterConfig) else config or {})
        self.config = RouterConfig.model_validate(
            {
                **raw_config,
                "router_routes": {
                    **DEFAULT_CLIENT_ROUTES,
                    **dict(raw_config.get("router_routes") or {}),
                },
            }
        )
        self.upstream = upstream
        self.types = types
        self.sessionId_from_targetId: dict[str, str] = {}
        self.targetId_from_sessionId: dict[str, str] = {}
        self.targets: dict[str, dict[str, Any]] = {}
        self.contexts: dict[str, dict[str, Any]] = {}
        self._execution_context_waiters: dict[str, list[tuple[threading.Event, dict[str, Any], Callable[[dict[str, Any]], bool]]]] = {}
        self._lock = threading.RLock()
        self._subscription_cleanups: list[Callable[[], None]] = []
        self._started = False

    def start(self) -> None:
        if self._started:
            return None
        self._subscription_cleanups = self._listen()
        try:
            self.upstream.send("Target.setAutoAttach", targetAutoAttachParams, None)
            self.upstream.send("Target.setDiscoverTargets", {"discover": True}, None)
        except Exception:
            for cleanup in self._subscription_cleanups:
                cleanup()
            self._subscription_cleanups = []
            raise
        self._started = True

    def stop(self) -> None:
        for cleanup in self._subscription_cleanups:
            cleanup()
        self._subscription_cleanups = []
        self._started = False
        return None

    def _listen(self) -> list[Callable[[], None]]:
        return [
            self.upstream.on(
                TargetDomain.attachedToTarget,
                lambda event, _target_id, session_id: self._recordProtocolEvent(
                    TargetDomain.attachedToTarget.cdp_event_name, event, _target_id, session_id
                ),
            ),
            self.upstream.on(
                TargetDomain.detachedFromTarget,
                lambda event, _target_id, session_id: self._recordProtocolEvent(
                    TargetDomain.detachedFromTarget.cdp_event_name, event, _target_id, session_id
                ),
            ),
            self.upstream.on(
                TargetDomain.targetInfoChanged,
                lambda event, _target_id, session_id: self._recordProtocolEvent(
                    TargetDomain.targetInfoChanged.cdp_event_name, event, _target_id, session_id
                ),
            ),
            self.upstream.on(
                TargetDomain.targetDestroyed,
                lambda event, _target_id, session_id: self._recordProtocolEvent(
                    TargetDomain.targetDestroyed.cdp_event_name, event, _target_id, session_id
                ),
            ),
            self.upstream.on(
                RuntimeDomain.executionContextCreated,
                lambda event, _target_id, session_id: self._recordProtocolEvent(
                    RuntimeDomain.executionContextCreated.cdp_event_name, event, _target_id, session_id
                ),
            ),
            self.upstream.on(
                RuntimeDomain.executionContextDestroyed,
                lambda event, _target_id, session_id: self._recordProtocolEvent(
                    RuntimeDomain.executionContextDestroyed.cdp_event_name, event, _target_id, session_id
                ),
            ),
            self.upstream.on(
                RuntimeDomain.executionContextsCleared,
                lambda event, _target_id, session_id: self._recordProtocolEvent(
                    RuntimeDomain.executionContextsCleared.cdp_event_name, event, _target_id, session_id
                ),
            ),
            self.upstream.on(
                PageDomain.frameNavigated,
                lambda event, _target_id, session_id: self._recordProtocolEvent(
                    PageDomain.frameNavigated.cdp_event_name, event, _target_id, session_id
                ),
            ),
            self.upstream.on(
                PageDomain.frameDetached,
                lambda event, _target_id, session_id: self._recordProtocolEvent(
                    PageDomain.frameDetached.cdp_event_name, event, _target_id, session_id
                ),
            ),
        ]

    def toJSON(self) -> dict[str, object]:
        return modCDPToJSON(
            self,
            {
                "config": {
                    "router_routes": self.config.router_routes,
                    "loopback_execution_context_timeout_ms": self.config.loopback_execution_context_timeout_ms,
                },
                "state": {
                    "started": self._started,
                    "sessions": len(self.sessionId_from_targetId),
                    "targets": len(self.targets),
                    "contexts": len(self.contexts),
                    "execution_context_waiters": len(self._execution_context_waiters),
                },
            },
        )

    def send(self, method: str, params: ProtocolParams | None = None, requested_session_id: str | None = None) -> ProtocolResult:
        if self.types.nativeCommandSchema(method) is None:
            raise RuntimeError(f"AutoSessionRouter cannot route unknown CDP command {method}.")
        command_params = self.types.parseCommandParams(method, params or {})
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
            return _protocol_result(self.types.parseCommandResult(method, self.upstream.send(method, routed_params, requested_session_id)))
        if domain in browserLevelDomains:
            return _protocol_result(self.types.parseCommandResult(method, self.upstream.send(method, command_params, None)))
        target_id = self._resolveTargetId(command_params)
        target_id, session_id = self.ensureRouteForTarget(target_id)
        routed_params = (
            self._callFunctionOnParamsForRoute(command_params, target_id, session_id)
            if method == "Runtime.callFunctionOn"
            else command_params
        )
        return _protocol_result(self.types.parseCommandResult(method, self.upstream.send(method, routed_params, session_id)))

    def attachToTarget(self, target_id: str) -> str | None:
        with self._lock:
            session_id = self.sessionId_from_targetId.get(target_id)
        if session_id is not None:
            return session_id
        session_id = self.upstream.attachToTarget(target_id)
        if session_id:
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
            resolved_target_id = self.upstream.createTarget("about:blank#modcdp")
        session_id = self.attachToTarget(resolved_target_id)
        if session_id is None:
            self._recordTargetSessionlessAttachment(resolved_target_id)
            return resolved_target_id, None
        return resolved_target_id, session_id

    def _recordProtocolEvent(self, method: str, data: object, event_target_id: str | None, session_id: str | None) -> None:
        event_data = data if _isObjectMap(data) else {}
        if method == "Target.attachedToTarget":
            attached_session_id = event_data.get("sessionId") if isinstance(event_data.get("sessionId"), str) else session_id
            raw_target_info = event_data.get("targetInfo")
            target_info = raw_target_info if _isObjectMap(raw_target_info) else None
            target_id = target_info.get("targetId") if target_info else None
            if isinstance(attached_session_id, str) and isinstance(target_id, str) and target_info:
                with self._lock:
                    self._recordTargetSession(target_id, attached_session_id, target_info)
        elif method == "Target.targetInfoChanged":
            raw_target_info = event_data.get("targetInfo")
            if _isObjectMap(raw_target_info):
                with self._lock:
                    self._recordTarget(raw_target_info)
        elif method == "Target.targetDestroyed":
            target_id = event_data.get("targetId")
            if isinstance(target_id, str):
                self._forgetTarget(target_id)
        elif method == "Runtime.executionContextCreated":
            raw_context = event_data.get("context")
            context = raw_context if _isObjectMap(raw_context) else None
            context_id = context.get("id") if context else None
            if (session_id or event_target_id) and isinstance(context_id, int) and context is not None:
                self._recordExecutionContext(event_target_id, session_id, context)
        elif method == "Runtime.executionContextDestroyed":
            context_id = event_data.get("executionContextId")
            if session_id and isinstance(context_id, int):
                self._forgetExecutionContextById(session_id, context_id)
        elif method == "Runtime.executionContextsCleared":
            if session_id:
                self._forgetExecutionContextsForRoute(session_id)
        elif method == "Page.frameNavigated":
            raw_frame = event_data.get("frame")
            frame = raw_frame if _isObjectMap(raw_frame) else {}
            frame_id = frame.get("id")
            target_id = event_target_id or (self.targetId_from_sessionId.get(session_id) if session_id else None)
            if isinstance(frame_id, str):
                self._forgetExecutionContextsForFrame(session_id, target_id, frame_id)
        elif method == "Page.frameDetached":
            frame_id = event_data.get("frameId")
            target_id = event_target_id or (self.targetId_from_sessionId.get(session_id) if session_id else None)
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
        self.upstream.send("Runtime.enable", {}, session_id)
        if selected["world"] in ("isolated", "piercer"):
            created = self.upstream.send(
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
            if not isinstance(execution_context_id, int):
                raise RuntimeError("Page.createIsolatedWorld returned no executionContextId.")
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
            self.contexts[self._contextKey(route_target_id, session_id, execution_context_id, None)] = context
            return context
        return self._waitForExecutionContextMatching(
            lambda context: context.get("targetId") == route_target_id
            and context.get("sessionId") == session_id
            and context.get("frameId") == frame_id
            and context.get("world") == selected["world"],
            session_id or route_target_id,
        )

    def getTopology(self, params: Mapping[str, Any] | None = None) -> dict[str, Any]:
        object_group = f"modcdp-topology-{int(time.time() * 1000)}"
        raw_target_infos = self.upstream.send("Target.getTargets", {}, None).get("targetInfos")
        target_infos = [target for target in raw_target_infos if _isObjectMap(target)] if isinstance(raw_target_infos, list) else []
        for target_info in target_infos:
            self._recordTarget(target_info)
        root_target = self._resolveRootTarget(dict(params or {}), target_infos)
        if root_target is None:
            raise RuntimeError("Mod.getTopology could not resolve a page target.")
        frames: dict[str, dict[str, Any]] = {}
        root_target_id = str(root_target["targetId"])
        _root_route_target_id, root_session_id = self._enableTarget(root_target_id)
        root_tree = self.upstream.send("Page.getFrameTree", {}, root_session_id).get("frameTree")
        if not _isObjectMap(root_tree):
            raise RuntimeError("Page.getFrameTree returned no frameTree.")
        root_frame_id = self._recordFrameTree(root_tree, root_target_id, None, frames)

        oopif_targets = [
            target
            for target in target_infos
            if target.get("type") == "iframe" and isinstance(target.get("parentFrameId"), str) and target.get("targetId") not in frames
        ]
        for target in oopif_targets:
            target_id = str(target["targetId"])
            _route_target_id, session_id = self._enableTarget(target_id)
            frame_tree = self.upstream.send("Page.getFrameTree", {}, session_id).get("frameTree")
            if _isObjectMap(frame_tree):
                self._recordFrameTree(frame_tree, target_id, str(target.get("parentFrameId")), frames)

        for frame_id, frame in list(frames.items()):
            parent_frame_id = frame.get("parentFrameId")
            if not isinstance(parent_frame_id, str):
                continue
            parent = frames.get(parent_frame_id)
            if parent is None:
                continue
            _parent_target_id, parent_session_id = self.ensureRouteForTarget(str(parent["targetId"]))
            owner = self.upstream.send("DOM.getFrameOwner", {"frameId": frame_id}, parent_session_id)
            backend_node_id = owner.get("backendNodeId")
            if isinstance(backend_node_id, int):
                frame["outerBackendNodeId"] = backend_node_id

        contexts: dict[str, dict[str, Any]] = {}
        roots: dict[str, dict[str, Any]] = {}
        for frame_id, frame in list(frames.items()):
            context = self.ensureExecutionContext({"frameId": frame_id, "targetId": str(frame["targetId"])}, {"world": "piercer"})
            contexts[self._contextKey(str(context["targetId"]), context.get("sessionId") if isinstance(context.get("sessionId"), str) else None, int(context["id"]), context.get("uniqueId"))] = context
            evaluate_params: dict[str, Any] = {"expression": "document.documentElement", "objectGroup": object_group}
            if isinstance(context.get("uniqueId"), str):
                evaluate_params["uniqueContextId"] = context["uniqueId"]
            else:
                evaluate_params["contextId"] = context["id"]
            root_object = self.upstream.send("Runtime.evaluate", evaluate_params, context.get("sessionId") if isinstance(context.get("sessionId"), str) else None)
            result = root_object.get("result")
            if not _isObjectMap(result):
                raise RuntimeError("Runtime.evaluate returned no remote object result.")
            object_id = result.get("objectId")
            if not isinstance(object_id, str) or not object_id:
                raise RuntimeError(f"Mod.getTopology could not resolve document root for frameId={frame_id}.")
            described = self.upstream.send("DOM.describeNode", {"objectId": object_id}, context.get("sessionId") if isinstance(context.get("sessionId"), str) else None)
            node = described.get("node")
            if not _isObjectMap(node):
                raise RuntimeError("DOM.describeNode returned no node.")
            roots[object_id] = {
                "kind": "document",
                "frameId": frame_id,
                "outerBackendNodeId": frame.get("outerBackendNodeId"),
                "innerBackendNodeId": node.get("backendNodeId"),
                "executionContextId": context["id"],
                **({"uniqueContextId": context["uniqueId"]} if isinstance(context.get("uniqueId"), str) else {}),
            }

        for target_id in {str(frame["targetId"]) for frame in frames.values()}:
            _route_target_id, session_id = self.ensureRouteForTarget(target_id)
            document = self.upstream.send("DOM.getDocument", {"depth": -1, "pierce": True}, session_id)
            root = document.get("root")
            if _isObjectMap(root):
                self._recordShadowRoots(root, frames, roots, object_group)

        frame_target_ids = {frame.get("targetId") for frame in frames.values()}
        for context in self.contexts.values():
            if context.get("targetId") in frame_target_ids:
                contexts[self._contextKey(str(context["targetId"]), context.get("sessionId") if isinstance(context.get("sessionId"), str) else None, int(context["id"]), context.get("uniqueId"))] = context

        return {
            "objectGroup": object_group,
            "rootFrameId": root_frame_id,
            "frames": frames,
            "roots": roots,
            "targets": {target_id: target for target_id, target in self.targets.items() if any(info.get("targetId") == target_id for info in target_infos)},
            "contexts": contexts,
        }

    def _recordTarget(self, target_info: dict[str, object]) -> None:
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

    def _recordExecutionContext(self, event_target_id: str | None, session_id: str | None, context: dict[str, object]) -> None:
        with self._lock:
            target_id = event_target_id or (self.targetId_from_sessionId.get(session_id) if session_id else None)
            if target_id is None:
                return
            context_id = context.get("id")
            if not isinstance(context_id, int):
                raise RuntimeError("Runtime.executionContextCreated returned no numeric context id.")
            raw_aux_data = context.get("auxData")
            aux_data = raw_aux_data if _isObjectMap(raw_aux_data) else {}
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

    def _resolveRootTarget(self, params: Mapping[str, Any], target_infos: list[dict[str, Any]]) -> dict[str, Any] | None:
        requested_target_id = params.get("rootTargetId") or params.get("targetId")
        if isinstance(requested_target_id, str) and requested_target_id:
            return next((target for target in target_infos if target.get("targetId") == requested_target_id), None)
        return next(
            (
                target
                for target in target_infos
                if target.get("type") == "page" and not (isinstance(target.get("url"), str) and str(target["url"]).startswith("devtools://"))
            ),
            None,
        )

    def _enableTarget(self, target_id: str) -> tuple[str, str | None]:
        route_target_id, session_id = self.ensureRouteForTarget(target_id)
        for method, params in (
            ("Page.enable", {}),
            ("DOM.enable", {}),
            ("Runtime.enable", {}),
            ("Target.setAutoAttach", targetAutoAttachParams),
        ):
            try:
                self.upstream.send(method, params, session_id)
            except Exception:
                if method != "Target.setAutoAttach":
                    raise
        return route_target_id, session_id

    def _recordFrameTree(self, tree: dict[str, object], target_id: str, parent_frame_id: str | None, frames: dict[str, dict[str, Any]]) -> str:
        frame = tree.get("frame")
        if not _isObjectMap(frame):
            raise RuntimeError("frame tree entry is missing frame.")
        frame_id = frame.get("id")
        if not isinstance(frame_id, str):
            raise RuntimeError("frame tree entry is missing frame.id.")
        frames[frame_id] = {
            "targetId": target_id,
            "url": frame.get("url"),
            "parentFrameId": frame.get("parentId") if isinstance(frame.get("parentId"), str) else parent_frame_id,
        }
        child_frames = tree.get("childFrames")
        if isinstance(child_frames, list):
            for child in child_frames:
                if _isObjectMap(child):
                    self._recordFrameTree(child, target_id, frame_id, frames)
        return frame_id

    def _recordShadowRoots(
        self,
        node: dict[str, object],
        frames: dict[str, dict[str, Any]],
        roots: dict[str, dict[str, Any]],
        object_group: str,
        frame_id: str | None = None,
        outer_backend_node_id: int | None = None,
    ) -> None:
        raw_frame_id = node.get("frameId")
        current_frame_id = raw_frame_id if isinstance(raw_frame_id, str) else frame_id
        raw_node_backend_node_id = node.get("backendNodeId")
        node_backend_node_id = raw_node_backend_node_id if isinstance(raw_node_backend_node_id, int) else None
        shadow_roots = node.get("shadowRoots")
        if isinstance(shadow_roots, list):
            for shadow_root in shadow_roots:
                if not _isObjectMap(shadow_root):
                    continue
                if current_frame_id:
                    frame = frames.get(current_frame_id)
                    context = self._findExecutionContext(str(frame["targetId"]), None, current_frame_id, {"world": "piercer"}) if frame else None
                    if frame and context and isinstance(shadow_root.get("backendNodeId"), int):
                        resolved = self.upstream.send(
                            "DOM.resolveNode",
                            {"backendNodeId": shadow_root["backendNodeId"], "executionContextId": context["id"], "objectGroup": object_group},
                            context.get("sessionId") if isinstance(context.get("sessionId"), str) else None,
                        )
                        remote_object = resolved.get("object")
                        if not _isObjectMap(remote_object):
                            raise RuntimeError("DOM.resolveNode returned no remote object.")
                        object_id = remote_object.get("objectId")
                        if isinstance(object_id, str):
                            roots[object_id] = {
                                "kind": "shadow",
                                "frameId": current_frame_id,
                                "outerBackendNodeId": outer_backend_node_id if outer_backend_node_id is not None else node_backend_node_id,
                                "innerBackendNodeId": shadow_root.get("backendNodeId"),
                                "mode": shadow_root.get("shadowRootType"),
                                "executionContextId": context["id"],
                                **({"uniqueContextId": context["uniqueId"]} if isinstance(context.get("uniqueId"), str) else {}),
                            }
                self._recordShadowRoots(shadow_root, frames, roots, object_group, current_frame_id, node_backend_node_id)
        children = node.get("children")
        if isinstance(children, list):
            for child in children:
                if _isObjectMap(child):
                    self._recordShadowRoots(child, frames, roots, object_group, current_frame_id, outer_backend_node_id)
        content_document = node.get("contentDocument")
        if _isObjectMap(content_document):
            raw_content_frame_id = content_document.get("frameId")
            self._recordShadowRoots(
                content_document,
                frames,
                roots,
                object_group,
                raw_content_frame_id if isinstance(raw_content_frame_id, str) else current_frame_id,
                outer_backend_node_id,
            )

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
        effective_timeout_ms = timeout_ms if timeout_ms is not None else self.config.loopback_execution_context_timeout_ms
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
        explicit_target_id = self.upstream.resolveTargetId(dict(params))
        if explicit_target_id:
            return explicit_target_id
        target_infos = self.upstream.getTargets()
        for raw_target_info in target_infos:
            self._recordTarget(raw_target_info)
        for raw_target_info in target_infos:
            if raw_target_info.get("type") == "page":
                url = raw_target_info.get("url")
                if isinstance(url, str) and not url.startswith("devtools://"):
                    target_id = raw_target_info.get("targetId")
                    return target_id if isinstance(target_id, str) else None
        return None

    def _contextKey(self, target_id: str, session_id: str | None, context_id: int, unique_id: object) -> str:
        return unique_id if isinstance(unique_id, str) else f"{session_id or target_id}:{context_id}"


def _protocol_result(value: object) -> ProtocolResult:
    if not isinstance(value, Mapping):
        return {}
    return {str(key): raw_value for key, raw_value in value.items()}
