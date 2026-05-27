# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/types/modcdp.ts
# - ./go/modcdp/types/types.go
from __future__ import annotations

from collections.abc import Callable, Mapping
from queue import Queue
from typing import Literal, Protocol, TypeAlias, TypeGuard

from pydantic import BaseModel, ConfigDict, Field


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
RuntimeCallFunctionOnParams: TypeAlias = dict[str, object]
CdpMessage: TypeAlias = dict[str, object]


def _isObjectMap(value: object) -> TypeGuard[dict[str, object]]:
    return isinstance(value, dict) and all(isinstance(key, str) for key in value)


class ModCDPModel(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, validate_assignment=True)

    def __getitem__(self, key: str) -> object:
        return getattr(self, key)

    def __setitem__(self, key: str, value: object) -> None:
        setattr(self, key, value)

    def __contains__(self, key: object) -> bool:
        return isinstance(key, str) and key in self.model_fields_set

    def get(self, key: str, default: object = None) -> object:
        value = getattr(self, key, default)
        return default if value is None else value

    def __eq__(self, other: object) -> bool:
        if isinstance(other, Mapping):
            return self.model_dump(exclude_none=True, by_alias=True) == dict(other)
        return super().__eq__(other)


class RuntimeBindingCalledEvent(ModCDPModel):
    name: str
    payload: str
    executionContextId: int | None = None


class TargetAttachedToTargetEvent(ModCDPModel):
    sessionId: str
    targetInfo: dict[str, str]
    waitingForDebugger: bool


class ModCDPAddCustomCommandParams(ModCDPModel):
    name: str
    expression: str | None = None
    params_schema: ModCDPPayloadSchemaSpec | None = None
    result_schema: ModCDPPayloadSchemaSpec | None = None


class ModCDPAddCustomEventObjectParams(ModCDPModel):
    name: str
    event_schema: ModCDPPayloadSchemaSpec | None = None


ModCDPAddCustomEventParams: TypeAlias = str | ModCDPAddCustomEventObjectParams


class ModCDPAddMiddlewareParams(ModCDPModel):
    phase: Literal["request", "response", "event"]
    expression: str
    name: str | None = None


class ModCDPEvaluateParams(ModCDPModel):
    expression: str
    params: dict[str, object] | None = None
    cdpSessionId: str | None = None


class ModCDPPingParams(ModCDPModel):
    sent_at: int | float | None = None


class ModCDPPongEvent(ModCDPModel):
    sent_at: int | float
    received_at: int | float
    from_: str = Field(alias="from")


class ModCDPPingLatency(ModCDPModel):
    sent_at: int | float
    received_at: int | float | None
    returned_at: int | float
    round_trip_ms: int | float
    service_worker_ms: int | float | None
    return_path_ms: int | float | None


class ModCDPGetTopologyParams(ModCDPModel):
    rootTargetId: str | None = None
    targetId: str | None = None
    active: bool | None = None


class ModCDPTopologyFrame(ModCDPModel):
    targetId: str
    url: str | None = None
    parentFrameId: str | None = None
    outerBackendNodeId: int | None = None


class ModCDPTopologyDomRoot(ModCDPModel):
    kind: Literal["document", "shadow"]
    frameId: str
    outerBackendNodeId: int | None = None
    innerBackendNodeId: int | None = None
    mode: Literal["open", "closed", "user-agent"] | None = None
    executionContextId: int | None = None
    uniqueContextId: str | None = None


class ModCDPTopologyTarget(ModCDPModel):
    model_config = ConfigDict(extra="allow", arbitrary_types_allowed=True, validate_assignment=True)

    targetId: str
    type: str
    title: str | None = None
    url: str | None = None
    attached: bool | None = None
    parentId: str | None = None
    parentFrameId: str | None = None
    sessionId: str | None = None


class ModCDPTopologyExecutionContext(ModCDPModel):
    id: int
    sessionId: str | None
    targetId: str
    world: str
    origin: str | None = None
    name: str | None = None
    uniqueId: str | None = None
    auxData: dict[str, object] | None = None
    frameId: str | None = None


class ModCDPTopology(ModCDPModel):
    objectGroup: str
    rootFrameId: str
    frames: dict[str, ModCDPTopologyFrame]
    roots: dict[str, ModCDPTopologyDomRoot]
    targets: dict[str, ModCDPTopologyTarget]
    contexts: dict[str, ModCDPTopologyExecutionContext]


class ModCDPConnectTiming(ModCDPModel):
    started_at: int
    upstream_mode: str | None
    transport_started_at: int
    transport_connected_at: int
    transport_duration_ms: int
    connected_at: int
    duration_ms: int
    injector_source: str | None = None
    injector_started_at: int | None = None
    injector_completed_at: int | None = None
    injector_duration_ms: int | None = None


class ModCDPCommandTiming(ModCDPModel):
    method: str
    target: str
    started_at: int
    completed_at: int
    duration_ms: int


class ModCDPRawTiming(ModCDPModel):
    method: str
    started_at: int
    completed_at: int
    duration_ms: int


class ModCDPRouterConfig(ModCDPModel):
    router_routes: ModCDPRoutes = Field(default_factory=dict)
    loopback_execution_context_timeout_ms: int = Field(default=10_000, gt=0)


class ModCDPClientConfig(ModCDPModel):
    client_hydrate_aliases: bool = True
    client_mirror_upstream_events: bool = True
    client_cdp_send_timeout_ms: int = Field(default=10_000, gt=0)
    client_event_wait_timeout_ms: int = Field(default=10_000, gt=0)
    client_heartbeat_interval_ms: int = Field(default=250, gt=0)


class ModCDPDownstreamConfig(ModCDPModel):
    downstream_client_timeout_ms: int = Field(default=1_000, gt=0)
    downstream_close_browser_on_disconnect: bool = False


class ModCDPUpstreamConfig(ModCDPModel):
    upstream_mode: Literal["ws"] = "ws"
    upstream_ws_cdp_url: str | None = None
    upstream_ws_connect_error_settle_timeout_ms: int = Field(default=250, gt=0)
    upstream_cdp_send_timeout_ms: int = Field(default=10_000, gt=0)


class ModCDPLauncherConfig(ModCDPModel):
    launcher_mode: Literal["local", "remote", "bb", "none"] = "none"
    launcher_local_executable_path: str | None = None
    launcher_local_user_data_dir: str | None = None
    launcher_remote_cdp_url: str | None = None
    launcher_local_cdp_listen_port: int | None = Field(default=None, ge=0)
    launcher_local_headless: bool | None = None
    launcher_local_sandbox: bool | None = None
    launcher_local_args: list[str] = Field(default_factory=list)
    launcher_local_extra_args: list[str] = Field(default_factory=list)
    launcher_local_loopback_cdp: bool = False
    launcher_local_cleanup_user_data_dir: bool = False
    launcher_local_chrome_ready_timeout_ms: int = Field(default=45_000, gt=0)
    launcher_local_chrome_ready_poll_interval_ms: int = Field(default=100, gt=0)
    launcher_bb_api_key: str | None = None
    launcher_bb_base_url: str = "https://api.browserbase.com"
    launcher_bb_session_id: str | None = None
    launcher_bb_keep_alive: bool = False
    launcher_bb_close_session_on_close: bool | None = None
    launcher_bb_region: str | None = None
    launcher_bb_timeout: int | None = Field(default=None, gt=0)
    launcher_bb_extension_id: str | None = None
    launcher_bb_browser_settings: dict[str, object] = {"viewport": {"width": 1288, "height": 711}}
    launcher_bb_user_metadata: dict[str, object] = Field(default_factory=dict)
    launcher_bb_session_create_params: dict[str, object] = {"userMetadata": {}}


class ModCDPServerConfig(ModCDPModel):
    upstream: ModCDPUpstreamConfig | None = None
    router: ModCDPRouterConfig | None = None
    client_config: ModCDPClientConfig | None = None
    downstream: ModCDPDownstreamConfig | None = None
    server_browser_token: str | None = None
    custom_commands: list[ModCDPAddCustomCommandParams] | None = None
    custom_events: list[ModCDPAddCustomEventObjectParams] | None = None
    custom_middlewares: list[ModCDPAddMiddlewareParams] | None = None


ModCDPConfigureParams: TypeAlias = ModCDPServerConfig
ModCDPCommandParams: TypeAlias = (
    ModCDPEvaluateParams
    | ModCDPGetTopologyParams
    | ModCDPAddCustomCommandParams
    | ModCDPAddCustomEventParams
    | ModCDPAddMiddlewareParams
    | ModCDPConfigureParams
    | ModCDPPingParams
    | dict[str, object]
)


class ModCDPOkResponse(ModCDPModel):
    ok: bool


ModCDPCommandResult: TypeAlias = ModCDPOkResponse | dict[str, JsonValue]
ModCDPEvaluateResponse: TypeAlias = JsonValue
ModCDPGetTopologyResponse: TypeAlias = ModCDPTopology


class ModCDPAddCustomCommandResponse(ModCDPModel):
    name: str
    registered: bool


class ModCDPAddCustomEventResponse(ModCDPModel):
    name: str
    registered: bool


class ModCDPAddMiddlewareResponse(ModCDPModel):
    name: str
    phase: Literal["request", "response", "event"]
    registered: bool


ModCDPConfigureResponse: TypeAlias = Mapping[str, object]
ModCDPPingResponse: TypeAlias = ModCDPOkResponse


class ModCDPBindingPayload(ModCDPModel):
    event: str
    data: object
    cdpSessionId: str | None = None


class TranslatedStep(ModCDPModel):
    method: str
    params: MessageParams | None = None
    sessionId: str | None = None
    unwrap: Literal["runtime", "runtime_json"] | None = None


class TranslatedCommand(ModCDPModel):
    route: str
    target: Literal["direct_cdp", "service_worker"]
    steps: list[TranslatedStep]


class TargetInfo(ModCDPModel):
    targetId: str
    type: str
    url: str


class ExtensionProbe(ModCDPModel):
    extension_id: str | None = None
    target_id: str
    url: str | None = None
    session_id: str


class ExtensionInfo(ExtensionProbe):
    source: str


class UnwrappedModCDPEvent(ModCDPModel):
    event: str
    data: ProtocolPayload | object
    sessionId: str | None


class LaunchedBrowser(ModCDPModel):
    cdp_url: str | None
    close: Callable[[], object]
    loopback_cdp_url: str | None = None
    profile_dir: str | None = None
    browserbase_session_id: str | None = None
    browserbase_session_url: str | None = None
    browserbase_debug_url: str | None = None
    cdp_listen_port: int | None = None


Handler: TypeAlias = Callable[..., object]
PendingEntry: TypeAlias = tuple[str, Queue[CdpMessage]]


class WebSocketLike(Protocol):
    def send(self, payload: str) -> object: ...

    def recv(self) -> str | bytes | None: ...

    def close(self) -> object: ...
