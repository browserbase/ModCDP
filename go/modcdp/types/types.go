// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/types/modcdp.ts
// - ./python/modcdp/types/modcdp.py
package types

type CdpCommandParams = map[string]any
type CdpCommandResult = map[string]any
type CdpEventParams = map[string]any
type ProtocolParams = map[string]any
type ProtocolResult = map[string]any
type ProtocolPayload = map[string]any
type ModCDPRoutes = map[string]string

type RuntimeBindingCalledEvent struct {
	Name               string `json:"name"`
	Payload            string `json:"payload"`
	ExecutionContextID *int   `json:"executionContextId,omitempty"`
}

type TargetAttachedToTargetEvent struct {
	SessionID          string         `json:"sessionId"`
	TargetInfo         map[string]any `json:"targetInfo"`
	WaitingForDebugger bool           `json:"waitingForDebugger"`
}

type LauncherConfig struct {
	LauncherMode                           string         `json:"launcher_mode,omitempty"`
	LauncherLocalExecutablePath            string         `json:"launcher_local_executable_path,omitempty"`
	LauncherLocalExtraArgs                 []string       `json:"launcher_local_extra_args,omitempty"`
	LauncherLocalArgs                      []string       `json:"launcher_local_args,omitempty"`
	LauncherLocalHeadless                  *bool          `json:"launcher_local_headless,omitempty"`
	LauncherLocalCDPListenPort             int            `json:"launcher_local_cdp_listen_port,omitempty"`
	LauncherLocalLoopbackCDP               *bool          `json:"launcher_local_loopback_cdp,omitempty"`
	LauncherLocalSandbox                   *bool          `json:"launcher_local_sandbox,omitempty"`
	LauncherLocalUserDataDir               string         `json:"launcher_local_user_data_dir,omitempty"`
	LauncherLocalCleanupUserDataDir        *bool          `json:"launcher_local_cleanup_user_data_dir,omitempty"`
	LauncherLocalChromeReadyTimeoutMS      int            `json:"launcher_local_chrome_ready_timeout_ms,omitempty"`
	LauncherLocalChromeReadyPollIntervalMS int            `json:"launcher_local_chrome_ready_poll_interval_ms,omitempty"`
	LauncherRemoteCDPURL                   string         `json:"launcher_remote_cdp_url,omitempty"`
	LauncherBBAPIKey                       string         `json:"launcher_bb_api_key,omitempty"`
	LauncherBBBaseURL                      string         `json:"launcher_bb_base_url,omitempty"`
	LauncherBBSessionID                    string         `json:"launcher_bb_session_id,omitempty"`
	LauncherBBKeepAlive                    *bool          `json:"launcher_bb_keep_alive,omitempty"`
	LauncherBBCloseSessionOnClose          *bool          `json:"launcher_bb_close_session_on_close,omitempty"`
	LauncherBBRegion                       string         `json:"launcher_bb_region,omitempty"`
	LauncherBBTimeout                      int            `json:"launcher_bb_timeout,omitempty"`
	LauncherBBExtensionID                  string         `json:"launcher_bb_extension_id,omitempty"`
	LauncherBBBrowserSettings              map[string]any `json:"launcher_bb_browser_settings,omitempty"`
	LauncherBBUserMetadata                 map[string]any `json:"launcher_bb_user_metadata,omitempty"`
	LauncherBBSessionCreateParams          map[string]any `json:"launcher_bb_session_create_params,omitempty"`
}

type UpstreamTransportConfig struct {
	UpstreamMode                          string `json:"upstream_mode,omitempty"`
	UpstreamWSCDPURL                      string `json:"upstream_ws_cdp_url,omitempty"`
	UpstreamWSConnectErrorSettleTimeoutMS int    `json:"upstream_ws_connect_error_settle_timeout_ms,omitempty"`
	UpstreamCDPSendTimeoutMS              int    `json:"upstream_cdp_send_timeout_ms,omitempty"`
}

type SendCDP func(method string, params map[string]any, sessionID string) (map[string]any, error)
type InjectorConfig struct {
	Send                                 SendCDP  `json:"-"`
	InjectorMode                         string   `json:"injector_mode,omitempty"`
	InjectorCLIExtensionPath             string   `json:"injector_cli_extension_path,omitempty"`
	InjectorCLIExtensionID               string   `json:"injector_cli_extension_id,omitempty"`
	InjectorCDPExtensionPath             string   `json:"injector_cdp_extension_path,omitempty"`
	InjectorCDPExtensionID               string   `json:"injector_cdp_extension_id,omitempty"`
	InjectorBBExtensionPath              string   `json:"injector_bb_extension_path,omitempty"`
	InjectorBBExtensionID                string   `json:"injector_bb_extension_id,omitempty"`
	InjectorDiscoverExtensionPath        string   `json:"injector_discover_extension_path,omitempty"`
	InjectorServiceWorkerExtensionID     string   `json:"injector_service_worker_extension_id,omitempty"`
	InjectorServiceWorkerURLIncludes     []string `json:"injector_service_worker_url_includes,omitempty"`
	InjectorServiceWorkerURLSuffixes     []string `json:"injector_service_worker_url_suffixes,omitempty"`
	InjectorTrustServiceWorkerTarget     bool     `json:"injector_trust_service_worker_target,omitempty"`
	InjectorRequireServiceWorkerTarget   bool     `json:"injector_require_service_worker_target,omitempty"`
	InjectorServiceWorkerReadyExpression string   `json:"injector_service_worker_ready_expression,omitempty"`
	InjectorCDPSendTimeoutMS             int      `json:"injector_cdp_send_timeout_ms,omitempty"`
	InjectorExecutionContextTimeoutMS    int      `json:"injector_execution_context_timeout_ms,omitempty"`
	InjectorServiceWorkerProbeTimeoutMS  int      `json:"injector_service_worker_probe_timeout_ms,omitempty"`
	InjectorServiceWorkerReadyTimeoutMS  int      `json:"injector_service_worker_ready_timeout_ms,omitempty"`
	InjectorServiceWorkerPollIntervalMS  int      `json:"injector_service_worker_poll_interval_ms,omitempty"`
	InjectorTargetSessionPollIntervalMS  int      `json:"injector_target_session_poll_interval_ms,omitempty"`
	InjectorBBAPIKey                     string   `json:"injector_bb_api_key,omitempty"`
	InjectorBBBaseURL                    string   `json:"injector_bb_base_url,omitempty"`
}

type ExtensionInjectionResult struct {
	Source      string `json:"source"`
	ExtensionID string `json:"extension_id,omitempty"`
	TargetID    string `json:"target_id"`
	URL         string `json:"url,omitempty"`
	SessionID   string `json:"session_id"`
}

type ModCDPEvaluateParams struct {
	Expression   string         `json:"expression"`
	Params       map[string]any `json:"params,omitempty"`
	CDPSessionID *string        `json:"cdpSessionId,omitempty"`
}

type ModCDPAddCustomCommandParams struct {
	Name         string         `json:"name"`
	Expression   string         `json:"expression,omitempty"`
	ParamsSchema map[string]any `json:"params_schema,omitempty"`
	ResultSchema map[string]any `json:"result_schema,omitempty"`
}

type ModCDPAddCustomEventObjectParams struct {
	Name        string         `json:"name"`
	EventSchema map[string]any `json:"event_schema,omitempty"`
}

type ModCDPAddMiddlewareParams struct {
	Name       string `json:"name,omitempty"`
	Phase      string `json:"phase"`
	Expression string `json:"expression"`
}

type ModCDPPingParams struct {
	SentAt int `json:"sent_at,omitempty"`
}

type ModCDPPongEvent struct {
	SentAt     int    `json:"sent_at"`
	ReceivedAt int    `json:"received_at"`
	From       string `json:"from"`
}

type ModCDPPingLatency struct {
	SentAt          int  `json:"sent_at"`
	ReceivedAt      *int `json:"received_at"`
	ReturnedAt      int  `json:"returned_at"`
	RoundTripMS     int  `json:"round_trip_ms"`
	ServiceWorkerMS *int `json:"service_worker_ms"`
	ReturnPathMS    *int `json:"return_path_ms"`
}

type ModCDPRouterConfig struct {
	RouterRoutes                      map[string]string `json:"router_routes,omitempty"`
	LoopbackExecutionContextTimeoutMS int               `json:"loopback_execution_context_timeout_ms,omitempty"`
}

type ModCDPClientConfig struct {
	ClientHydrateAliases       *bool `json:"client_hydrate_aliases,omitempty"`
	ClientMirrorUpstreamEvents *bool `json:"client_mirror_upstream_events,omitempty"`
	ClientCDPSendTimeoutMS     int   `json:"client_cdp_send_timeout_ms,omitempty"`
	ClientEventWaitTimeoutMS   int   `json:"client_event_wait_timeout_ms,omitempty"`
	ClientHeartbeatIntervalMS  int   `json:"client_heartbeat_interval_ms,omitempty"`
}

type ModCDPDownstreamConfig struct {
	DownstreamClientTimeoutMS          int   `json:"downstream_client_timeout_ms,omitempty"`
	DownstreamCloseBrowserOnDisconnect *bool `json:"downstream_close_browser_on_disconnect,omitempty"`
}

type ModCDPServerConfig struct {
	Upstream           UpstreamTransportConfig            `json:"upstream,omitempty"`
	Router             ModCDPRouterConfig                 `json:"router,omitempty"`
	ClientConfig       ModCDPClientConfig                 `json:"client_config,omitempty"`
	Downstream         ModCDPDownstreamConfig             `json:"downstream,omitempty"`
	ServerBrowserToken string                             `json:"server_browser_token,omitempty"`
	CustomCommands     []ModCDPAddCustomCommandParams     `json:"custom_commands,omitempty"`
	CustomEvents       []ModCDPAddCustomEventObjectParams `json:"custom_events,omitempty"`
	CustomMiddlewares  []ModCDPAddMiddlewareParams        `json:"custom_middlewares,omitempty"`
}

type ModCDPGetTopologyParams struct {
	RootTargetID *string `json:"rootTargetId,omitempty"`
	TargetID     *string `json:"targetId,omitempty"`
	Active       *bool   `json:"active,omitempty"`
}

type ModCDPTopologyFrame struct {
	TargetID           string  `json:"targetId"`
	URL                *string `json:"url,omitempty"`
	ParentFrameID      *string `json:"parentFrameId,omitempty"`
	OuterBackendNodeID *int    `json:"outerBackendNodeId,omitempty"`
}

type ModCDPTopologyDomRoot struct {
	Kind               string  `json:"kind"`
	FrameID            string  `json:"frameId"`
	OuterBackendNodeID *int    `json:"outerBackendNodeId,omitempty"`
	InnerBackendNodeID *int    `json:"innerBackendNodeId,omitempty"`
	Mode               *string `json:"mode,omitempty"`
	ExecutionContextID *int    `json:"executionContextId,omitempty"`
	UniqueContextID    *string `json:"uniqueContextId,omitempty"`
}

type ModCDPTopologyTarget struct {
	TargetID      string  `json:"targetId"`
	Type          string  `json:"type"`
	Title         *string `json:"title,omitempty"`
	URL           *string `json:"url,omitempty"`
	Attached      *bool   `json:"attached,omitempty"`
	ParentID      *string `json:"parentId,omitempty"`
	ParentFrameID *string `json:"parentFrameId,omitempty"`
	SessionID     *string `json:"sessionId,omitempty"`
}

type ModCDPTopologyExecutionContext struct {
	ID        int            `json:"id"`
	Origin    *string        `json:"origin,omitempty"`
	Name      *string        `json:"name,omitempty"`
	UniqueID  *string        `json:"uniqueId,omitempty"`
	AuxData   map[string]any `json:"auxData,omitempty"`
	SessionID *string        `json:"sessionId"`
	TargetID  string         `json:"targetId"`
	FrameID   *string        `json:"frameId,omitempty"`
	World     string         `json:"world"`
}

type ModCDPTopology struct {
	ObjectGroup string                                    `json:"objectGroup"`
	RootFrameID string                                    `json:"rootFrameId"`
	Frames      map[string]ModCDPTopologyFrame            `json:"frames"`
	Roots       map[string]ModCDPTopologyDomRoot          `json:"roots"`
	Targets     map[string]ModCDPTopologyTarget           `json:"targets"`
	Contexts    map[string]ModCDPTopologyExecutionContext `json:"contexts"`
}

type ModCDPGetTopologyResponse = ModCDPTopology
type ModCDPConfigureParams = ModCDPServerConfig
type ModCDPCommandParams = any
type ModCDPCommandResult = any
type ModCDPEvaluateResponse = any
type ModCDPConfigureResponse = map[string]any

type ModCDPOkResponse struct {
	OK bool `json:"ok"`
}

type ModCDPAddCustomCommandResponse struct {
	Name       string `json:"name"`
	Registered bool   `json:"registered"`
}

type ModCDPAddCustomEventResponse struct {
	Name       string `json:"name"`
	Registered bool   `json:"registered"`
}

type ModCDPAddMiddlewareResponse struct {
	Name       string `json:"name"`
	Phase      string `json:"phase"`
	Registered bool   `json:"registered"`
}

type ModCDPPingResponse = ModCDPOkResponse

type ModCDPBindingPayload struct {
	Event        string  `json:"event"`
	Data         any     `json:"data"`
	CDPSessionID *string `json:"cdpSessionId"`
}

type CdpDebuggeeCommandParams struct {
	Debuggee    map[string]any `json:"debuggee,omitempty"`
	TabID       *int           `json:"tabId,omitempty"`
	TargetID    string         `json:"targetId,omitempty"`
	ExtensionID string         `json:"extensionId,omitempty"`
}

type CdpError struct {
	Code    *int   `json:"code,omitempty"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

type CdpCommandMessage struct {
	ID        int            `json:"id"`
	Method    string         `json:"method"`
	Params    map[string]any `json:"params,omitempty"`
	SessionID string         `json:"sessionId,omitempty"`
}

type CdpResponseMessage struct {
	ID        int       `json:"id"`
	Result    any       `json:"result,omitempty"`
	Error     *CdpError `json:"error,omitempty"`
	SessionID string    `json:"sessionId,omitempty"`
}

type CdpEventMessage struct {
	Method    string         `json:"method"`
	Params    map[string]any `json:"params,omitempty"`
	SessionID string         `json:"sessionId,omitempty"`
}

type TranslatedStep struct {
	Method    string         `json:"method"`
	Params    map[string]any `json:"params,omitempty"`
	SessionID string         `json:"sessionId,omitempty"`
	Unwrap    string         `json:"unwrap,omitempty"`
}

type TranslatedCommand struct {
	Route  string           `json:"route"`
	Target string           `json:"target"`
	Steps  []TranslatedStep `json:"steps"`
}

type UnwrappedModCDPEvent struct {
	Event     string  `json:"event"`
	Data      any     `json:"data"`
	SessionID *string `json:"sessionId"`
}
