// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/client/ModCDPClient.ts
// - ./python/modcdp/client/ModCDPClient.py
// ModCDPClient (Go): importable, no CLI, no demo code.
//
// Config groups mirror the JS / Python ports:
//
//	Launcher       browser/session creation and cleanup.
//	Upstream       message transport to raw CDP or a ModCDP server.
//	Injector       raw-CDP extension discovery/injection/borrowing.
//	ServerConfig         ModCDPServer.configure params.
//	ClientConfig client routing and client-owned send/event timings.
//	Upstream      upstream transport config and upstream-owned timings.
//
// Public methods: Connect, Send(method, params), On, Close.
// Synchronous; one background goroutine reads messages off the WS.
//
// Route and ModCDP wire translation lives in translate.go. Launchers and
// upstream transports live in their matching class files.
package client

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"reflect"
	"regexp"
	"strings"
	"sync"
	"time"

	abxjsonschema "github.com/ArchiveBox/abxbus/abxbus-go/v2/jsonschema"
	"github.com/browserbase/modcdp/go/modcdp/injector"
	"github.com/browserbase/modcdp/go/modcdp/launcher"
	"github.com/browserbase/modcdp/go/modcdp/router"
	"github.com/browserbase/modcdp/go/modcdp/translate"
	transportpkg "github.com/browserbase/modcdp/go/modcdp/transport"
	"github.com/browserbase/modcdp/go/modcdp/types"
)

var (
	extIDFromURL = regexp.MustCompile(`^chrome-extension://([a-z]+)/`)
)

const modcdpReadyExpression = `Boolean(globalThis.ModCDP?.handleCommand && globalThis.ModCDP?.addCustomEvent)`

const DefaultCDPSendTimeoutMS = 10_000
const DefaultEventWaitTimeoutMS = 10_000
const DefaultExecutionContextTimeoutMS = 10_000
const DefaultChromeReadyTimeoutMS = 45_000
const DefaultChromeReadyPollIntervalMS = 100
const DefaultServiceWorkerProbeTimeoutMS = 10_000
const DefaultServiceWorkerReadyTimeoutMS = 60_000
const DefaultServiceWorkerPollIntervalMS = 100
const DefaultTargetSessionPollIntervalMS = 20
const DefaultWSConnectErrorSettleTimeoutMS = 250
const DefaultClientHeartbeatIntervalMS = 250

func boolPointer(value bool) *bool {
	return &value
}

type LauncherConfig = types.LauncherConfig
type LaunchedBrowser = launcher.LaunchedBrowser
type BrowserLauncher = launcher.BrowserLauncher
type LocalBrowserLauncher = launcher.LocalBrowserLauncher
type RemoteBrowserLauncher = launcher.RemoteBrowserLauncher
type BBBrowserLauncher = launcher.BBBrowserLauncher
type NoneBrowserLauncher = launcher.NoneBrowserLauncher
type InjectorConfig = types.InjectorConfig
type ExtensionInjectionResult = types.ExtensionInjectionResult
type SendCDP = types.SendCDP
type ExtensionInjector = injector.ExtensionInjector
type DiscoverExtensionInjector = injector.DiscoverExtensionInjector
type BBExtensionInjector = injector.BBExtensionInjector
type CLIExtensionInjector = injector.CLIExtensionInjector
type CDPExtensionInjector = injector.CDPExtensionInjector
type BorrowExtensionInjector = injector.BorrowExtensionInjector
type UpstreamMode = transportpkg.UpstreamMode
type UpstreamTransportConfig = types.UpstreamTransportConfig
type UpstreamTransport = transportpkg.UpstreamTransport
type WSUpstreamTransport = transportpkg.WSUpstreamTransport
type AutoSessionRouter = router.AutoSessionRouter

var NewLocalBrowserLauncher = launcher.NewLocalBrowserLauncher
var NewRemoteBrowserLauncher = launcher.NewRemoteBrowserLauncher
var NewBBBrowserLauncher = launcher.NewBBBrowserLauncher
var NewNoneBrowserLauncher = launcher.NewNoneBrowserLauncher
var NewDiscoverExtensionInjector = injector.NewDiscoverExtensionInjector
var NewBBExtensionInjector = injector.NewBBExtensionInjector
var NewCLIExtensionInjector = injector.NewCLIExtensionInjector
var NewCDPExtensionInjector = injector.NewCDPExtensionInjector
var NewBorrowExtensionInjector = injector.NewBorrowExtensionInjector
var NewWSUpstreamTransport = transportpkg.NewWSUpstreamTransport
var NewAutoSessionRouter = router.NewAutoSessionRouter

var DefaultModCDPServiceWorkerURLSuffixes = injector.DefaultModCDPServiceWorkerURLSuffixes

const DefaultModCDPExtensionID = injector.DefaultModCDPExtensionID

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func websocketURLFor(endpoint string) (string, error) {
	if strings.HasPrefix(endpoint, "ws://") || strings.HasPrefix(endpoint, "wss://") {
		return endpoint, nil
	}
	httpEndpoint := endpoint
	if !strings.Contains(endpoint, "://") {
		httpEndpoint = "http://" + endpoint
	}
	resp, err := http.Get(httpEndpoint + "/json/version")
	if err != nil {
		return "", fmt.Errorf("GET /json/version: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		parsed, parseErr := url.Parse(httpEndpoint)
		if parseErr != nil {
			return "", parseErr
		}
		if parsed.Scheme == "https" {
			parsed.Scheme = "wss"
		} else {
			parsed.Scheme = "ws"
		}
		parsed.Path = "/devtools/browser"
		parsed.RawQuery = ""
		parsed.Fragment = ""
		return parsed.String(), nil
	}
	body, _ := io.ReadAll(resp.Body)
	var version map[string]any
	if err := json.Unmarshal(body, &version); err != nil {
		return "", fmt.Errorf("parse /json/version: %w", err)
	}
	wsURL, _ := version["webSocketDebuggerUrl"].(string)
	if wsURL == "" {
		return "", fmt.Errorf("HTTP discovery for %s returned no webSocketDebuggerUrl", endpoint)
	}
	return wsURL, nil
}

func freePort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port, nil
}

// --- public types --------------------------------------------------------

type RouterConfig struct {
	RouterRoutes                      map[string]string `json:"router_routes,omitempty"`
	LoopbackExecutionContextTimeoutMS int               `json:"loopback_execution_context_timeout_ms,omitempty"`
}

type DownstreamConfig struct {
	DownstreamClientTimeoutMS          int   `json:"downstream_client_timeout_ms,omitempty"`
	DownstreamCloseBrowserOnDisconnect *bool `json:"downstream_close_browser_on_disconnect,omitempty"`
}

type CustomEvent struct {
	Name        string         `json:"name"`
	EventSchema map[string]any `json:"event_schema,omitempty"`
}

type CustomCommand struct {
	Name         string         `json:"name"`
	Expression   string         `json:"expression,omitempty"`
	ParamsSchema map[string]any `json:"params_schema,omitempty"`
	ResultSchema map[string]any `json:"result_schema,omitempty"`
}

type CustomMiddleware struct {
	Name       string `json:"name,omitempty"`
	Phase      string `json:"phase"`
	Expression string `json:"expression"`
}

type CDPTypesConfig struct {
	CustomCommands    []CustomCommand    `json:"custom_commands,omitempty"`
	CustomEvents      []CustomEvent      `json:"custom_events,omitempty"`
	CustomMiddlewares []CustomMiddleware `json:"custom_middlewares,omitempty"`
}

type ServerConfig struct {
	Upstream           UpstreamTransportConfig `json:"upstream,omitempty"`
	Router             RouterConfig            `json:"router,omitempty"`
	ClientConfig       ClientConfig            `json:"client_config,omitempty"`
	Downstream         DownstreamConfig        `json:"downstream,omitempty"`
	ServerBrowserToken string                  `json:"server_browser_token,omitempty"`
	CustomCommands     []CustomCommand         `json:"custom_commands,omitempty"`
	CustomEvents       []CustomEvent           `json:"custom_events,omitempty"`
	CustomMiddlewares  []CustomMiddleware      `json:"custom_middlewares,omitempty"`
	disabled           bool
}

var ServerConfigNone = &ServerConfig{disabled: true}

type ClientConfig struct {
	ClientHydrateAliases       *bool `json:"client_hydrate_aliases,omitempty"`
	ClientMirrorUpstreamEvents *bool `json:"client_mirror_upstream_events,omitempty"`
	ClientCDPSendTimeoutMS     int   `json:"client_cdp_send_timeout_ms,omitempty"`
	ClientEventWaitTimeoutMS   int   `json:"client_event_wait_timeout_ms,omitempty"`
	ClientHeartbeatIntervalMS  int   `json:"client_heartbeat_interval_ms,omitempty"`
}

type Config struct {
	Launcher               LauncherConfig          `json:"launcher,omitempty"`
	Upstream               UpstreamTransportConfig `json:"upstream,omitempty"`
	Injector               InjectorConfig          `json:"injector,omitempty"`
	Router                 RouterConfig            `json:"router,omitempty"`
	ClientConfig           ClientConfig            `json:"client_config,omitempty"`
	ServerConfig           *ServerConfig           `json:"server_config,omitempty"`
	Types                  *CDPTypesConfig         `json:"types,omitempty"`
	serverConfigConfigured bool
}

func (o *Config) UnmarshalJSON(data []byte) error {
	type configAlias Config
	var decoded configAlias
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	*o = Config(decoded)

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	rawServerConfig, hasServerConfig := raw["server_config"]
	if !hasServerConfig {
		return nil
	}
	o.serverConfigConfigured = true
	if strings.TrimSpace(string(rawServerConfig)) == "null" {
		o.ServerConfig = nil
		return nil
	}
	var server ServerConfig
	if err := json.Unmarshal(rawServerConfig, &server); err != nil {
		return err
	}
	o.ServerConfig = &server
	return nil
}

type Handler func(data any)

type handlerEntry struct {
	handler Handler
	pointer uintptr
}

type ModDomain struct {
	client *ModCDPClient
}

type ModCDPClient struct {
	Accessibility        AccessibilityDomain
	Animation            AnimationDomain
	Audits               AuditsDomain
	Autofill             AutofillDomain
	BackgroundService    BackgroundServiceDomain
	BluetoothEmulation   BluetoothEmulationDomain
	Browser              BrowserDomain
	CSS                  CSSDomain
	CacheStorage         CacheStorageDomain
	Cast                 CastDomain
	Console              ConsoleDomain
	DOM                  DOMDomain
	DOMDebugger          DOMDebuggerDomain
	DOMSnapshot          DOMSnapshotDomain
	DOMStorage           DOMStorageDomain
	Debugger             DebuggerDomain
	DeviceAccess         DeviceAccessDomain
	DeviceOrientation    DeviceOrientationDomain
	Emulation            EmulationDomain
	EventBreakpoints     EventBreakpointsDomain
	Extensions           ExtensionsDomain
	FedCm                FedCmDomain
	Fetch                FetchDomain
	FileSystem           FileSystemDomain
	HeadlessExperimental HeadlessExperimentalDomain
	HeapProfiler         HeapProfilerDomain
	IO                   IODomain
	IndexedDB            IndexedDBDomain
	Input                InputDomain
	Inspector            InspectorDomain
	LayerTree            LayerTreeDomain
	Log                  LogDomain
	Media                MediaDomain
	Memory               MemoryDomain
	Network              NetworkDomain
	Overlay              OverlayDomain
	PWA                  PWADomain
	Page                 PageDomain
	Performance          PerformanceDomain
	PerformanceTimeline  PerformanceTimelineDomain
	Preload              PreloadDomain
	Profiler             ProfilerDomain
	Runtime              RuntimeDomain
	Schema               SchemaDomain
	Security             SecurityDomain
	ServiceWorker        ServiceWorkerDomain
	SmartCardEmulation   SmartCardEmulationDomain
	Storage              StorageDomain
	SystemInfo           SystemInfoDomain
	Target               TargetDomain
	Tethering            TetheringDomain
	Tracing              TracingDomain
	WebAudio             WebAudioDomain
	WebAuthn             WebAuthnDomain
	Mod                  ModDomain

	Config                   Config
	Types                    *CDPTypes
	CDPURL                   string
	transport                upstreamTransportClient
	handlers                 map[string][]handlerEntry
	handlersMu               sync.Mutex
	Router                   *AutoSessionRouter
	ExtensionID              string
	ExtTargetID              string
	ExtSessionID             string
	ExtExecutionContextID    int
	Latency                  map[string]any
	ConnectTiming            map[string]any
	LastCommandTiming        map[string]any
	launchedBrowser          *LaunchedBrowser
	extensionInjectors       []extensionInjector
	configuredPeerGeneration int64
	heartbeatStop            chan struct{}
}

type extensionInjector interface {
	Update(InjectorConfig) *ExtensionInjector
	ConfigForLauncher() LauncherConfig
	ConfigForUpstream() map[string]any
	Prepare() error
	Inject() (*ExtensionInjectionResult, error)
	Close() error
}

type browserLauncherClient interface {
	Update(LauncherConfig) *BrowserLauncher
	ConfigForUpstream() map[string]any
	ConfigForServer() map[string]any
	Launch(LauncherConfig) (*LaunchedBrowser, error)
}

type upstreamTransportClient interface {
	Update(map[string]any)
	Connect() error
	Close() error
	Send(command string, params map[string]any, sessionID string, timeout ...time.Duration) (map[string]any, error)
	ConfigForLauncher() LauncherConfig
	ConfigForServer() map[string]any
	OnRecv(func(map[string]any)) func()
	OnClose(func(error)) func()
	WaitForPeer() error
	PeerGeneration() int64
}

func New(config Config) *ModCDPClient {
	if config.Upstream.UpstreamMode == "" {
		config.Upstream.UpstreamMode = "ws"
	}
	if config.Launcher.LauncherMode == "" {
		config.Launcher.LauncherMode = "none"
	}
	if config.Injector.InjectorMode == "" {
		config.Injector.InjectorMode = "none"
	}
	if config.Router.RouterRoutes == nil {
		config.Router.RouterRoutes = translate.DefaultClientRoutes()
	} else {
		merged := translate.DefaultClientRoutes()
		for k, v := range config.Router.RouterRoutes {
			merged[k] = v
		}
		config.Router.RouterRoutes = merged
	}
	if config.ClientConfig.ClientHydrateAliases == nil {
		value := true
		config.ClientConfig.ClientHydrateAliases = &value
	}
	if config.ServerConfig != nil && config.ServerConfig.disabled {
		config.ServerConfig = nil
		config.serverConfigConfigured = true
	}
	if config.ServerConfig == nil && !config.serverConfigConfigured {
		config.ServerConfig = &ServerConfig{}
	}
	if config.Injector.InjectorServiceWorkerURLSuffixes == nil {
		config.Injector.InjectorServiceWorkerURLSuffixes = append([]string{}, DefaultModCDPServiceWorkerURLSuffixes...)
	}
	if config.ClientConfig.ClientCDPSendTimeoutMS == 0 {
		config.ClientConfig.ClientCDPSendTimeoutMS = DefaultCDPSendTimeoutMS
	}
	if config.ClientConfig.ClientEventWaitTimeoutMS == 0 {
		config.ClientConfig.ClientEventWaitTimeoutMS = DefaultEventWaitTimeoutMS
	}
	if config.ClientConfig.ClientHeartbeatIntervalMS == 0 {
		config.ClientConfig.ClientHeartbeatIntervalMS = DefaultClientHeartbeatIntervalMS
	}
	if config.Injector.InjectorExecutionContextTimeoutMS == 0 {
		config.Injector.InjectorExecutionContextTimeoutMS = DefaultExecutionContextTimeoutMS
	}
	if config.Injector.InjectorServiceWorkerProbeTimeoutMS == 0 {
		config.Injector.InjectorServiceWorkerProbeTimeoutMS = DefaultServiceWorkerProbeTimeoutMS
	}
	if config.Injector.InjectorServiceWorkerReadyTimeoutMS == 0 {
		config.Injector.InjectorServiceWorkerReadyTimeoutMS = DefaultServiceWorkerReadyTimeoutMS
	}
	if config.Injector.InjectorServiceWorkerPollIntervalMS == 0 {
		config.Injector.InjectorServiceWorkerPollIntervalMS = DefaultServiceWorkerPollIntervalMS
	}
	if config.Injector.InjectorTargetSessionPollIntervalMS == 0 {
		config.Injector.InjectorTargetSessionPollIntervalMS = DefaultTargetSessionPollIntervalMS
	}
	if config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS == 0 {
		config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS = DefaultWSConnectErrorSettleTimeoutMS
	}
	typesConfig := CDPTypesConfig{}
	if config.Types != nil {
		typesConfig = *config.Types
	}
	client := &ModCDPClient{
		Config:   config,
		Types:    NewCDPTypes(typesConfig.CustomCommands, typesConfig.CustomEvents, typesConfig.CustomMiddlewares),
		handlers: map[string][]handlerEntry{},
	}
	client.Mod = ModDomain{client: client}
	client.Router = NewAutoSessionRouter(
		func(method string, params map[string]any, sessionID string) (map[string]any, error) {
			if client.transport == nil {
				return nil, fmt.Errorf("ModCDP upstream is not connected")
			}
			return client.transport.Send(method, params, sessionID)
		},
		func() int { return client.Config.Injector.InjectorExecutionContextTimeoutMS },
	)
	if *client.Config.ClientConfig.ClientHydrateAliases {
		initCDPSurface(client)
	}
	return client
}

func (c *ModCDPClient) ToJSON() map[string]any {
	children := map[string]types.ModCDPJSONChild{}
	if child, ok := c.transport.(types.ModCDPJSONChild); ok {
		children["upstream"] = child
	}
	if child, ok := any(c.Router).(types.ModCDPJSONChild); ok {
		children["router"] = child
	}
	if child, ok := any(c.Types).(types.ModCDPJSONChild); ok {
		children["types"] = child
	}
	latency := any(nil)
	if c.Latency != nil {
		latency = c.Latency["round_trip_ms"]
	}
	return types.ModCDPToJSON(c, types.ModCDPJSONConfig{
		Config: map[string]any{
			"client_config": c.Config.ClientConfig,
			"server_config": c.Config.ServerConfig,
		},
		State: map[string]any{
			"event_wait_cleanups": len(c.handlers),
			"heartbeat_timer":     c.heartbeatStop != nil,
			"latency":             latency,
			"connected":           c.ConnectTiming != nil,
		},
		Children: children,
	})
}

func (c *ModCDPClient) Configure(config Config) *ModCDPClient {
	if config.ClientConfig.ClientHydrateAliases != nil {
		c.Config.ClientConfig.ClientHydrateAliases = config.ClientConfig.ClientHydrateAliases
	}
	if config.ClientConfig.ClientMirrorUpstreamEvents != nil {
		c.Config.ClientConfig.ClientMirrorUpstreamEvents = config.ClientConfig.ClientMirrorUpstreamEvents
	}
	if config.ClientConfig.ClientCDPSendTimeoutMS != 0 {
		c.Config.ClientConfig.ClientCDPSendTimeoutMS = config.ClientConfig.ClientCDPSendTimeoutMS
	}
	if config.ClientConfig.ClientEventWaitTimeoutMS != 0 {
		c.Config.ClientConfig.ClientEventWaitTimeoutMS = config.ClientConfig.ClientEventWaitTimeoutMS
	}
	if config.ClientConfig.ClientHeartbeatIntervalMS != 0 {
		c.Config.ClientConfig.ClientHeartbeatIntervalMS = config.ClientConfig.ClientHeartbeatIntervalMS
	}
	if c.transport != nil {
		c.transport.Update(map[string]any{"upstream_cdp_send_timeout_ms": c.Config.ClientConfig.ClientCDPSendTimeoutMS})
	}
	if config.Upstream.UpstreamWSCDPURL != "" || config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS != 0 || config.Upstream.UpstreamCDPSendTimeoutMS != 0 {
		if config.Upstream.UpstreamWSCDPURL != "" {
			c.Config.Upstream.UpstreamWSCDPURL = config.Upstream.UpstreamWSCDPURL
		}
		if config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS != 0 {
			c.Config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS = config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS
		}
		if config.Upstream.UpstreamCDPSendTimeoutMS != 0 {
			c.Config.Upstream.UpstreamCDPSendTimeoutMS = config.Upstream.UpstreamCDPSendTimeoutMS
		}
		if c.transport != nil {
			c.transport.Update(c.upstreamTransportConfig())
		}
	}
	if config.Router.RouterRoutes != nil {
		if c.Config.Router.RouterRoutes == nil {
			c.Config.Router.RouterRoutes = translate.DefaultClientRoutes()
		}
		for key, value := range config.Router.RouterRoutes {
			c.Config.Router.RouterRoutes[key] = value
		}
	}
	if config.Router.LoopbackExecutionContextTimeoutMS != 0 {
		c.Config.Router.LoopbackExecutionContextTimeoutMS = config.Router.LoopbackExecutionContextTimeoutMS
	}
	if config.serverConfigConfigured {
		c.Config.ServerConfig = config.ServerConfig
	} else if config.ServerConfig != nil {
		c.Config.ServerConfig = config.ServerConfig
	}
	if c.Config.ClientConfig.ClientHydrateAliases != nil && *c.Config.ClientConfig.ClientHydrateAliases {
		initCDPSurface(c)
	}
	return c
}

func (c *ModCDPClient) Connect() error {
	connectStartedAt := time.Now().UnixMilli()
	transportStartedAt := time.Now().UnixMilli()
	if err := c.connectUpstreamTransport(); err != nil {
		return err
	}
	transportConnectedAt := time.Now().UnixMilli()
	if c.transport == nil {
		return fmt.Errorf("upstream transport did not connect")
	}
	c.transport.OnRecv(func(message map[string]any) { c.handleMessage(message) })
	c.transport.OnClose(func(err error) {
		c.stopHeartbeat()
	})
	if c.Config.Upstream.UpstreamMode != "ws" {
		if err := c.transport.WaitForPeer(); err != nil {
			c.Close()
			return err
		}
		if c.Config.ServerConfig != nil {
			if _, err := c.transport.Send("Mod.configure", c.serverConfigureParams(nil, nil, nil), ""); err != nil {
				c.Close()
				return err
			}
			c.configuredPeerGeneration = c.transport.PeerGeneration()
		}
		c.startHeartbeat()
		c.startPingLatencyMeasurement()
		connectedAt := time.Now().UnixMilli()
		c.ConnectTiming = map[string]any{
			"started_at":             connectStartedAt,
			"upstream_mode":          c.Config.Upstream.UpstreamMode,
			"transport_started_at":   transportStartedAt,
			"transport_connected_at": transportConnectedAt,
			"transport_duration_ms":  transportConnectedAt - transportStartedAt,
			"connected_at":           connectedAt,
			"duration_ms":            connectedAt - connectStartedAt,
		}
		return nil
	}
	if err := c.initializeRawCDPTransport(); err != nil {
		c.Close()
		return err
	}
	extensionStartedAt := time.Now().UnixMilli()
	ext, err := c.injectExtension(c.extensionInjectors)
	if err != nil {
		c.Close()
		return err
	}
	extensionCompletedAt := time.Now().UnixMilli()
	c.ExtensionID = ext.ExtensionID
	c.ExtTargetID = ext.TargetID
	c.ExtSessionID = ext.SessionID
	if _, err := c.transport.Send("Runtime.enable", map[string]any{}, c.ExtSessionID); err != nil {
		c.Close()
		return err
	}
	extExecutionContextID, err := c.Router.WaitForExecutionContext(c.ExtSessionID, c.Config.Injector.InjectorExecutionContextTimeoutMS)
	if err != nil {
		c.Close()
		return err
	}
	c.ExtExecutionContextID = extExecutionContextID
	if _, err := c.transport.Send("Runtime.addBinding", map[string]any{"name": translate.CustomEventBindingName}, c.ExtSessionID); err != nil {
		c.Close()
		return err
	}
	mirrorUpstreamEvents := true
	if c.Config.ClientConfig.ClientMirrorUpstreamEvents != nil {
		mirrorUpstreamEvents = *c.Config.ClientConfig.ClientMirrorUpstreamEvents
	}
	if mirrorUpstreamEvents {
		if _, err := c.transport.Send("Runtime.addBinding", map[string]any{"name": translate.UpstreamEventBindingName}, c.ExtSessionID); err != nil {
			c.Close()
			return err
		}
	}

	if c.Config.ServerConfig != nil {
		configureParams := c.serverConfigureParams(
			c.Types.CustomCommandWireRegistrations(true),
			c.Types.CustomEventWireRegistrations(),
			customMiddlewaresToMaps(c.Types.CustomMiddlewareWireRegistrations()),
		)
		if _, err := c.Send("Mod.configure", configureParams); err != nil {
			c.Close()
			return fmt.Errorf("Mod.configure: %w", err)
		}
	}
	c.startHeartbeat()
	c.startPingLatencyMeasurement()
	connectedAt := time.Now().UnixMilli()
	c.ConnectTiming = map[string]any{
		"started_at":             connectStartedAt,
		"upstream_mode":          c.Config.Upstream.UpstreamMode,
		"transport_started_at":   transportStartedAt,
		"transport_connected_at": transportConnectedAt,
		"transport_duration_ms":  transportConnectedAt - transportStartedAt,
		"injector_source":        ext.Source,
		"injector_started_at":    extensionStartedAt,
		"injector_completed_at":  extensionCompletedAt,
		"injector_duration_ms":   extensionCompletedAt - extensionStartedAt,
		"connected_at":           connectedAt,
		"duration_ms":            connectedAt - connectStartedAt,
	}
	return nil
}

func (c *ModCDPClient) connectUpstreamTransport() error {
	if c.transport != nil {
		return nil
	}
	if !isKnownLaunchMode(c.Config.Launcher.LauncherMode) {
		return fmt.Errorf("unknown launcher.launcher_mode=%s", c.Config.Launcher.LauncherMode)
	}
	if !isKnownUpstreamMode(c.Config.Upstream.UpstreamMode) {
		return fmt.Errorf("unknown upstream.upstream_mode=%s", c.Config.Upstream.UpstreamMode)
	}
	if !isKnownExtensionMode(c.Config.Injector.InjectorMode) {
		return fmt.Errorf("unknown injector.injector_mode=%s", c.Config.Injector.InjectorMode)
	}
	launcher := c.browserLauncher()
	transport := c.upstreamTransport()
	injectors := c.extensionInjectorsForConfig()
	c.extensionInjectors = injectors
	initialTransportConfig := c.upstreamTransportConfig()

	transport.Update(initialTransportConfig)
	launcher.Update(c.Config.Launcher)
	for _, injector := range injectors {
		injector.Update(c.baseInjectorConfig(nil))
	}
	for _, injector := range injectors {
		if err := injector.Prepare(); err != nil {
			return err
		}
	}
	for _, injector := range injectors {
		launcher.Update(injector.ConfigForLauncher())
	}
	for _, injector := range injectors {
		transport.Update(injector.ConfigForUpstream())
	}
	launcher.Update(transport.ConfigForLauncher())
	launcher.Update(LauncherConfig{LauncherLocalLoopbackCDP: boolPointer(c.serverNeedsLoopbackCDP())})
	transport.Update(launcher.ConfigForUpstream())

	if c.Config.Upstream.UpstreamMode != "ws" {
		if err := transport.Connect(); err != nil {
			return err
		}
	}
	if c.Config.Launcher.LauncherMode != "none" {
		launched, err := launcher.Launch(LauncherConfig{})
		if err != nil {
			_ = transport.Close()
			return err
		}
		c.launchedBrowser = launched
		transport.Update(launcher.ConfigForUpstream())
		for _, injector := range injectors {
			transport.Update(injector.ConfigForUpstream())
		}
	}
	launchedCDPURL := ""
	if c.launchedBrowser != nil {
		launchedCDPURL = c.launchedBrowser.CDPURL
	}
	if c.Config.Upstream.UpstreamMode == "ws" {
		if err := transport.Connect(); err != nil {
			return err
		}
	}

	c.transport = transport
	transportURL := transportURL(transport)
	if c.Config.Upstream.UpstreamMode == "ws" {
		c.CDPURL = firstNonEmptyString(transportURL, launchedCDPURL)
	} else {
		c.CDPURL = launchedCDPURL
	}
	if wsTransport, ok := transport.(*WSUpstreamTransport); ok && wsTransport.URL != "" {
		// For ws mode, cdp_url has been resolved to the concrete WebSocket CDP endpoint after connect().
		c.Config.Upstream.UpstreamWSCDPURL = wsTransport.URL
	}

	serverConfig := map[string]any{}
	for key, value := range launcher.ConfigForServer() {
		serverConfig[key] = value
	}
	for key, value := range transport.ConfigForServer() {
		serverConfig[key] = value
	}
	if c.Config.ServerConfig != nil {
		if upstreamConfig, _ := serverConfig["upstream"].(map[string]any); upstreamConfig != nil {
			loopbackCDPURL, _ := upstreamConfig["upstream_ws_cdp_url"].(string)
			initialCDPURL, _ := initialTransportConfig["upstream_ws_cdp_url"].(string)
			if loopbackCDPURL != "" &&
				(c.Config.ServerConfig.Upstream.UpstreamWSCDPURL == "" ||
					c.Config.ServerConfig.Upstream.UpstreamWSCDPURL == initialCDPURL ||
					c.Config.ServerConfig.Upstream.UpstreamWSCDPURL == launchedCDPURL) {
				c.Config.ServerConfig.Upstream.UpstreamWSCDPURL = loopbackCDPURL
			}
		}
	}
	return nil
}

func (c *ModCDPClient) serverNeedsLoopbackCDP() bool {
	if c.Config.ServerConfig == nil || c.Config.ServerConfig.Upstream.UpstreamWSCDPURL != "" {
		return false
	}
	return c.Config.ServerConfig.Router.RouterRoutes["*.*"] == "loopback_cdp"
}

func (c *ModCDPClient) ensureModCDPServerConfigured() error {
	if c.Config.ServerConfig == nil || c.transport == nil {
		return nil
	}
	if err := c.transport.WaitForPeer(); err != nil {
		return err
	}
	peerGeneration := c.transport.PeerGeneration()
	if peerGeneration == c.configuredPeerGeneration {
		return nil
	}
	if _, err := c.transport.Send("Mod.configure", c.serverConfigureParams(nil, nil, nil), ""); err != nil {
		return err
	}
	c.configuredPeerGeneration = peerGeneration
	return nil
}

func (c *ModCDPClient) upstreamTransportConfig() map[string]any {
	return map[string]any{
		"upstream_ws_cdp_url":                         c.Config.Upstream.UpstreamWSCDPURL,
		"upstream_ws_connect_error_settle_timeout_ms": c.Config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS,
		"upstream_cdp_send_timeout_ms":                c.Config.Upstream.UpstreamCDPSendTimeoutMS,
	}
}

func (c *ModCDPClient) initializeRawCDPTransport() error {
	if _, err := c.transport.Send("Target.setAutoAttach", map[string]any{
		"autoAttach":             true,
		"waitForDebuggerOnStart": false,
		"flatten":                true,
	}, ""); err != nil {
		return err
	}
	if _, err := c.transport.Send("Target.setDiscoverTargets", map[string]any{"discover": true}, ""); err != nil {
		return err
	}
	return nil
}

func transportURL(transport upstreamTransportClient) string {
	switch typed := transport.(type) {
	case *WSUpstreamTransport:
		return typed.URL
	default:
		return ""
	}
}

func (c *ModCDPClient) serverConfigureParams(customCommands []map[string]any, customEvents []map[string]any, customMiddlewares []map[string]any) map[string]any {
	if customCommands == nil {
		customCommands = []map[string]any{}
	}
	if customEvents == nil {
		customEvents = []map[string]any{}
	}
	if customMiddlewares == nil {
		customMiddlewares = []map[string]any{}
	}
	upstream := map[string]any{
		"upstream_ws_connect_error_settle_timeout_ms": c.Config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS,
	}
	router := map[string]any{
		"loopback_execution_context_timeout_ms": c.Config.Injector.InjectorExecutionContextTimeoutMS,
	}
	clientConfig := map[string]any{
		"client_cdp_send_timeout_ms": c.Config.ClientConfig.ClientCDPSendTimeoutMS,
	}
	downstream := map[string]any{
		"downstream_client_timeout_ms": maxInt(c.Config.ClientConfig.ClientHeartbeatIntervalMS*4, 1_000),
	}
	params := map[string]any{}
	if c.Config.ServerConfig != nil {
		if c.Config.ServerConfig.Upstream.UpstreamWSCDPURL != "" {
			upstream["upstream_ws_cdp_url"] = c.Config.ServerConfig.Upstream.UpstreamWSCDPURL
		}
		if c.Config.ServerConfig.Upstream.UpstreamWSConnectErrorSettleTimeoutMS != 0 {
			upstream["upstream_ws_connect_error_settle_timeout_ms"] = c.Config.ServerConfig.Upstream.UpstreamWSConnectErrorSettleTimeoutMS
		}
		if c.Config.ServerConfig.Router.RouterRoutes != nil {
			router["router_routes"] = c.Config.ServerConfig.Router.RouterRoutes
		}
		if c.Config.ServerConfig.Router.LoopbackExecutionContextTimeoutMS != 0 {
			router["loopback_execution_context_timeout_ms"] = c.Config.ServerConfig.Router.LoopbackExecutionContextTimeoutMS
		}
		if c.Config.ServerConfig.ClientConfig.ClientCDPSendTimeoutMS != 0 {
			clientConfig["client_cdp_send_timeout_ms"] = c.Config.ServerConfig.ClientConfig.ClientCDPSendTimeoutMS
		}
		if c.Config.ServerConfig.Downstream.DownstreamClientTimeoutMS != 0 {
			downstream["downstream_client_timeout_ms"] = c.Config.ServerConfig.Downstream.DownstreamClientTimeoutMS
		}
		if c.Config.ServerConfig.Downstream.DownstreamCloseBrowserOnDisconnect != nil {
			downstream["downstream_close_browser_on_disconnect"] = *c.Config.ServerConfig.Downstream.DownstreamCloseBrowserOnDisconnect
		}
		if c.Config.ServerConfig.ServerBrowserToken != "" {
			params["server_browser_token"] = c.Config.ServerConfig.ServerBrowserToken
		}
	}
	params["upstream"] = upstream
	params["router"] = router
	params["client_config"] = clientConfig
	params["downstream"] = downstream
	params["custom_commands"] = customCommands
	params["custom_events"] = customEvents
	params["custom_middlewares"] = customMiddlewares
	return params
}

func normalizeModCDPName(name string) (string, error) {
	normalized := strings.TrimSpace(name)
	if normalized == "" {
		return "", fmt.Errorf("name must be a non-empty string")
	}
	if strings.Count(normalized, ".") != 1 {
		return "", fmt.Errorf("name must be in Domain.method form")
	}
	parts := strings.Split(normalized, ".")
	if parts[0] == "" || parts[1] == "" {
		return "", fmt.Errorf("name must be in Domain.method form")
	}
	return normalized, nil
}

func cloneSchema(schema map[string]any) map[string]any {
	if schema == nil {
		return nil
	}
	normalized, _ := abxjsonschema.Normalize(schema).(map[string]any)
	if normalized == nil {
		return nil
	}
	return normalized
}

func nativeResultSchema(schema map[string]any) map[string]any {
	normalized := cloneSchema(schema)
	allowNativeResultExtensions(normalized)
	return normalized
}

func allowNativeResultExtensions(schema map[string]any) {
	if schema == nil {
		return
	}
	if schemaType, _ := schema["type"].(string); schemaType == "object" {
		schema["additionalProperties"] = true
		if properties, ok := schema["properties"].(map[string]any); ok {
			for _, property := range properties {
				if propertySchema, ok := property.(map[string]any); ok {
					allowNativeResultExtensions(propertySchema)
				}
			}
		}
	}
	if items, ok := schema["items"].(map[string]any); ok {
		allowNativeResultExtensions(items)
	}
	for _, key := range []string{"anyOf", "oneOf", "allOf"} {
		if schemas, ok := schema[key].([]any); ok {
			for _, entry := range schemas {
				if entrySchema, ok := entry.(map[string]any); ok {
					allowNativeResultExtensions(entrySchema)
				}
			}
		}
	}
}

func (c *ModCDPClient) Send(method string, params map[string]any, sessionID ...string) (any, error) {
	cdpSessionID := ""
	if len(sessionID) > 0 {
		cdpSessionID = sessionID[0]
	}
	return c.sendCommand(method, params, cdpSessionID, true)
}

func (d ModDomain) Evaluate(params map[string]any) (any, error) {
	return d.client.Send("Mod.evaluate", params)
}

func (d ModDomain) AddCustomCommand(params CustomCommand) (any, error) {
	commandParams := map[string]any{"name": params.Name}
	if params.Expression != "" {
		commandParams["expression"] = params.Expression
	}
	if params.ParamsSchema != nil {
		commandParams["params_schema"] = params.ParamsSchema
	}
	if params.ResultSchema != nil {
		commandParams["result_schema"] = params.ResultSchema
	}
	return d.client.Send("Mod.addCustomCommand", commandParams)
}

func (d ModDomain) AddCustomEvent(params CustomEvent) (any, error) {
	eventParams := map[string]any{"name": params.Name}
	if params.EventSchema != nil {
		eventParams["event_schema"] = params.EventSchema
	}
	return d.client.Send("Mod.addCustomEvent", eventParams)
}

func (d ModDomain) AddMiddleware(params CustomMiddleware) (any, error) {
	middlewareParams := map[string]any{
		"phase":      params.Phase,
		"expression": params.Expression,
	}
	if params.Name != "" {
		middlewareParams["name"] = params.Name
	}
	return d.client.Send("Mod.addMiddleware", middlewareParams)
}

func (d ModDomain) Configure(params map[string]any) (any, error) {
	return d.client.Send("Mod.configure", params)
}

func (d ModDomain) Ping(params map[string]any) (any, error) {
	return d.client.Send("Mod.ping", params)
}

func (d ModDomain) GetTopology(params map[string]any) (any, error) {
	return d.client.Send("Mod.getTopology", params)
}

func (c *ModCDPClient) sendCommand(method string, params map[string]any, cdpSessionID string, validateSchema bool) (any, error) {
	startedAt := time.Now().UnixMilli()
	if params == nil {
		params = map[string]any{}
	}
	preparation, err := c.Types.PrepareCommand(
		method,
		params,
		method == "Mod.addCustomCommand" || ((method == "Mod.addCustomEvent" || method == "Mod.addMiddleware") && c.ExtSessionID == ""),
	)
	if err != nil {
		return nil, err
	}
	if preparation.LocalResult != nil {
		completedAt := time.Now().UnixMilli()
		c.LastCommandTiming = map[string]any{
			"method":       method,
			"target":       "client",
			"started_at":   startedAt,
			"completed_at": completedAt,
			"duration_ms":  completedAt - startedAt,
		}
		return preparation.LocalResult, nil
	}
	params = preparation.Params
	if c.Config.Upstream.UpstreamMode != "ws" {
		if method != "Mod.configure" {
			if err := c.ensureModCDPServerConfigured(); err != nil {
				return nil, err
			}
		}
		rawResult, err := c.transport.Send(method, params, "")
		var result any = rawResult
		completedAt := time.Now().UnixMilli()
		c.LastCommandTiming = map[string]any{
			"method":       method,
			"target":       "modcdp_server",
			"started_at":   startedAt,
			"completed_at": completedAt,
			"duration_ms":  completedAt - startedAt,
		}
		if err != nil {
			return nil, err
		}
		if method == "Mod.configure" && c.transport != nil {
			c.configuredPeerGeneration = c.transport.PeerGeneration()
		}
		if validateSchema {
			var err error
			result, err = c.Types.ParseCommandResult(method, result)
			if err != nil {
				return nil, err
			}
		}
		return result, nil
	}
	command, err := translate.WrapCommandIfNeeded(method, params, c.Config.Router.RouterRoutes, cdpSessionID)
	if err != nil {
		return nil, err
	}
	var result any
	if command.Target == "direct_cdp" {
		step := command.Steps[0]
		result, err = c.transport.Send(step.Method, step.Params, step.SessionID)
	} else if command.Target == "service_worker" {
		var rawResult map[string]any
		unwrap := ""
		for _, step := range command.Steps {
			stepParams := step.Params
			if stepParams == nil {
				stepParams = map[string]any{}
			}
			if step.Method == "Runtime.callFunctionOn" {
				if _, exists := stepParams["executionContextId"]; !exists {
					if c.ExtExecutionContextID == 0 {
						contextID, contextErr := c.Router.WaitForExecutionContext(c.ExtSessionID, c.Config.Injector.InjectorExecutionContextTimeoutMS)
						if contextErr != nil {
							return nil, contextErr
						}
						c.ExtExecutionContextID = contextID
					}
					nextParams := map[string]any{}
					for key, value := range stepParams {
						nextParams[key] = value
					}
					nextParams["executionContextId"] = c.ExtExecutionContextID
					stepParams = nextParams
				}
			}
			rawResult, err = c.transport.Send(step.Method, stepParams, c.ExtSessionID)
			if err != nil {
				return nil, err
			}
			unwrap = step.Unwrap
		}
		result, err = translate.UnwrapResponseIfNeeded(rawResult, unwrap)
	} else {
		err = fmt.Errorf("unsupported command target %q", command.Target)
	}
	completedAt := time.Now().UnixMilli()
	c.LastCommandTiming = map[string]any{
		"method":       method,
		"target":       command.Target,
		"started_at":   startedAt,
		"completed_at": completedAt,
		"duration_ms":  completedAt - startedAt,
	}
	if err != nil {
		return nil, err
	}
	if validateSchema {
		var err error
		result, err = c.Types.ParseCommandResult(method, result)
		if err != nil {
			return nil, err
		}
	}
	return result, nil
}

func (c *ModCDPClient) On(event string, handler Handler) *ModCDPClient {
	c.handlersMu.Lock()
	defer c.handlersMu.Unlock()
	pointer := handlerPointer(handler)
	for _, existing := range c.handlers[event] {
		if existing.pointer == pointer {
			return c
		}
	}
	c.handlers[event] = append(c.handlers[event], handlerEntry{handler: handler, pointer: pointer})
	return c
}

func (c *ModCDPClient) Once(event string, handler Handler) *ModCDPClient {
	var wrapped Handler
	wrapped = func(data any) {
		c.Off(event, wrapped)
		handler(data)
	}
	return c.On(event, wrapped)
}

func (c *ModCDPClient) Off(event string, handler Handler) *ModCDPClient {
	c.handlersMu.Lock()
	defer c.handlersMu.Unlock()
	pointer := handlerPointer(handler)
	entries := c.handlers[event]
	filtered := entries[:0]
	for _, entry := range entries {
		if entry.pointer != pointer {
			filtered = append(filtered, entry)
		}
	}
	if len(filtered) == 0 {
		delete(c.handlers, event)
	} else {
		c.handlers[event] = filtered
	}
	return c
}

func handlerPointer(handler Handler) uintptr {
	if handler == nil {
		return 0
	}
	return reflect.ValueOf(handler).Pointer()
}

func (c *ModCDPClient) Close() {
	c.stopHeartbeat()
	if c.launchedBrowser != nil {
		c.launchedBrowser.Close()
		c.launchedBrowser = nil
	}
	if c.transport != nil {
		_ = c.transport.Close()
		c.transport = nil
	}
	for _, injector := range c.extensionInjectors {
		_ = injector.Close()
	}
	c.extensionInjectors = nil
}

func (c *ModCDPClient) browserLauncher() browserLauncherClient {
	switch c.Config.Launcher.LauncherMode {
	case "local":
		return NewLocalBrowserLauncher(c.Config.Launcher)
	case "remote":
		return NewRemoteBrowserLauncher(c.Config.Launcher)
	case "bb":
		return NewBBBrowserLauncher(c.Config.Launcher)
	case "none":
		return NewNoneBrowserLauncher(c.Config.Launcher)
	default:
		return nil
	}
}

func (c *ModCDPClient) upstreamTransport() upstreamTransportClient {
	switch c.Config.Upstream.UpstreamMode {
	case "ws":
		return NewWSUpstreamTransport(c.Config.Upstream)
	default:
		return nil
	}
}

func (c *ModCDPClient) extensionInjectorsForConfig() []extensionInjector {
	if c.Config.Injector.InjectorMode == "none" {
		return nil
	}
	if c.Config.Injector.InjectorMode == "cli" {
		injector := NewCLIExtensionInjector(InjectorConfig{})
		return []extensionInjector{&injector}
	}
	if c.Config.Injector.InjectorMode == "cdp" {
		injector := NewCDPExtensionInjector(InjectorConfig{})
		return []extensionInjector{&injector}
	}
	if c.Config.Injector.InjectorMode == "bb" {
		injector := NewBBExtensionInjector(InjectorConfig{})
		return []extensionInjector{&injector}
	}
	if c.Config.Injector.InjectorMode == "discover" {
		injector := NewDiscoverExtensionInjector(InjectorConfig{})
		return []extensionInjector{&injector}
	}
	if c.Config.Injector.InjectorMode == "borrow" {
		injector := NewBorrowExtensionInjector(InjectorConfig{})
		return []extensionInjector{&injector}
	}
	return nil
}

func isKnownLaunchMode(mode string) bool {
	return mode == "local" || mode == "remote" || mode == "bb" || mode == "none"
}

func isKnownUpstreamMode(mode string) bool {
	return mode == "ws"
}

func isKnownExtensionMode(mode string) bool {
	return mode == "cli" || mode == "cdp" || mode == "bb" || mode == "discover" || mode == "borrow" || mode == "none"
}

func (c *ModCDPClient) baseInjectorConfig(send SendCDP) InjectorConfig {
	trustMatchedServiceWorker := c.trustServiceWorkerTarget()
	return InjectorConfig{
		Send:                                 send,
		InjectorCLIExtensionPath:             c.Config.Injector.InjectorCLIExtensionPath,
		InjectorCLIExtensionID:               c.Config.Injector.InjectorCLIExtensionID,
		InjectorCDPExtensionPath:             c.Config.Injector.InjectorCDPExtensionPath,
		InjectorCDPExtensionID:               c.Config.Injector.InjectorCDPExtensionID,
		InjectorBBExtensionPath:              c.Config.Injector.InjectorBBExtensionPath,
		InjectorBBExtensionID:                c.Config.Injector.InjectorBBExtensionID,
		InjectorDiscoverExtensionPath:        c.Config.Injector.InjectorDiscoverExtensionPath,
		InjectorBorrowExtensionPath:          c.Config.Injector.InjectorBorrowExtensionPath,
		InjectorServiceWorkerExtensionID:     c.Config.Injector.InjectorServiceWorkerExtensionID,
		InjectorServiceWorkerURLIncludes:     c.Config.Injector.InjectorServiceWorkerURLIncludes,
		InjectorServiceWorkerURLSuffixes:     c.Config.Injector.InjectorServiceWorkerURLSuffixes,
		InjectorTrustServiceWorkerTarget:     trustMatchedServiceWorker,
		InjectorRequireServiceWorkerTarget:   c.Config.Injector.InjectorRequireServiceWorkerTarget || c.Config.Injector.InjectorMode == "discover",
		InjectorServiceWorkerReadyExpression: c.Config.Injector.InjectorServiceWorkerReadyExpression,
		InjectorCDPSendTimeoutMS:             c.Config.ClientConfig.ClientCDPSendTimeoutMS,
		InjectorExecutionContextTimeoutMS:    c.Config.Injector.InjectorExecutionContextTimeoutMS,
		InjectorServiceWorkerProbeTimeoutMS:  c.Config.Injector.InjectorServiceWorkerProbeTimeoutMS,
		InjectorServiceWorkerReadyTimeoutMS:  c.Config.Injector.InjectorServiceWorkerReadyTimeoutMS,
		InjectorServiceWorkerPollIntervalMS:  c.Config.Injector.InjectorServiceWorkerPollIntervalMS,
		InjectorTargetSessionPollIntervalMS:  c.Config.Injector.InjectorTargetSessionPollIntervalMS,
		InjectorBBAPIKey:                     c.Config.Injector.InjectorBBAPIKey,
		InjectorBBBaseURL:                    c.Config.Injector.InjectorBBBaseURL,
	}
}

func (c *ModCDPClient) injectExtension(injectors []extensionInjector) (*ExtensionInjectionResult, error) {
	if len(injectors) == 0 {
		return nil, fmt.Errorf("injector.injector_mode='none' cannot be used with a raw_cdp upstream")
	}
	send := func(method string, params map[string]any, sessionID string) (map[string]any, error) {
		if c.transport == nil {
			return nil, fmt.Errorf("ModCDP upstream is not connected")
		}
		return c.transport.Send(method, params, sessionID, time.Duration(c.Config.ClientConfig.ClientCDPSendTimeoutMS)*time.Millisecond)
	}
	var errors []string
	for _, injector := range injectors {
		injector.Update(c.baseInjectorConfig(send))
		if err := injector.Prepare(); err != nil {
			errors = append(errors, fmt.Sprintf("%T: %v", injector, err))
			continue
		}
		result, err := injector.Inject()
		if err != nil {
			errors = append(errors, fmt.Sprintf("%T: %v", injector, err))
			continue
		}
		if result != nil {
			return result, nil
		}
	}
	return nil, fmt.Errorf("cannot install, discover, or borrow the ModCDP extension in the running browser.%s", formatInjectorErrors(errors))
}

func formatInjectorErrors(errors []string) string {
	if len(errors) == 0 {
		return ""
	}
	return "\n\n" + strings.Join(errors, "\n")
}

func (c *ModCDPClient) measurePingLatency() error {
	sent_at := time.Now().UnixMilli()
	ch := make(chan any, 1)
	c.Once("Mod.pong", func(data any) {
		select {
		case ch <- data:
		default:
		}
	})
	if _, err := c.Send("Mod.ping", map[string]any{"sent_at": sent_at}); err != nil {
		return err
	}
	select {
	case payload := <-ch:
		returned_at := time.Now().UnixMilli()
		latency := map[string]any{
			"sent_at":           sent_at,
			"received_at":       nil,
			"returned_at":       returned_at,
			"round_trip_ms":     returned_at - sent_at,
			"service_worker_ms": nil,
			"return_path_ms":    nil,
		}
		if data, ok := payload.(map[string]any); ok {
			if received_at, ok := numberAsInt64(data["received_at"]); ok {
				latency["received_at"] = received_at
				latency["service_worker_ms"] = received_at - sent_at
				latency["return_path_ms"] = returned_at - received_at
			}
		}
		c.Latency = latency
		return nil
	case <-time.After(time.Duration(c.Config.ClientConfig.ClientEventWaitTimeoutMS) * time.Millisecond):
		return fmt.Errorf("Mod.pong timed out")
	}
}

func (c *ModCDPClient) startPingLatencyMeasurement() {
	_ = c.measurePingLatency()
}

func (c *ModCDPClient) startHeartbeat() {
	c.stopHeartbeat()
	if c.Config.ServerConfig == nil || c.Config.ServerConfig.Downstream.DownstreamCloseBrowserOnDisconnect == nil || !*c.Config.ServerConfig.Downstream.DownstreamCloseBrowserOnDisconnect {
		return
	}
	interval := c.Config.ClientConfig.ClientHeartbeatIntervalMS
	if interval <= 0 {
		return
	}
	stop := make(chan struct{})
	c.heartbeatStop = stop
	go func() {
		ticker := time.NewTicker(time.Duration(interval) * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if _, err := c.Send("Mod.ping", map[string]any{"sent_at": time.Now().UnixMilli()}); err != nil {
					return
				}
			case <-stop:
				return
			}
		}
	}()
}

func (c *ModCDPClient) stopHeartbeat() {
	if c.heartbeatStop == nil {
		return
	}
	close(c.heartbeatStop)
	c.heartbeatStop = nil
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}

func numberAsInt64(value any) (int64, bool) {
	switch v := value.(type) {
	case int64:
		return v, true
	case int:
		return int64(v), true
	case float64:
		return int64(v), true
	default:
		return 0, false
	}
}

func (c *ModCDPClient) handleMessage(msg map[string]any) {
	if _, ok := msg["id"]; ok {
		return
	}
	c.handleEventMessage(msg)
}

func (c *ModCDPClient) handleEventMessage(msg map[string]any) {
	method, _ := msg["method"].(string)
	sessionID, _ := msg["sessionId"].(string)
	params, _ := msg["params"].(map[string]any)
	c.Router.RecordProtocolEvent(method, params, sessionID)
	if c.ExtSessionID != "" && sessionID == c.ExtSessionID {
		if event, data, ok := translate.UnwrapEventIfNeeded(method, params, sessionID, c.ExtSessionID); ok {
			validatedData, valid := c.Types.ParseEventPayload(event, data)
			if !valid {
				return
			}
			c.handlersMu.Lock()
			hs := append([]handlerEntry(nil), c.handlers[event]...)
			c.handlersMu.Unlock()
			for _, h := range hs {
				go h.handler(validatedData)
			}
		}
		return
	}
	if method != "" {
		validatedParams, valid := c.Types.ParseEventPayload(method, params)
		if !valid {
			return
		}
		c.handlersMu.Lock()
		hs := append([]handlerEntry(nil), c.handlers[method]...)
		c.handlersMu.Unlock()
		for _, h := range hs {
			go h.handler(validatedParams)
		}
	}
}

func (c *ModCDPClient) trustServiceWorkerTarget() bool {
	if c.Config.Injector.InjectorTrustServiceWorkerTarget || len(c.Config.Injector.InjectorServiceWorkerURLIncludes) > 0 {
		return true
	}
	for _, suffix := range c.Config.Injector.InjectorServiceWorkerURLSuffixes {
		parts := 0
		for _, part := range strings.Split(suffix, "/") {
			if part != "" {
				parts++
			}
		}
		if parts > 1 {
			return true
		}
	}
	return false
}
