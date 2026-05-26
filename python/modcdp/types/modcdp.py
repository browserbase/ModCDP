from __future__ import annotations

from collections.abc import Callable, Mapping
from queue import Queue
from typing import Any, Literal, Protocol, TypeAlias, TypedDict

from typing_extensions import NotRequired

JsonPrimitive: TypeAlias = None | bool | int | float | str
JsonValue: TypeAlias = JsonPrimitive | list["JsonValue"] | dict[str, "JsonValue"]
JsonObject: TypeAlias = dict[str, JsonValue]

ProtocolParams: TypeAlias = Mapping[str, JsonValue]
ProtocolResult: TypeAlias = dict[str, JsonValue]
ProtocolPayload: TypeAlias = dict[str, JsonValue]
MessageParams: TypeAlias = Mapping[str, object]
ModCDPRoutes: TypeAlias = dict[str, str]
ModCDPLauncherMode: TypeAlias = Literal["local", "remote", "bb", "none"]
ModCDPUpstreamMode: TypeAlias = Literal["ws", "pipe", "nativemessaging", "reversews", "nats"]


class _ModCDPAddCustomCommandRequired(TypedDict):
    name: str


class ModCDPAddCustomCommandParams(_ModCDPAddCustomCommandRequired, total=False):
    expression: str | None
    params_schema: JsonValue
    result_schema: JsonValue


class _ModCDPAddCustomEventObjectRequired(TypedDict):
    name: str


class ModCDPAddCustomEventObjectParams(_ModCDPAddCustomEventObjectRequired, total=False):
    event_schema: JsonValue


ModCDPAddCustomEventParams: TypeAlias = str | ModCDPAddCustomEventObjectParams


class _ModCDPAddMiddlewareRequired(TypedDict):
    phase: Literal["request", "response", "event"]
    expression: str


class ModCDPAddMiddlewareParams(_ModCDPAddMiddlewareRequired, total=False):
    name: str


class ModCDPPingLatency(TypedDict):
    sent_at: int
    received_at: int | float | None
    returned_at: int
    round_trip_ms: int
    service_worker_ms: int | float | None
    return_path_ms: int | float | None


class ModCDPGetTopologyParams(TypedDict, total=False):
    rootTargetId: str
    targetId: str
    active: bool


class ModCDPTopologyFrame(TypedDict, total=False):
    targetId: str
    url: str | None
    parentFrameId: str | None
    outerBackendNodeId: int | None


class ModCDPTopologyDomRoot(TypedDict, total=False):
    kind: Literal["document", "shadow"]
    frameId: str
    outerBackendNodeId: int | None
    innerBackendNodeId: int | None
    mode: Literal["open", "closed", "user-agent"]
    executionContextId: int
    uniqueContextId: str


class ModCDPTopologyTarget(TypedDict, total=False):
    targetId: str
    type: str
    title: str
    url: str
    attached: bool
    parentId: str
    parentFrameId: str
    sessionId: str | None


class ModCDPTopologyExecutionContext(TypedDict, total=False):
    id: int
    origin: str
    name: str
    uniqueId: str
    auxData: dict[str, object]
    sessionId: str | None
    targetId: str
    frameId: str | None
    world: str


class ModCDPTopology(TypedDict):
    objectGroup: str
    rootFrameId: str
    frames: dict[str, ModCDPTopologyFrame]
    roots: dict[str, ModCDPTopologyDomRoot]
    targets: dict[str, ModCDPTopologyTarget]
    contexts: dict[str, ModCDPTopologyExecutionContext]


class ModCDPLauncherConfig(TypedDict, total=False):
    launcher_mode: ModCDPLauncherMode
    launcher_executable_path: str | None
    launcher_user_data_dir: str | None
    launcher_options: dict[str, JsonValue]


class ModCDPUpstreamConfig(TypedDict, total=False):
    upstream_mode: ModCDPUpstreamMode
    upstream_cdp_url: str | None
    upstream_nats_url: str | None
    upstream_nats_subject_prefix: str | None
    upstream_nats_wait_timeout_ms: int
    upstream_reversews_bind: str | None
    upstream_reversews_wait_timeout_ms: int
    upstream_nativemessaging_manifest: str | None
    upstream_nativemessaging_manifests: list[str] | None
    upstream_nativemessaging_host_name: str | None
    upstream_nativemessaging_wait_timeout_ms: int
    upstream_ws_connect_error_settle_timeout_ms: int


class ModCDPInjectorConfig(TypedDict, total=False):
    injector_mode: Literal["auto", "discover", "inject", "borrow", "none"]
    injector_extension_path: str | None
    injector_extension_id: str | None
    injector_service_worker_url_includes: list[str]
    injector_service_worker_url_suffixes: list[str]
    injector_trust_service_worker_target: bool
    injector_require_service_worker_target: bool
    injector_service_worker_ready_expression: str | None
    injector_execution_context_timeout_ms: int
    injector_service_worker_probe_timeout_ms: int
    injector_service_worker_ready_timeout_ms: int
    injector_service_worker_poll_interval_ms: int
    injector_target_session_poll_interval_ms: int


class ModCDPClientConfig(TypedDict, total=False):
    client_routes: ModCDPRoutes
    client_hydrate_aliases: bool
    client_mirror_upstream_events: bool
    client_cdp_send_timeout_ms: int
    client_event_wait_timeout_ms: int
    client_heartbeat_interval_ms: int


class ModCDPConnectTiming(TypedDict):
    started_at: int
    upstream_mode: str | None
    upstream_endpoint_kind: Literal["raw_cdp", "modcdp_server"]
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


class ModCDPServerConfig(TypedDict, total=False):
    server_loopback_cdp_url: str | None
    server_routes: ModCDPRoutes
    server_cdp_send_timeout_ms: int
    server_loopback_execution_context_timeout_ms: int
    server_ws_connect_error_settle_timeout_ms: int
    server_downstream_client_timeout_ms: int
    server_close_browser_on_downstream_disconnect: bool
    server_browser_token: str | None
    custom_commands: list[ModCDPAddCustomCommandParams]
    custom_events: list[ModCDPAddCustomEventObjectParams]
    custom_middlewares: list[ModCDPAddMiddlewareParams]


RuntimeCallFunctionOnParams: TypeAlias = dict[str, JsonValue]


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
    message: str


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


class BorrowedExtensionInfo(ExtensionInfo, total=False):
    has_tabs: bool
    has_debugger: bool


class UnwrappedModCDPEvent(TypedDict):
    event: str
    data: ProtocolPayload
    sessionId: str | None


Handler: TypeAlias = Callable[[Any], Any]
PendingEntry: TypeAlias = tuple[str, Queue[CdpMessage]]


class WebSocketLike(Protocol):
    def send(self, payload: str) -> object: ...

    def recv(self) -> str | bytes | None: ...

    def close(self) -> object: ...
