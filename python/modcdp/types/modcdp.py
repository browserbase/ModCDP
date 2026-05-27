# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/types/modcdp.ts
# - ./go/modcdp/types/types.go
from __future__ import annotations

from collections.abc import Callable, Mapping
from queue import Queue
from typing import Any, Literal, Protocol, TypeAlias, TypedDict, TypeGuard

from typing_extensions import NotRequired

JsonPrimitive: TypeAlias = None | bool | int | float | str
JsonValue: TypeAlias = JsonPrimitive | list["JsonValue"] | dict[str, "JsonValue"]
JsonObject: TypeAlias = dict[str, JsonValue]
ModCDPPayloadSchemaSpec: TypeAlias = object

CdpCommandParams: TypeAlias = dict[str, object]
CdpCommandResult: TypeAlias = dict[str, object]
CdpEventParams: TypeAlias = dict[str, object]

ProtocolParams: TypeAlias = Mapping[str, object]
ProtocolResult: TypeAlias = Mapping[str, object]
ProtocolPayload: TypeAlias = Mapping[str, object]
MessageParams: TypeAlias = Mapping[str, object]
ModCDPRoutes: TypeAlias = dict[str, str]


def _isObjectMap(value: object) -> TypeGuard[dict[str, object]]:
    return isinstance(value, dict) and all(isinstance(key, str) for key in value)


class RuntimeBindingCalledEvent(TypedDict, total=False):
    name: str
    payload: str
    executionContextId: int | None


class _TargetAttachedToTargetRequired(TypedDict):
    sessionId: str
    targetInfo: dict[str, str]
    waitingForDebugger: bool


class TargetAttachedToTargetEvent(_TargetAttachedToTargetRequired):
    pass


class _ModCDPAddCustomCommandRequired(TypedDict):
    name: str


class ModCDPAddCustomCommandParams(_ModCDPAddCustomCommandRequired, total=False):
    expression: str | None
    params_schema: ModCDPPayloadSchemaSpec
    result_schema: ModCDPPayloadSchemaSpec


class _ModCDPAddCustomEventObjectRequired(TypedDict):
    name: str


class ModCDPAddCustomEventObjectParams(_ModCDPAddCustomEventObjectRequired, total=False):
    event_schema: ModCDPPayloadSchemaSpec


ModCDPAddCustomEventParams: TypeAlias = str | ModCDPAddCustomEventObjectParams


class _ModCDPAddMiddlewareRequired(TypedDict):
    phase: Literal["request", "response", "event"]
    expression: str


class ModCDPAddMiddlewareParams(_ModCDPAddMiddlewareRequired, total=False):
    name: str


class _ModCDPEvaluateParamsRequired(TypedDict):
    expression: str


class ModCDPEvaluateParams(_ModCDPEvaluateParamsRequired, total=False):
    params: dict[str, JsonValue] | None
    cdpSessionId: str | None


class ModCDPPingParams(TypedDict, total=False):
    sent_at: int


ModCDPPongEvent = TypedDict("ModCDPPongEvent", {"sent_at": int, "received_at": int, "from": str})


class ModCDPPingLatency(TypedDict):
    sent_at: int
    received_at: int | float | None
    returned_at: int
    round_trip_ms: int
    service_worker_ms: int | float | None
    return_path_ms: int | float | None


class ModCDPGetTopologyParams(TypedDict, total=False):
    rootTargetId: str | None
    targetId: str | None
    active: bool | None


class _ModCDPTopologyFrameRequired(TypedDict):
    targetId: str


class ModCDPTopologyFrame(_ModCDPTopologyFrameRequired, total=False):
    url: str | None
    parentFrameId: str | None
    outerBackendNodeId: int | None


class _ModCDPTopologyDomRootRequired(TypedDict):
    kind: Literal["document", "shadow"]
    frameId: str


class ModCDPTopologyDomRoot(_ModCDPTopologyDomRootRequired, total=False):
    outerBackendNodeId: int | None
    innerBackendNodeId: int | None
    mode: Literal["open", "closed", "user-agent"] | None
    executionContextId: int | None
    uniqueContextId: str | None


class _ModCDPTopologyTargetRequired(TypedDict):
    targetId: str
    type: str


class ModCDPTopologyTarget(_ModCDPTopologyTargetRequired, total=False):
    title: str
    url: str
    attached: bool
    parentId: str
    parentFrameId: str
    sessionId: str | None


class _ModCDPTopologyExecutionContextRequired(TypedDict):
    id: int
    sessionId: str | None
    targetId: str
    world: str


class ModCDPTopologyExecutionContext(_ModCDPTopologyExecutionContextRequired, total=False):
    origin: str
    name: str
    uniqueId: str
    auxData: dict[str, object]
    frameId: str | None


class ModCDPTopology(TypedDict):
    objectGroup: str
    rootFrameId: str
    frames: dict[str, ModCDPTopologyFrame]
    roots: dict[str, ModCDPTopologyDomRoot]
    targets: dict[str, ModCDPTopologyTarget]
    contexts: dict[str, ModCDPTopologyExecutionContext]


class ModCDPConnectTiming(TypedDict):
    started_at: int
    upstream_mode: str | None
    transport_started_at: int
    transport_connected_at: int
    transport_duration_ms: int
    injector_source: NotRequired[str | None]
    injector_started_at: NotRequired[int]
    injector_completed_at: NotRequired[int]
    injector_duration_ms: NotRequired[int]
    connected_at: int
    duration_ms: int


class ModCDPCommandTiming(TypedDict):
    method: str
    target: str
    started_at: int
    completed_at: int
    duration_ms: int


class ModCDPRawTiming(TypedDict):
    method: str
    started_at: int
    completed_at: int
    duration_ms: int


class ModCDPRouterConfig(TypedDict, total=False):
    router_routes: ModCDPRoutes
    loopback_execution_context_timeout_ms: int


class ModCDPClientConfig(TypedDict, total=False):
    client_hydrate_aliases: bool
    client_mirror_upstream_events: bool
    client_cdp_send_timeout_ms: int
    client_event_wait_timeout_ms: int
    client_heartbeat_interval_ms: int


class ModCDPDownstreamConfig(TypedDict, total=False):
    downstream_client_timeout_ms: int
    downstream_close_browser_on_disconnect: bool


class ModCDPServerConfig(TypedDict, total=False):
    upstream: dict[str, JsonValue]
    router: ModCDPRouterConfig
    client_config: ModCDPClientConfig
    downstream: ModCDPDownstreamConfig
    server_browser_token: str | None
    custom_commands: list[ModCDPAddCustomCommandParams]
    custom_events: list[ModCDPAddCustomEventObjectParams]
    custom_middlewares: list[ModCDPAddMiddlewareParams]


ModCDPConfigureParams: TypeAlias = ModCDPServerConfig
ModCDPCommandParams: TypeAlias = (
    ModCDPEvaluateParams
    | ModCDPGetTopologyParams
    | ModCDPAddCustomCommandParams
    | ModCDPAddCustomEventParams
    | ModCDPAddMiddlewareParams
    | ModCDPConfigureParams
    | ModCDPPingParams
    | dict[str, JsonValue]
)


class ModCDPOkResponse(TypedDict):
    ok: bool


ModCDPCommandResult: TypeAlias = ModCDPOkResponse | dict[str, JsonValue]
ModCDPEvaluateResponse: TypeAlias = JsonValue
ModCDPGetTopologyResponse: TypeAlias = ModCDPTopology


class ModCDPAddCustomCommandResponse(TypedDict):
    name: str
    registered: bool


class ModCDPAddCustomEventResponse(TypedDict):
    name: str
    registered: bool


class ModCDPAddMiddlewareResponse(TypedDict):
    name: str
    phase: Literal["request", "response", "event"]
    registered: bool


ModCDPConfigureResponse: TypeAlias = Mapping[str, object]
ModCDPPingResponse: TypeAlias = ModCDPOkResponse


class ModCDPBindingPayload(TypedDict):
    event: str
    data: object
    cdpSessionId: NotRequired[str | None]


RuntimeCallFunctionOnParams: TypeAlias = dict[str, object]


class CdpDebuggeeCommandParams(TypedDict, total=False):
    debuggee: dict[str, JsonValue] | None
    tabId: int | None
    targetId: str | None
    extensionId: str | None


class _TranslatedStepRequired(TypedDict):
    method: str


class TranslatedStep(_TranslatedStepRequired, total=False):
    params: MessageParams
    sessionId: str | None
    unwrap: Literal["runtime", "runtime_json"]


class TranslatedCommand(TypedDict):
    route: str
    target: Literal["direct_cdp", "service_worker"]
    steps: list[TranslatedStep]


class CdpError(TypedDict, total=False):
    code: int | None
    message: str
    data: JsonValue


class CdpMessage(TypedDict, total=False):
    id: int
    method: str
    params: MessageParams
    sessionId: str
    result: ProtocolResult
    error: CdpError


class TargetInfo(TypedDict):
    targetId: str
    type: str
    url: str


class ExtensionProbe(TypedDict):
    extension_id: str
    target_id: str
    url: str
    session_id: str


class ExtensionInfo(ExtensionProbe):
    source: str


class UnwrappedModCDPEvent(TypedDict):
    event: str
    data: ProtocolPayload | object
    sessionId: str | None


Handler: TypeAlias = Callable[[Any], Any]
PendingEntry: TypeAlias = tuple[str, Queue[CdpMessage]]


class WebSocketLike(Protocol):
    def send(self, payload: str) -> object: ...

    def recv(self) -> str | bytes | None: ...

    def close(self) -> object: ...
