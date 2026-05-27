// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/types/modcdp.ts
// - ./python/modcdp/types/modcdp.py
package types

type LauncherConfig struct {
	LauncherMode                           string         `json:"launcher_mode,omitempty"`
	LauncherLocalExecutablePath            string         `json:"launcher_local_executable_path,omitempty"`
	LauncherLocalExtraArgs                 []string       `json:"launcher_local_extra_args,omitempty"`
	LauncherLocalArgs                      []string       `json:"launcher_local_args,omitempty"`
	LauncherLocalHeadless                  *bool          `json:"launcher_local_headless,omitempty"`
	LauncherLocalCDPListenPort             int            `json:"launcher_local_cdp_listen_port,omitempty"`
	LauncherLocalCDPTransport              string         `json:"launcher_local_cdp_transport,omitempty"`
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
	InjectorBorrowExtensionPath          string   `json:"injector_borrow_extension_path,omitempty"`
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

type ModCDPGetTopologyParams struct {
	RootTargetID string `json:"rootTargetId,omitempty"`
	TargetID     string `json:"targetId,omitempty"`
	Active       *bool  `json:"active,omitempty"`
}

type ModCDPTopologyFrame struct {
	TargetID           string `json:"targetId"`
	URL                string `json:"url,omitempty"`
	ParentFrameID      string `json:"parentFrameId,omitempty"`
	OuterBackendNodeID *int   `json:"outerBackendNodeId,omitempty"`
}

type ModCDPTopologyDomRoot struct {
	Kind               string `json:"kind"`
	FrameID            string `json:"frameId"`
	OuterBackendNodeID *int   `json:"outerBackendNodeId,omitempty"`
	InnerBackendNodeID *int   `json:"innerBackendNodeId,omitempty"`
	Mode               string `json:"mode,omitempty"`
	ExecutionContextID *int   `json:"executionContextId,omitempty"`
	UniqueContextID    string `json:"uniqueContextId,omitempty"`
}

type ModCDPTopologyTarget struct {
	TargetID      string `json:"targetId"`
	Type          string `json:"type"`
	Title         string `json:"title,omitempty"`
	URL           string `json:"url,omitempty"`
	Attached      *bool  `json:"attached,omitempty"`
	ParentID      string `json:"parentId,omitempty"`
	ParentFrameID string `json:"parentFrameId,omitempty"`
	SessionID     string `json:"sessionId,omitempty"`
}

type ModCDPTopologyExecutionContext struct {
	ID       int            `json:"id"`
	Origin   string         `json:"origin,omitempty"`
	Name     string         `json:"name,omitempty"`
	UniqueID string         `json:"uniqueId,omitempty"`
	AuxData  map[string]any `json:"auxData,omitempty"`
	SessionID *string       `json:"sessionId"`
	TargetID string         `json:"targetId"`
	FrameID  string         `json:"frameId,omitempty"`
	World    string         `json:"world"`
}

type ModCDPTopology struct {
	ObjectGroup string                                      `json:"objectGroup"`
	RootFrameID string                                      `json:"rootFrameId"`
	Frames      map[string]ModCDPTopologyFrame             `json:"frames"`
	Roots       map[string]ModCDPTopologyDomRoot           `json:"roots"`
	Targets     map[string]ModCDPTopologyTarget            `json:"targets"`
	Contexts    map[string]ModCDPTopologyExecutionContext  `json:"contexts"`
}
