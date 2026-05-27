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
//	Injector       raw-CDP extension discovery/injection.
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
type RouterConfig = types.ModCDPRouterConfig
type ExtensionInjector = injector.ExtensionInjector
type DiscoverExtensionInjector = injector.DiscoverExtensionInjector
type BBExtensionInjector = injector.BBExtensionInjector
type CLIExtensionInjector = injector.CLIExtensionInjector
type CDPExtensionInjector = injector.CDPExtensionInjector
type UpstreamMode = transportpkg.UpstreamMode
type UpstreamTransportConfig = types.UpstreamTransportConfig
type UpstreamTransport = transportpkg.UpstreamTransport
type WSUpstreamTransport = transportpkg.WSUpstreamTransport
type AutoSessionRouter = router.AutoSessionRouter
type CustomCommand = types.ModCDPAddCustomCommandParams
type CustomEvent = types.ModCDPAddCustomEventObjectParams
type CustomMiddleware = types.ModCDPAddMiddlewareParams

var NewLocalBrowserLauncher = launcher.NewLocalBrowserLauncher
var NewRemoteBrowserLauncher = launcher.NewRemoteBrowserLauncher
var NewBBBrowserLauncher = launcher.NewBBBrowserLauncher
var NewNoneBrowserLauncher = launcher.NewNoneBrowserLauncher
var NewDiscoverExtensionInjector = injector.NewDiscoverExtensionInjector
var NewBBExtensionInjector = injector.NewBBExtensionInjector
var NewCLIExtensionInjector = injector.NewCLIExtensionInjector
var NewCDPExtensionInjector = injector.NewCDPExtensionInjector
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

type CDPTypesConfig struct {
	CustomCommands    []CustomCommand    `json:"custom_commands,omitempty"`
	CustomEvents      []CustomEvent      `json:"custom_events,omitempty"`
	CustomMiddlewares []CustomMiddleware `json:"custom_middlewares,omitempty"`
}

type ServerConfig struct {
	Upstream           UpstreamTransportConfig      `json:"upstream,omitempty"`
	Router             RouterConfig                 `json:"router,omitempty"`
	ClientConfig       ClientConfig                 `json:"client_config,omitempty"`
	Downstream         types.ModCDPDownstreamConfig `json:"downstream,omitempty"`
	ServerBrowserToken string                       `json:"server_browser_token,omitempty"`
	CustomCommands     []CustomCommand              `json:"custom_commands,omitempty"`
	CustomEvents       []CustomEvent                `json:"custom_events,omitempty"`
	CustomMiddlewares  []CustomMiddleware           `json:"custom_middlewares,omitempty"`
	disabled           bool
}

var ServerConfigNone = &ServerConfig{disabled: true}

type ClientConfig = types.ModCDPClientConfig

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

type Handler any

type handlerEntry struct {
	handler reflect.Value
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
	Launcher                 browserLauncherClient
	Injector                 *ExtensionInjector
	Upstream                 upstreamTransportClient
	handlers                 map[string][]handlerEntry
	handlersMu               sync.Mutex
	Router                   *AutoSessionRouter
	Latency                  map[string]any
	ConnectTiming            map[string]any
	LastCommandTiming        map[string]any
	extensionInjectors       []extensionInjector
	configuredPeerGeneration int64
	heartbeatStop            chan struct{}
}

type extensionInjector interface {
	Update(InjectorConfig) *ExtensionInjector
	RecordInjectionResult(*ExtensionInjectionResult) *ExtensionInjector
	ConfigForLauncher() LauncherConfig
	ConfigForUpstream() map[string]any
	Prepare() error
	Inject() (*ExtensionInjectionResult, error)
	Close() error
}

type browserLauncherClient interface {
	Update(LauncherConfig) *BrowserLauncher
	ConfigForUpstream() map[string]any
	ConfigForServer(UpstreamTransportConfig) map[string]any
	Launch(LauncherConfig) (*LaunchedBrowser, error)
	Close()
}

type upstreamTransportClient interface {
	Update(map[string]any)
	Connect() error
	Close() error
	Send(command any, params map[string]any, sessionID string, timeout ...time.Duration) (map[string]any, error)
	ConfigForLauncher() LauncherConfig
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
	upstream := NewWSUpstreamTransport(config.Upstream)
	client := &ModCDPClient{
		Config:   config,
		Types:    NewCDPTypes(typesConfig.CustomCommands, typesConfig.CustomEvents, typesConfig.CustomMiddlewares),
		Upstream: upstream,
		handlers: map[string][]handlerEntry{},
	}
	client.Mod = ModDomain{client: client}
	client.Router = NewAutoSessionRouter(&upstream.UpstreamTransport, client.Types, config.Router)
	client.Launcher = client.browserLauncher()
	injectors, selectedInjector := client.extensionInjectorsForConfig()
	if len(injectors) > 0 {
		client.Injector = selectedInjector
		client.extensionInjectors = injectors
	}
	if *client.Config.ClientConfig.ClientHydrateAliases {
		initCDPSurface(client)
	}
	return client
}

func (c *ModCDPClient) ToJSON() map[string]any {
	children := map[string]types.ModCDPJSONChild{}
	if child, ok := c.Launcher.(types.ModCDPJSONChild); ok {
		children["launcher"] = child
	}
	if child, ok := c.Upstream.(types.ModCDPJSONChild); ok {
		children["upstream"] = child
	}
	if c.Injector != nil {
		children["injector"] = c.Injector
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
	if c.Upstream != nil {
		c.Upstream.Update(map[string]any{"upstream_cdp_send_timeout_ms": c.Config.ClientConfig.ClientCDPSendTimeoutMS})
	}
	if config.Upstream.UpstreamMode != "" || config.Upstream.UpstreamWSCDPURL != "" || config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS != 0 || config.Upstream.UpstreamCDPSendTimeoutMS != 0 {
		if config.Upstream.UpstreamMode != "" {
			c.Config.Upstream.UpstreamMode = config.Upstream.UpstreamMode
		}
		if config.Upstream.UpstreamWSCDPURL != "" {
			c.Config.Upstream.UpstreamWSCDPURL = config.Upstream.UpstreamWSCDPURL
		}
		if config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS != 0 {
			c.Config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS = config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS
		}
		if config.Upstream.UpstreamCDPSendTimeoutMS != 0 {
			c.Config.Upstream.UpstreamCDPSendTimeoutMS = config.Upstream.UpstreamCDPSendTimeoutMS
		}
		if c.Upstream != nil {
			c.Upstream.Update(c.upstreamTransportConfig())
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
	if c.Router != nil {
		if c.Config.Router.RouterRoutes == nil {
			c.Config.Router.RouterRoutes = translate.DefaultClientRoutes()
		}
		if c.Config.Router.LoopbackExecutionContextTimeoutMS == 0 {
			c.Config.Router.LoopbackExecutionContextTimeoutMS = DefaultExecutionContextTimeoutMS
		}
		c.Router.Config = c.Config.Router
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
	if c.Upstream == nil {
		return fmt.Errorf("upstream transport did not connect")
	}
	c.Upstream.OnRecv(func(message map[string]any) { c.handleMessage(message) })
	c.Upstream.OnClose(func(err error) {
		c.stopHeartbeat()
	})
	if c.Config.Injector.InjectorMode == "none" && c.Config.ServerConfig == nil {
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
	if err := c.Router.Start(); err != nil {
		c.Close()
		return err
	}
	extensionStartedAt := time.Now().UnixMilli()
	ext, injectorState, err := c.injectExtension(c.extensionInjectors)
	if err != nil {
		c.Close()
		return err
	}
	extensionCompletedAt := time.Now().UnixMilli()
	if injectorState.TargetID == "" || injectorState.SessionID == "" {
		c.Close()
		return fmt.Errorf("%T did not record a ModCDP extension target", c.Injector)
	}
	if _, err := c.Router.Send("Runtime.enable", map[string]any{}, injectorState.SessionID); err != nil {
		c.Close()
		return err
	}
	if _, err := c.Router.Send("Runtime.addBinding", map[string]any{"name": translate.CustomEventBindingName}, injectorState.SessionID); err != nil {
		c.Close()
		return err
	}
	mirrorUpstreamEvents := true
	if c.Config.ClientConfig.ClientMirrorUpstreamEvents != nil {
		mirrorUpstreamEvents = *c.Config.ClientConfig.ClientMirrorUpstreamEvents
	}
	if mirrorUpstreamEvents {
		if _, err := c.Router.Send("Runtime.addBinding", map[string]any{"name": translate.UpstreamEventBindingName}, injectorState.SessionID); err != nil {
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
	if wsTransport, ok := c.Upstream.(*WSUpstreamTransport); ok && wsTransport.Conn != nil {
		return nil
	}
	if !isKnownLaunchMode(c.Config.Launcher.LauncherMode) {
		return fmt.Errorf("unknown launcher_mode=%s", c.Config.Launcher.LauncherMode)
	}
	if !isKnownUpstreamMode(c.Config.Upstream.UpstreamMode) {
		return fmt.Errorf("unknown upstream_mode=%s", c.Config.Upstream.UpstreamMode)
	}
	if !isKnownExtensionMode(c.Config.Injector.InjectorMode) {
		return fmt.Errorf("unknown injector.injector_mode=%s", c.Config.Injector.InjectorMode)
	}
	launcher := c.Launcher
	if launcher == nil {
		launcher = c.browserLauncher()
		c.Launcher = launcher
	}
	transport := c.Upstream
	if transport == nil {
		transport = c.upstreamTransport()
	}
	injectors := c.extensionInjectors
	if len(injectors) == 0 && c.Config.Injector.InjectorMode != "none" {
		injectors, selectedInjector := c.extensionInjectorsForConfig()
		c.extensionInjectors = injectors
		if len(injectors) > 0 {
			c.Injector = selectedInjector
		}
	}
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

	launchedCDPURL := ""
	if c.Config.Launcher.LauncherMode != "none" {
		launched, err := launcher.Launch(LauncherConfig{})
		if err != nil {
			_ = transport.Close()
			return err
		}
		transport.Update(launcher.ConfigForUpstream())
		for _, injector := range injectors {
			transport.Update(injector.ConfigForUpstream())
		}
		launchedCDPURL = launched.CDPURL
	}
	if err := transport.Connect(); err != nil {
		return err
	}

	c.Upstream = transport
	transportURL := transportURL(transport)
	c.CDPURL = firstNonEmptyString(transportURL, launchedCDPURL)
	if wsTransport, ok := transport.(*WSUpstreamTransport); ok && wsTransport.URL != "" {
		// For ws mode, cdp_url has been resolved to the concrete WebSocket CDP endpoint after connect().
		c.Config.Upstream.UpstreamWSCDPURL = wsTransport.URL
	}

	serverConfig := map[string]any{}
	for key, value := range launcher.ConfigForServer(c.Config.Upstream) {
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
				c.Config.ServerConfig.Upstream.UpstreamMode = "ws"
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
	if c.Config.ServerConfig == nil || c.Upstream == nil {
		return nil
	}
	if err := c.Upstream.WaitForPeer(); err != nil {
		return err
	}
	peerGeneration := c.Upstream.PeerGeneration()
	if peerGeneration == c.configuredPeerGeneration {
		return nil
	}
	if _, err := c.Upstream.Send("Mod.configure", c.serverConfigureParams(nil, nil, nil), ""); err != nil {
		return err
	}
	c.configuredPeerGeneration = peerGeneration
	return nil
}

func (c *ModCDPClient) upstreamTransportConfig() map[string]any {
	return map[string]any{
		"upstream_mode":       c.Config.Upstream.UpstreamMode,
		"upstream_ws_cdp_url": c.Config.Upstream.UpstreamWSCDPURL,
		"upstream_ws_connect_error_settle_timeout_ms": c.Config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS,
		"upstream_cdp_send_timeout_ms":                c.Config.Upstream.UpstreamCDPSendTimeoutMS,
	}
}

func transportURL(upstream upstreamTransportClient) string {
	switch typed := upstream.(type) {
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
	upstream := map[string]any{}
	hasUpstreamConfig := false
	router := map[string]any{
		"loopback_execution_context_timeout_ms": c.Config.Injector.InjectorExecutionContextTimeoutMS,
	}
	clientConfig := map[string]any{
		"client_cdp_send_timeout_ms": c.Config.ClientConfig.ClientCDPSendTimeoutMS,
	}
	params := map[string]any{}
	if c.Config.ServerConfig != nil {
		serverUpstream := c.Config.ServerConfig.Upstream
		if serverUpstream.UpstreamMode != "" {
			upstream["upstream_mode"] = serverUpstream.UpstreamMode
		}
		if serverUpstream.UpstreamWSCDPURL != "" {
			upstream["upstream_ws_cdp_url"] = serverUpstream.UpstreamWSCDPURL
		}
		if serverUpstream.UpstreamWSConnectErrorSettleTimeoutMS != 0 {
			upstream["upstream_ws_connect_error_settle_timeout_ms"] = serverUpstream.UpstreamWSConnectErrorSettleTimeoutMS
		}
		if serverUpstream.UpstreamCDPSendTimeoutMS != 0 {
			upstream["upstream_cdp_send_timeout_ms"] = serverUpstream.UpstreamCDPSendTimeoutMS
		}
		if len(upstream) > 0 {
			hasUpstreamConfig = true
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
		downstream := map[string]any{}
		if c.Config.ServerConfig.Downstream.DownstreamClientTimeoutMS != 0 {
			downstream["downstream_client_timeout_ms"] = c.Config.ServerConfig.Downstream.DownstreamClientTimeoutMS
		}
		if c.Config.ServerConfig.Downstream.DownstreamCloseBrowserOnDisconnect != nil {
			downstream["downstream_close_browser_on_disconnect"] = *c.Config.ServerConfig.Downstream.DownstreamCloseBrowserOnDisconnect
		}
		if len(downstream) > 0 {
			params["downstream"] = downstream
		}
		if c.Config.ServerConfig.ServerBrowserToken != "" {
			params["server_browser_token"] = c.Config.ServerConfig.ServerBrowserToken
		}
	}
	if hasUpstreamConfig {
		if _, ok := upstream["upstream_ws_connect_error_settle_timeout_ms"]; !ok {
			upstream["upstream_ws_connect_error_settle_timeout_ms"] = c.Config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS
		}
		params["upstream"] = upstream
	}
	params["router"] = router
	params["client_config"] = clientConfig
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
		method == "Mod.addCustomCommand" || ((method == "Mod.addCustomEvent" || method == "Mod.addMiddleware") && (c.Injector == nil || c.Injector.SessionID == "")),
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
		if validateSchema {
			parsed, parseErr := c.Types.ParseCommandResult(method, preparation.LocalResult)
			if parseErr != nil {
				return nil, parseErr
			}
			return parsed, nil
		}
		return preparation.LocalResult, nil
	}
	params = preparation.Params
	if c.Config.Injector.InjectorMode == "none" && c.Config.ServerConfig == nil {
		result, err := c.Router.Send(method, params, cdpSessionID)
		completedAt := time.Now().UnixMilli()
		c.LastCommandTiming = map[string]any{
			"method":       method,
			"target":       "browser_targets",
			"started_at":   startedAt,
			"completed_at": completedAt,
			"duration_ms":  completedAt - startedAt,
		}
		if err != nil {
			return nil, err
		}
		if validateSchema {
			parsed, parseErr := c.Types.ParseCommandResult(method, result)
			if parseErr != nil {
				return nil, parseErr
			}
			return parsed, nil
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
		result, err = c.Router.Send(step.Method, step.Params, step.SessionID)
	} else if command.Target == "service_worker" {
		if c.Injector == nil || c.Injector.SessionID == "" {
			return nil, fmt.Errorf("service_worker commands require an injected ModCDP extension target")
		}
		step, stepErr := c.Types.ServiceWorkerCommandStep(method, params, cdpSessionID, 0)
		if stepErr != nil {
			return nil, stepErr
		}
		rawResult, routeErr := c.Router.Send(step.Method, step.Params, c.Injector.SessionID)
		if routeErr != nil {
			return nil, routeErr
		}
		result, err = translate.UnwrapResponseIfNeeded(rawResult, step.Unwrap)
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
	handlerValue := reflect.ValueOf(handler)
	if handlerValue.Kind() != reflect.Func {
		panic("handler must be a function")
	}
	c.handlersMu.Lock()
	defer c.handlersMu.Unlock()
	pointer := handlerValue.Pointer()
	for _, existing := range c.handlers[event] {
		if existing.pointer == pointer {
			return c
		}
	}
	c.handlers[event] = append(c.handlers[event], handlerEntry{handler: handlerValue, pointer: pointer})
	return c
}

func (c *ModCDPClient) Once(event string, handler Handler) *ModCDPClient {
	var wrapped Handler
	wrapped = func(args ...any) {
		c.Off(event, wrapped)
		callHandler(reflect.ValueOf(handler), args...)
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

func callHandler(handler reflect.Value, args ...any) {
	handlerType := handler.Type()
	inputs := make([]reflect.Value, 0, len(args))
	if handlerType.IsVariadic() {
		for _, arg := range args {
			inputs = append(inputs, reflect.ValueOf(arg))
		}
		handler.Call(inputs)
		return
	}
	for index := 0; index < handlerType.NumIn() && index < len(args); index++ {
		input := reflect.ValueOf(args[index])
		expected := handlerType.In(index)
		if input.IsValid() && input.Type().AssignableTo(expected) {
			inputs = append(inputs, input)
			continue
		}
		if input.IsValid() && input.Type().ConvertibleTo(expected) {
			inputs = append(inputs, input.Convert(expected))
			continue
		}
		inputs = append(inputs, reflect.Zero(expected))
	}
	handler.Call(inputs)
}

func (c *ModCDPClient) Close() {
	c.stopHeartbeat()
	c.Router.Stop()
	if c.Launcher != nil {
		c.Launcher.Close()
	}
	if c.Upstream != nil {
		_ = c.Upstream.Close()
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

func (c *ModCDPClient) extensionInjectorsForConfig() ([]extensionInjector, *ExtensionInjector) {
	if c.Config.Injector.InjectorMode == "none" {
		return nil, nil
	}
	if c.Config.Injector.InjectorMode == "cli" {
		injector := NewCLIExtensionInjector(InjectorConfig{})
		return []extensionInjector{&injector}, &injector.ExtensionInjector
	}
	if c.Config.Injector.InjectorMode == "cdp" {
		injector := NewCDPExtensionInjector(InjectorConfig{})
		return []extensionInjector{&injector}, &injector.ExtensionInjector
	}
	if c.Config.Injector.InjectorMode == "bb" {
		injector := NewBBExtensionInjector(InjectorConfig{})
		return []extensionInjector{&injector}, &injector.ExtensionInjector
	}
	if c.Config.Injector.InjectorMode == "discover" {
		injector := NewDiscoverExtensionInjector(InjectorConfig{})
		return []extensionInjector{&injector}, &injector.ExtensionInjector
	}
	return nil, nil
}

func isKnownLaunchMode(mode string) bool {
	return mode == "local" || mode == "remote" || mode == "bb" || mode == "none"
}

func isKnownUpstreamMode(mode string) bool {
	return mode == "ws"
}

func isKnownExtensionMode(mode string) bool {
	return mode == "cli" || mode == "cdp" || mode == "bb" || mode == "discover" || mode == "none"
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

func (c *ModCDPClient) injectExtension(injectors []extensionInjector) (*ExtensionInjectionResult, *ExtensionInjector, error) {
	if len(injectors) == 0 {
		return nil, nil, fmt.Errorf("injector.injector_mode=none cannot be used with an extension-routed browser upstream")
	}
	send := func(method string, params map[string]any, sessionID string) (map[string]any, error) {
		if c.Upstream == nil {
			return nil, fmt.Errorf("ModCDP upstream is not connected")
		}
		return c.Upstream.Send(method, params, sessionID, time.Duration(c.Config.ClientConfig.ClientCDPSendTimeoutMS)*time.Millisecond)
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
			state := injector.RecordInjectionResult(result)
			c.Injector = state
			return result, state, nil
		}
	}
	return nil, nil, fmt.Errorf("cannot install or discover the ModCDP extension in the running browser.%s", formatInjectorErrors(errors))
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
	if c.Config.ServerConfig == nil || c.Config.ServerConfig.Downstream.DownstreamCloseBrowserOnDisconnect == nil {
		return
	}
	if !*c.Config.ServerConfig.Downstream.DownstreamCloseBrowserOnDisconnect {
		return
	}
	stop := make(chan struct{})
	c.heartbeatStop = stop
	interval := time.Duration(c.Config.ClientConfig.ClientHeartbeatIntervalMS) * time.Millisecond
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				_, _ = c.Send("Mod.ping", map[string]any{"sent_at": time.Now().UnixMilli()})
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
	if c.Injector != nil && c.Injector.SessionID != "" && sessionID == c.Injector.SessionID {
		if unwrapped, ok := translate.UnwrapEventIfNeeded(method, params, sessionID, c.Injector.SessionID); ok {
			validatedData, err := c.Types.ParseEventPayload(unwrapped.Event, unwrapped.Data)
			if err != nil {
				panic(err)
			}
			c.handlersMu.Lock()
			hs := append([]handlerEntry(nil), c.handlers[unwrapped.Event]...)
			c.handlersMu.Unlock()
			for _, h := range hs {
				go callHandler(h.handler, validatedData, unwrapped.SessionID)
			}
			c.handlersMu.Lock()
			wildcardHandlers := append([]handlerEntry(nil), c.handlers["*"]...)
			c.handlersMu.Unlock()
			for _, h := range wildcardHandlers {
				go callHandler(h.handler, unwrapped.Event, validatedData, unwrapped.SessionID)
			}
		}
		return
	}
	if method != "" {
		validatedParams, err := c.Types.ParseEventPayload(method, params)
		if err != nil {
			panic(err)
		}
		c.handlersMu.Lock()
		hs := append([]handlerEntry(nil), c.handlers[method]...)
		c.handlersMu.Unlock()
		for _, h := range hs {
			go callHandler(h.handler, validatedParams, sessionID)
		}
		c.handlersMu.Lock()
		wildcardHandlers := append([]handlerEntry(nil), c.handlers["*"]...)
		c.handlersMu.Unlock()
		for _, h := range wildcardHandlers {
			go callHandler(h.handler, method, validatedParams, sessionID)
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
