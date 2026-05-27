# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/translate/translate.ts
# - ./go/modcdp/translate/translate.go
"""Pure ModCDP <-> CDP translation helpers for the Python client."""

import json

from ..types.modcdp import (
    ModCDPBindingPayload,
    ModCDPRoutes,
    ProtocolParams,
    ProtocolPayload,
    ProtocolResult,
    RuntimeCallFunctionOnParams,
    TranslatedCommand,
    TranslatedStep,
    UnwrappedModCDPEvent,
    _isObjectMap,
)

UPSTREAM_EVENT_BINDING_NAME = "__ModCDP_event_from_upstream__"
CUSTOM_EVENT_BINDING_NAME = "__ModCDP_custom_event__"

DEFAULT_CLIENT_ROUTES: ModCDPRoutes = {
    "Mod.*": "service_worker",
    "Custom.*": "service_worker",
    "*.*": "service_worker",
}


def route_for(method: str, routes: ModCDPRoutes | None = None) -> str:
    routes = routes or {}
    if method in routes:
        return routes[method]
    best_prefix_len = -1
    best_route = None
    for pattern, route in routes.items():
        if pattern == "*.*" or not pattern.endswith(".*"):
            continue
        prefix = pattern[:-1]
        if method.startswith(prefix) and len(prefix) > best_prefix_len:
            best_prefix_len = len(prefix)
            best_route = route
    if best_route is not None:
        return best_route
    if "*.*" in routes:
        return routes["*.*"]
    return "direct_cdp"


def _optional_string(params: ProtocolParams, name: str) -> str | None:
    value = params.get(name)
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError(f"{name} must be a string")
    return value


def _object_or_empty(value: object | None) -> dict[str, object]:
    return value if _isObjectMap(value) else {}


def _call_function_params(function_declaration: str) -> RuntimeCallFunctionOnParams:
    return {
        "functionDeclaration": function_declaration,
        "awaitPromise": True,
        "returnByValue": True,
    }


def _wrap_custom_command(method: str, params: ProtocolParams, session_id: str | None) -> RuntimeCallFunctionOnParams:
    runtime_params = _call_function_params(
        "async function(method, paramsJson, cdpSessionId) { "
        "return JSON.stringify(await globalThis.ModCDP.handleCommand(method, JSON.parse(paramsJson), cdpSessionId)); "
        "}"
    )
    runtime_params["arguments"] = [{"value": method}, {"value": json.dumps(params)}, {"value": session_id}]
    return runtime_params


def _wrap_service_worker_command(
    method: str,
    params: ProtocolParams,
    cdp_session_id: str | None = None,
) -> list[TranslatedStep]:
    return [
        TranslatedStep(
            method="Runtime.callFunctionOn",
            params=_wrap_custom_command(method, params, _optional_string(params, "cdpSessionId") or cdp_session_id),
            unwrap="runtime_json",
        )
    ]


def wrap_command_if_needed(
    method: str,
    params: ProtocolParams | None = None,
    *,
    routes: ModCDPRoutes | None = None,
    cdp_session_id: str | None = None,
) -> TranslatedCommand:
    params = params or {}
    route = route_for(method, routes or DEFAULT_CLIENT_ROUTES)
    if route == "direct_cdp":
        step = TranslatedStep(method=method, params=params)
        if cdp_session_id:
            step.sessionId = cdp_session_id
        return TranslatedCommand(route=route, target="direct_cdp", steps=[step])
    if route == "service_worker":
        return TranslatedCommand(
            route=route,
            target="service_worker",
            steps=_wrap_service_worker_command(method, params, cdp_session_id),
        )
    raise RuntimeError(f"Unsupported client route '{route}' for {method}")


def _unwrap_evaluate_response(result: ProtocolResult) -> object:
    if result.get("exceptionDetails"):
        ex = _object_or_empty(result.get("exceptionDetails"))
        exception = _object_or_empty(ex.get("exception"))
        description = exception.get("description")
        text = ex.get("text")
        msg = (
            description
            if isinstance(description, str)
            else text
            if isinstance(text, str)
            else "Runtime.evaluate failed"
        )
        raise RuntimeError(msg)
    inner = _object_or_empty(result.get("result"))
    return inner.get("value")


def unwrap_response_if_needed(result: ProtocolResult, unwrap: str | None = None) -> object:
    if unwrap == "runtime_json":
        value = _unwrap_evaluate_response(result)
        return json.loads(value) if isinstance(value, str) else value
    return _unwrap_evaluate_response(result) if unwrap == "runtime" else (result or {})


def unwrap_event_if_needed(
    method: str,
    params: ProtocolParams,
    session_id: str | None = None,
    our_session_id: str | None = None,
) -> UnwrappedModCDPEvent | None:
    if method != "Runtime.bindingCalled":
        return None
    binding_name = params.get("name")
    if not isinstance(binding_name, str):
        return None
    raw_payload = params.get("payload")
    if not isinstance(raw_payload, str):
        return None
    try:
        parsed: object = json.loads(raw_payload)
    except json.JSONDecodeError:
        return None
    if not _isObjectMap(parsed):
        return None
    payload: ProtocolPayload = parsed
    is_upstream_event_binding = binding_name == UPSTREAM_EVENT_BINDING_NAME
    is_custom_event_binding = binding_name == CUSTOM_EVENT_BINDING_NAME
    if not is_upstream_event_binding and not is_custom_event_binding:
        return None
    payload_event = payload.get("event")
    if not isinstance(payload_event, str) or not payload_event:
        payload_event = None
    if payload_event is None:
        return None
    resolved_event = payload_event
    if resolved_event == UPSTREAM_EVENT_BINDING_NAME or resolved_event == CUSTOM_EVENT_BINDING_NAME:
        return None
    data = payload["data"] if "data" in payload else payload
    raw_source_session_id = payload.get("cdpSessionId")
    source_session_id = raw_source_session_id if isinstance(raw_source_session_id, str) else session_id
    return UnwrappedModCDPEvent(event=resolved_event, data=data, sessionId=source_session_id)


def encode_binding_payload(payload: ModCDPBindingPayload) -> str:
    return json.dumps(
        {
            "event": payload["event"],
            "data": payload.get("data"),
            "cdpSessionId": payload.get("cdpSessionId"),
        },
        separators=(",", ":"),
    )
