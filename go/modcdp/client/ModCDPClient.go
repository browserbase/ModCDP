// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/client/ModCDPClient.ts
// - ./python/modcdp/client/ModCDPClient.py
// ModCDPClient (Go): importable, no CLI, no demo code.
//
// Option groups mirror the JS / Python ports:
//
//	Launcher       browser/session creation and cleanup.
//	Upstream       message transport to raw CDP or a ModCDP server.
//	Injector       raw-CDP extension discovery/injection/borrowing.
//	ServerOptions         ModCDPServer.configure params.
//	ClientOptions client routing and client-owned send/event timings.
//	Upstream      upstream transport options and upstream-owned timings.
//
// Public methods: Connect, Send(method, params), SendRaw, On, OnRaw, Close.
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

type LaunchOptions = types.LaunchOptions
type LaunchedBrowser = launcher.LaunchedBrowser
type BrowserLauncher = launcher.BrowserLauncher
type LocalBrowserLauncher = launcher.LocalBrowserLauncher
type RemoteBrowserLauncher = launcher.RemoteBrowserLauncher
type BBBrowserLauncher = launcher.BBBrowserLauncher
type NoneBrowserLauncher = launcher.NoneBrowserLauncher
type InjectorOptions = types.InjectorOptions
type ExtensionInjectionResult = types.ExtensionInjectionResult
type SendCDP = types.SendCDP
type ExtensionInjector = injector.ExtensionInjector
type DiscoverExtensionInjector = injector.DiscoverExtensionInjector
type BBExtensionInjector = injector.BBExtensionInjector
type CLIExtensionInjector = injector.CLIExtensionInjector
type CDPExtensionInjector = injector.CDPExtensionInjector
type BorrowExtensionInjector = injector.BorrowExtensionInjector
type UpstreamMode = transportpkg.UpstreamMode
type UpstreamTransportOptions = types.UpstreamTransportOptions
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

type RouterOptions struct {
	RouterRoutes                      map[string]string `json:"router_routes,omitempty"`
	LoopbackExecutionContextTimeoutMS int               `json:"loopback_execution_context_timeout_ms,omitempty"`
}

type DownstreamOptions struct {
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

type ServerConfig struct {
	Upstream           UpstreamTransportOptions `json:"upstream,omitempty"`
	Router             RouterOptions            `json:"router,omitempty"`
	ClientOptions      ClientOptions            `json:"client_options,omitempty"`
	Downstream         DownstreamOptions        `json:"downstream,omitempty"`
	ServerBrowserToken string                   `json:"server_browser_token,omitempty"`
	CustomCommands     []CustomCommand          `json:"custom_commands,omitempty"`
	CustomEvents       []CustomEvent            `json:"custom_events,omitempty"`
	CustomMiddlewares  []CustomMiddleware       `json:"custom_middlewares,omitempty"`
	Options            map[string]any           `json:"-"`
	disabled           bool
}

var ServerOptionsNone = &ServerConfig{disabled: true}

type ClientOptions struct {
	ClientRoutes               map[string]string `json:"client_routes,omitempty"`
	ClientHydrateAliases       *bool             `json:"client_hydrate_aliases,omitempty"`
	ClientMirrorUpstreamEvents *bool             `json:"client_mirror_upstream_events,omitempty"`
	ClientCDPSendTimeoutMS     int               `json:"client_cdp_send_timeout_ms,omitempty"`
	ClientEventWaitTimeoutMS   int               `json:"client_event_wait_timeout_ms,omitempty"`
	ClientHeartbeatIntervalMS  int               `json:"client_heartbeat_interval_ms,omitempty"`
}

type Options struct {
	Launcher                LaunchOptions            `json:"launcher,omitempty"`
	Upstream                UpstreamTransportOptions `json:"upstream,omitempty"`
	Injector                InjectorOptions          `json:"injector,omitempty"`
	ClientOptions           ClientOptions            `json:"client_options,omitempty"`
	ServerOptions           *ServerConfig            `json:"server_options,omitempty"`
	CustomCommands          []CustomCommand          `json:"custom_commands,omitempty"`
	CustomEvents            []CustomEvent            `json:"custom_events,omitempty"`
	CustomMiddlewares       []CustomMiddleware       `json:"custom_middlewares,omitempty"`
	serverOptionsConfigured bool
}

func (o *Options) UnmarshalJSON(data []byte) error {
	type optionsAlias Options
	var decoded optionsAlias
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	*o = Options(decoded)

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	rawServerOptions, hasServerOptions := raw["server_options"]
	if !hasServerOptions {
		return nil
	}
	o.serverOptionsConfigured = true
	if strings.TrimSpace(string(rawServerOptions)) == "null" {
		o.ServerOptions = nil
		return nil
	}
	var server ServerConfig
	if err := json.Unmarshal(rawServerOptions, &server); err != nil {
		return err
	}
	o.ServerOptions = &server
	return nil
}

type Handler func(data any)

type handlerEntry struct {
	handler Handler
	pointer uintptr
}

type CDPEvent struct {
	Method       string         `json:"method"`
	Params       map[string]any `json:"params,omitempty"`
	CDPSessionID string         `json:"cdpSessionId,omitempty"`
	SessionID    string         `json:"sessionId,omitempty"`
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

	Launcher                 LaunchOptions
	Upstream                 UpstreamTransportOptions
	Injector                 InjectorOptions
	ClientOptions            ClientOptions
	ServerOptions            *ServerConfig
	CustomCommands           []CustomCommand
	CustomEvents             []CustomEvent
	CustomMiddlewares        []CustomMiddleware
	CDPURL                   string
	transport                upstreamTransportClient
	mu                       sync.Mutex
	nextID                   int64
	pending                  map[int64]chan map[string]any
	handlers                 map[string][]handlerEntry
	cdpHandlers              map[string][]func(CDPEvent)
	commandParamsSchemas     map[string]map[string]any
	commandResultSchemas     map[string]map[string]any
	commandResultUnwrapKeys  map[string]string
	eventSchemas             map[string]map[string]any
	schemaMu                 sync.RWMutex
	handlersMu               sync.Mutex
	router                   *AutoSessionRouter
	ExtensionID              string
	ExtTargetID              string
	ExtSessionID             string
	ExtExecutionContextID    int
	Latency                  map[string]any
	ConnectTiming            map[string]any
	LastCommandTiming        map[string]any
	LastRawTiming            map[string]any
	launchedBrowser          *LaunchedBrowser
	extensionInjectors       []extensionInjector
	configuredPeerGeneration int64
	heartbeatStop            chan struct{}
}

type extensionInjector interface {
	Update(InjectorOptions) *ExtensionInjector
	ConfigForLauncher() LaunchOptions
	ConfigForUpstream() map[string]any
	Prepare() error
	Inject() (*ExtensionInjectionResult, error)
	Close() error
}

type browserLauncherClient interface {
	Update(LaunchOptions) *BrowserLauncher
	ConfigForInjector() InjectorOptions
	ConfigForUpstream() map[string]any
	ConfigForServer() map[string]any
	Launch(LaunchOptions) (*LaunchedBrowser, error)
}

type upstreamTransportClient interface {
	Update(map[string]any)
	Connect() error
	Close() error
	Send(map[string]any) error
	ConfigForLauncher() LaunchOptions
	ConfigForInjector() InjectorOptions
	ConfigForServer() map[string]any
	OnRecv(func(map[string]any)) func()
	OnClose(func(error)) func()
	WaitForPeer() error
	PeerGeneration() int64
}

func New(opts Options) *ModCDPClient {
	if opts.Upstream.UpstreamMode == "" {
		opts.Upstream.UpstreamMode = "ws"
	}
	if opts.Launcher.LauncherMode == "" {
		if opts.Upstream.UpstreamMode == "ws" && opts.Upstream.UpstreamWSCDPURL != "" {
			opts.Launcher.LauncherMode = "remote"
		} else if opts.Upstream.UpstreamMode == "ws" {
			opts.Launcher.LauncherMode = "local"
		} else {
			opts.Launcher.LauncherMode = "none"
		}
	}
	if opts.Injector.InjectorMode == "" {
		opts.Injector.InjectorMode = "none"
	}
	if opts.ClientOptions.ClientRoutes == nil {
		opts.ClientOptions.ClientRoutes = translate.DefaultClientRoutes()
	} else {
		merged := translate.DefaultClientRoutes()
		for k, v := range opts.ClientOptions.ClientRoutes {
			merged[k] = v
		}
		opts.ClientOptions.ClientRoutes = merged
	}
	if opts.ClientOptions.ClientHydrateAliases == nil {
		value := true
		opts.ClientOptions.ClientHydrateAliases = &value
	}
	if opts.ServerOptions != nil && opts.ServerOptions.disabled {
		opts.ServerOptions = nil
		opts.serverOptionsConfigured = true
	}
	if opts.ServerOptions == nil && !opts.serverOptionsConfigured {
		opts.ServerOptions = &ServerConfig{}
	}
	if opts.Injector.InjectorServiceWorkerURLSuffixes == nil {
		opts.Injector.InjectorServiceWorkerURLSuffixes = append([]string{}, DefaultModCDPServiceWorkerURLSuffixes...)
	}
	if opts.ClientOptions.ClientCDPSendTimeoutMS == 0 {
		opts.ClientOptions.ClientCDPSendTimeoutMS = DefaultCDPSendTimeoutMS
	}
	if opts.ClientOptions.ClientEventWaitTimeoutMS == 0 {
		opts.ClientOptions.ClientEventWaitTimeoutMS = DefaultEventWaitTimeoutMS
	}
	if opts.ClientOptions.ClientHeartbeatIntervalMS == 0 {
		opts.ClientOptions.ClientHeartbeatIntervalMS = DefaultClientHeartbeatIntervalMS
	}
	if opts.Injector.InjectorExecutionContextTimeoutMS == 0 {
		opts.Injector.InjectorExecutionContextTimeoutMS = DefaultExecutionContextTimeoutMS
	}
	if opts.Injector.InjectorServiceWorkerProbeTimeoutMS == 0 {
		opts.Injector.InjectorServiceWorkerProbeTimeoutMS = DefaultServiceWorkerProbeTimeoutMS
	}
	if opts.Injector.InjectorServiceWorkerReadyTimeoutMS == 0 {
		opts.Injector.InjectorServiceWorkerReadyTimeoutMS = DefaultServiceWorkerReadyTimeoutMS
	}
	if opts.Injector.InjectorServiceWorkerPollIntervalMS == 0 {
		opts.Injector.InjectorServiceWorkerPollIntervalMS = DefaultServiceWorkerPollIntervalMS
	}
	if opts.Injector.InjectorTargetSessionPollIntervalMS == 0 {
		opts.Injector.InjectorTargetSessionPollIntervalMS = DefaultTargetSessionPollIntervalMS
	}
	if opts.Upstream.UpstreamWSConnectErrorSettleTimeoutMS == 0 {
		opts.Upstream.UpstreamWSConnectErrorSettleTimeoutMS = DefaultWSConnectErrorSettleTimeoutMS
	}
	client := &ModCDPClient{
		Launcher:                opts.Launcher,
		Upstream:                opts.Upstream,
		Injector:                opts.Injector,
		ClientOptions:           opts.ClientOptions,
		ServerOptions:           opts.ServerOptions,
		CustomCommands:          opts.CustomCommands,
		CustomEvents:            opts.CustomEvents,
		CustomMiddlewares:       opts.CustomMiddlewares,
		pending:                 map[int64]chan map[string]any{},
		handlers:                map[string][]handlerEntry{},
		cdpHandlers:             map[string][]func(CDPEvent){},
		commandParamsSchemas:    map[string]map[string]any{},
		commandResultSchemas:    map[string]map[string]any{},
		commandResultUnwrapKeys: map[string]string{},
		eventSchemas:            map[string]map[string]any{},
	}
	client.Mod = ModDomain{client: client}
	client.router = NewAutoSessionRouter(
		func(method string, params map[string]any, sessionID string) (map[string]any, error) {
			return client.sendMessage(method, params, sessionID)
		},
		func() int { return client.Injector.InjectorExecutionContextTimeoutMS },
	)
	if *client.ClientOptions.ClientHydrateAliases {
		initCDPSurface(client)
	}
	client.hydrateNativeProtocolSchemas()
	client.hydrateCustomSurface()
	return client
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
		c.rejectAll(err)
	})
	if c.Upstream.UpstreamMode != "ws" {
		if err := c.transport.WaitForPeer(); err != nil {
			c.Close()
			return err
		}
		if c.ServerOptions != nil {
			if _, err := c.sendMessage("Mod.configure", c.serverConfigureParams(nil, nil, nil), ""); err != nil {
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
			"upstream_mode":          c.Upstream.UpstreamMode,
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
	if _, err := c.sendMessage("Runtime.enable", map[string]any{}, c.ExtSessionID); err != nil {
		c.Close()
		return err
	}
	extExecutionContextID, err := c.router.WaitForExecutionContext(c.ExtSessionID, c.Injector.InjectorExecutionContextTimeoutMS)
	if err != nil {
		c.Close()
		return err
	}
	c.ExtExecutionContextID = extExecutionContextID
	if _, err := c.sendMessage("Runtime.addBinding", map[string]any{"name": translate.CustomEventBindingName}, c.ExtSessionID); err != nil {
		c.Close()
		return err
	}
	mirrorUpstreamEvents := true
	if c.ClientOptions.ClientMirrorUpstreamEvents != nil {
		mirrorUpstreamEvents = *c.ClientOptions.ClientMirrorUpstreamEvents
	}
	if mirrorUpstreamEvents {
		if _, err := c.sendMessage("Runtime.addBinding", map[string]any{"name": translate.UpstreamEventBindingName}, c.ExtSessionID); err != nil {
			c.Close()
			return err
		}
	}

	if c.ServerOptions != nil {
		customCommands := make([]map[string]any, 0, len(c.CustomCommands))
		for _, command := range c.CustomCommands {
			if command.Expression == "" {
				continue
			}
			customCommands = append(customCommands, map[string]any{
				"name":          command.Name,
				"expression":    command.Expression,
				"params_schema": command.ParamsSchema,
				"result_schema": command.ResultSchema,
			})
		}
		customEvents := make([]map[string]any, 0, len(c.CustomEvents))
		for _, event := range c.CustomEvents {
			customEvents = append(customEvents, map[string]any{
				"name":         event.Name,
				"event_schema": event.EventSchema,
			})
		}
		customMiddlewares := make([]map[string]any, 0, len(c.CustomMiddlewares))
		for _, middleware := range c.CustomMiddlewares {
			item := map[string]any{
				"phase":      middleware.Phase,
				"expression": middleware.Expression,
			}
			if middleware.Name != "" {
				item["name"] = middleware.Name
			}
			customMiddlewares = append(customMiddlewares, item)
		}
		configureParams := c.serverConfigureParams(customCommands, customEvents, customMiddlewares)
		command, err := translate.WrapCommandIfNeeded("Mod.configure", configureParams, c.ClientOptions.ClientRoutes, c.ExtSessionID)
		if err != nil {
			c.Close()
			return fmt.Errorf("Mod.configure: %w", err)
		}
		if _, err := c.sendRaw(command); err != nil {
			c.Close()
			return fmt.Errorf("Mod.configure: %w", err)
		}
	}
	c.startHeartbeat()
	c.startPingLatencyMeasurement()
	connectedAt := time.Now().UnixMilli()
	c.ConnectTiming = map[string]any{
		"started_at":             connectStartedAt,
		"upstream_mode":          c.Upstream.UpstreamMode,
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
	if !isKnownLaunchMode(c.Launcher.LauncherMode) {
		return fmt.Errorf("unknown launcher.launcher_mode=%s", c.Launcher.LauncherMode)
	}
	if !isKnownUpstreamMode(c.Upstream.UpstreamMode) {
		return fmt.Errorf("unknown upstream.upstream_mode=%s", c.Upstream.UpstreamMode)
	}
	if !isKnownExtensionMode(c.Injector.InjectorMode) {
		return fmt.Errorf("unknown injector.injector_mode=%s", c.Injector.InjectorMode)
	}
	launcher := c.browserLauncher()
	transport := c.upstreamTransport()
	injectors := c.extensionInjectorsForConfig()
	c.extensionInjectors = injectors
	initialTransportConfig := c.upstreamTransportConfig()

	transport.Update(initialTransportConfig)
	launcher.Update(c.Launcher)
	for _, injector := range injectors {
		injector.Update(c.baseInjectorOptions(nil))
	}
	for _, injector := range injectors {
		injector.Update(launcher.ConfigForInjector())
	}
	for _, injector := range injectors {
		injector.Update(transport.ConfigForInjector())
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
	launcher.Update(LaunchOptions{LauncherLocalLoopbackCDP: boolPointer(c.serverNeedsLoopbackCDP())})
	transport.Update(launcher.ConfigForUpstream())

	if c.Upstream.UpstreamMode != "ws" {
		if err := transport.Connect(); err != nil {
			return err
		}
	}
	if c.Launcher.LauncherMode != "none" {
		launched, err := launcher.Launch(LaunchOptions{})
		if err != nil {
			_ = transport.Close()
			return err
		}
		c.launchedBrowser = launched
		transport.Update(launcher.ConfigForUpstream())
		for _, injector := range injectors {
			injector.Update(launcher.ConfigForInjector())
		}
		for _, injector := range injectors {
			transport.Update(injector.ConfigForUpstream())
		}
	}
	launchedCDPURL := ""
	if c.launchedBrowser != nil {
		launchedCDPURL = c.launchedBrowser.CDPURL
	}
	if c.Upstream.UpstreamMode == "ws" {
		if err := transport.Connect(); err != nil {
			return err
		}
	}

	c.transport = transport
	transportURL := transportURL(transport)
	if c.Upstream.UpstreamMode == "ws" {
		c.CDPURL = firstNonEmptyString(transportURL, launchedCDPURL)
	} else {
		c.CDPURL = launchedCDPURL
	}
	if wsTransport, ok := transport.(*WSUpstreamTransport); ok && wsTransport.URL != "" {
		// For ws mode, cdp_url has been resolved to the concrete WebSocket CDP endpoint after connect().
		c.Upstream.UpstreamWSCDPURL = wsTransport.URL
	}

	serverConfig := map[string]any{}
	for key, value := range launcher.ConfigForServer() {
		serverConfig[key] = value
	}
	for key, value := range transport.ConfigForServer() {
		serverConfig[key] = value
	}
	if c.ServerOptions != nil {
		if upstreamConfig, _ := serverConfig["upstream"].(map[string]any); upstreamConfig != nil {
			loopbackCDPURL, _ := upstreamConfig["upstream_ws_cdp_url"].(string)
			initialCDPURL, _ := initialTransportConfig["upstream_ws_cdp_url"].(string)
			if loopbackCDPURL != "" &&
				(c.ServerOptions.Upstream.UpstreamWSCDPURL == "" ||
					c.ServerOptions.Upstream.UpstreamWSCDPURL == initialCDPURL ||
					c.ServerOptions.Upstream.UpstreamWSCDPURL == launchedCDPURL) {
				c.ServerOptions.Upstream.UpstreamWSCDPURL = loopbackCDPURL
			}
		}
	}
	return nil
}

func (c *ModCDPClient) serverNeedsLoopbackCDP() bool {
	if c.ServerOptions == nil || c.ServerOptions.Upstream.UpstreamWSCDPURL != "" {
		return false
	}
	return c.ServerOptions.Router.RouterRoutes["*.*"] == "loopback_cdp"
}

func (c *ModCDPClient) ensureModCDPServerConfigured() error {
	if c.ServerOptions == nil || c.transport == nil {
		return nil
	}
	if err := c.transport.WaitForPeer(); err != nil {
		return err
	}
	peerGeneration := c.transport.PeerGeneration()
	if peerGeneration == c.configuredPeerGeneration {
		return nil
	}
	if _, err := c.sendMessage("Mod.configure", c.serverConfigureParams(nil, nil, nil), ""); err != nil {
		return err
	}
	c.configuredPeerGeneration = peerGeneration
	return nil
}

func (c *ModCDPClient) upstreamTransportConfig() map[string]any {
	return map[string]any{
		"upstream_ws_cdp_url":                  c.Upstream.UpstreamWSCDPURL,
		"injector_service_worker_extension_id": c.Injector.InjectorServiceWorkerExtensionID,
	}
}

func (c *ModCDPClient) initializeRawCDPTransport() error {
	if _, err := c.sendMessage("Target.setAutoAttach", map[string]any{
		"autoAttach":             true,
		"waitForDebuggerOnStart": false,
		"flatten":                true,
	}, ""); err != nil {
		return err
	}
	if _, err := c.sendMessage("Target.setDiscoverTargets", map[string]any{"discover": true}, ""); err != nil {
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
		"upstream_ws_connect_error_settle_timeout_ms": c.Upstream.UpstreamWSConnectErrorSettleTimeoutMS,
	}
	router := map[string]any{
		"loopback_execution_context_timeout_ms": c.Injector.InjectorExecutionContextTimeoutMS,
	}
	clientOptions := map[string]any{
		"client_routes":              c.ClientOptions.ClientRoutes,
		"client_cdp_send_timeout_ms": c.ClientOptions.ClientCDPSendTimeoutMS,
	}
	downstream := map[string]any{
		"downstream_client_timeout_ms": maxInt(c.ClientOptions.ClientHeartbeatIntervalMS*4, 1_000),
	}
	params := map[string]any{}
	if c.ServerOptions != nil {
		if c.ServerOptions.Upstream.UpstreamWSCDPURL != "" {
			upstream["upstream_ws_cdp_url"] = c.ServerOptions.Upstream.UpstreamWSCDPURL
		}
		if c.ServerOptions.Upstream.UpstreamWSConnectErrorSettleTimeoutMS != 0 {
			upstream["upstream_ws_connect_error_settle_timeout_ms"] = c.ServerOptions.Upstream.UpstreamWSConnectErrorSettleTimeoutMS
		}
		if c.ServerOptions.Router.RouterRoutes != nil {
			router["router_routes"] = c.ServerOptions.Router.RouterRoutes
		}
		if c.ServerOptions.Router.LoopbackExecutionContextTimeoutMS != 0 {
			router["loopback_execution_context_timeout_ms"] = c.ServerOptions.Router.LoopbackExecutionContextTimeoutMS
		}
		if c.ServerOptions.ClientOptions.ClientRoutes != nil {
			clientOptions["client_routes"] = c.ServerOptions.ClientOptions.ClientRoutes
		}
		if c.ServerOptions.ClientOptions.ClientCDPSendTimeoutMS != 0 {
			clientOptions["client_cdp_send_timeout_ms"] = c.ServerOptions.ClientOptions.ClientCDPSendTimeoutMS
		}
		if c.ServerOptions.Downstream.DownstreamClientTimeoutMS != 0 {
			downstream["downstream_client_timeout_ms"] = c.ServerOptions.Downstream.DownstreamClientTimeoutMS
		}
		if c.ServerOptions.Downstream.DownstreamCloseBrowserOnDisconnect != nil {
			downstream["downstream_close_browser_on_disconnect"] = *c.ServerOptions.Downstream.DownstreamCloseBrowserOnDisconnect
		}
		if c.ServerOptions.ServerBrowserToken != "" {
			params["server_browser_token"] = c.ServerOptions.ServerBrowserToken
		}
		for key, value := range c.ServerOptions.Options {
			params[key] = value
		}
	}
	params["upstream"] = upstream
	params["router"] = router
	params["client_options"] = clientOptions
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

func resultUnwrapKeyFromSchema(schema map[string]any) string {
	properties, _ := schema["properties"].(map[string]any)
	if len(properties) != 1 {
		return ""
	}
	for key := range properties {
		return key
	}
	return ""
}

func (c *ModCDPClient) setCommandResultSchema(name string, schema map[string]any) {
	c.commandResultSchemas[name] = schema
	if unwrapKey := resultUnwrapKeyFromSchema(schema); unwrapKey != "" {
		c.commandResultUnwrapKeys[name] = unwrapKey
	} else {
		delete(c.commandResultUnwrapKeys, name)
	}
}

func (c *ModCDPClient) hydrateCustomSurface() {
	c.schemaMu.Lock()
	defer c.schemaMu.Unlock()
	for _, command := range c.CustomCommands {
		if command.Name == "" {
			continue
		}
		name, err := normalizeModCDPName(command.Name)
		if err != nil {
			continue
		}
		if schema := cloneSchema(command.ParamsSchema); schema != nil {
			c.commandParamsSchemas[name] = schema
		}
		if schema := cloneSchema(command.ResultSchema); schema != nil {
			c.setCommandResultSchema(name, schema)
		}
	}
	for _, event := range c.CustomEvents {
		if event.Name == "" {
			continue
		}
		name, err := normalizeModCDPName(event.Name)
		if err != nil {
			continue
		}
		if schema := cloneSchema(event.EventSchema); schema != nil {
			c.eventSchemas[name] = schema
		}
	}
}

func (c *ModCDPClient) registerCustomCommandParams(params map[string]any) (string, bool, error) {
	rawName, _ := params["name"].(string)
	name, err := normalizeModCDPName(rawName)
	if err != nil {
		return "", false, err
	}
	c.schemaMu.Lock()
	defer c.schemaMu.Unlock()
	if rawSchema, exists := params["params_schema"]; exists {
		schemaObject, ok := rawSchema.(map[string]any)
		if !ok {
			return "", false, fmt.Errorf("params_schema must be a JSON Schema object")
		}
		if schema := cloneSchema(schemaObject); schema != nil {
			c.commandParamsSchemas[name] = schema
		}
	}
	if rawSchema, exists := params["result_schema"]; exists {
		schemaObject, ok := rawSchema.(map[string]any)
		if !ok {
			return "", false, fmt.Errorf("result_schema must be a JSON Schema object")
		}
		if schema := cloneSchema(schemaObject); schema != nil {
			c.setCommandResultSchema(name, schema)
		}
	}
	expression, _ := params["expression"].(string)
	return name, expression != "", nil
}

func (c *ModCDPClient) registerCustomEventParams(params map[string]any) (string, error) {
	rawName, _ := params["name"].(string)
	name, err := normalizeModCDPName(rawName)
	if err != nil {
		return "", err
	}
	c.schemaMu.Lock()
	defer c.schemaMu.Unlock()
	if rawSchema, exists := params["event_schema"]; exists {
		schemaObject, ok := rawSchema.(map[string]any)
		if !ok {
			return "", fmt.Errorf("event_schema must be a JSON Schema object")
		}
		if schema := cloneSchema(schemaObject); schema != nil {
			c.eventSchemas[name] = schema
		}
	}
	found := false
	for index, event := range c.CustomEvents {
		if event.Name == name {
			found = true
			if rawSchema, exists := params["event_schema"]; exists {
				if schemaObject, ok := rawSchema.(map[string]any); ok {
					c.CustomEvents[index].EventSchema = cloneSchema(schemaObject)
				}
			}
			break
		}
	}
	if !found {
		event := CustomEvent{Name: name}
		if rawSchema, exists := params["event_schema"]; exists {
			if schemaObject, ok := rawSchema.(map[string]any); ok {
				event.EventSchema = cloneSchema(schemaObject)
			}
		}
		c.CustomEvents = append(c.CustomEvents, event)
	}
	return name, nil
}

func (c *ModCDPClient) validateCommandParams(method string, params map[string]any) error {
	c.schemaMu.RLock()
	schema := c.commandParamsSchemas[method]
	c.schemaMu.RUnlock()
	if schema == nil {
		return nil
	}
	if err := abxjsonschema.Validate(schema, params); err != nil {
		return fmt.Errorf("%s params did not match params_schema: %w", method, err)
	}
	return nil
}

func (c *ModCDPClient) validateCommandResult(method string, result any) error {
	c.schemaMu.RLock()
	schema := c.commandResultSchemas[method]
	c.schemaMu.RUnlock()
	if schema == nil {
		return nil
	}
	if err := abxjsonschema.Validate(schema, result); err != nil {
		return fmt.Errorf("%s result did not match result_schema: %w", method, err)
	}
	return nil
}

func (c *ModCDPClient) validateAndUnwrapCommandResult(method string, result any) (any, error) {
	if err := c.validateCommandResult(method, result); err != nil {
		return nil, err
	}
	c.schemaMu.RLock()
	unwrapKey := c.commandResultUnwrapKeys[method]
	c.schemaMu.RUnlock()
	if unwrapKey == "" {
		return result, nil
	}
	resultObject, ok := result.(map[string]any)
	if !ok {
		return result, nil
	}
	return resultObject[unwrapKey], nil
}

func (c *ModCDPClient) validateEventData(event string, data any) (any, bool) {
	c.schemaMu.RLock()
	schema := c.eventSchemas[event]
	c.schemaMu.RUnlock()
	if schema == nil {
		return data, true
	}
	if err := abxjsonschema.Validate(schema, data); err != nil {
		panic(fmt.Errorf("%s event did not match event_schema: %w", event, err))
	}
	return data, true
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
	if method == "Mod.addCustomCommand" {
		name, hasExpression, err := c.registerCustomCommandParams(params)
		if err != nil {
			return nil, err
		}
		if !hasExpression {
			completedAt := time.Now().UnixMilli()
			c.LastCommandTiming = map[string]any{
				"method":       method,
				"target":       "client",
				"started_at":   startedAt,
				"completed_at": completedAt,
				"duration_ms":  completedAt - startedAt,
			}
			return map[string]any{"name": name, "registered": true}, nil
		}
	} else if method == "Mod.addCustomEvent" {
		name, err := c.registerCustomEventParams(params)
		if err != nil {
			return nil, err
		}
		if c.ExtSessionID == "" {
			completedAt := time.Now().UnixMilli()
			c.LastCommandTiming = map[string]any{
				"method":       method,
				"target":       "client",
				"started_at":   startedAt,
				"completed_at": completedAt,
				"duration_ms":  completedAt - startedAt,
			}
			return map[string]any{"name": name, "registered": true}, nil
		}
	}
	if validateSchema {
		if err := c.validateCommandParams(method, params); err != nil {
			return nil, err
		}
	}
	if c.Upstream.UpstreamMode != "ws" {
		if method != "Mod.configure" {
			if err := c.ensureModCDPServerConfigured(); err != nil {
				return nil, err
			}
		}
		rawResult, err := c.sendMessage(method, params, "")
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
			result, err = c.validateAndUnwrapCommandResult(method, result)
			if err != nil {
				return nil, err
			}
		}
		return result, nil
	}
	command, err := translate.WrapCommandIfNeeded(method, params, c.ClientOptions.ClientRoutes, cdpSessionID)
	if err != nil {
		return nil, err
	}
	result, err := c.sendRaw(command)
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
		result, err = c.validateAndUnwrapCommandResult(method, result)
		if err != nil {
			return nil, err
		}
	}
	return result, nil
}

func (c *ModCDPClient) SendRaw(method string, params map[string]any, sessionID ...string) (map[string]any, error) {
	startedAt := time.Now().UnixMilli()
	if params == nil {
		params = map[string]any{}
	}
	cdpSessionID := ""
	if len(sessionID) > 0 {
		cdpSessionID = sessionID[0]
	}
	result, err := c.sendMessage(method, params, cdpSessionID)
	completedAt := time.Now().UnixMilli()
	c.LastRawTiming = map[string]any{
		"method":       method,
		"started_at":   startedAt,
		"completed_at": completedAt,
		"duration_ms":  completedAt - startedAt,
	}
	return result, err
}

func (c *ModCDPClient) OnRaw(event string, handler Handler) *ModCDPClient {
	return c.On(event, handler)
}

func (c *ModCDPClient) OnCDP(event string, handler func(CDPEvent)) *ModCDPClient {
	c.handlersMu.Lock()
	defer c.handlersMu.Unlock()
	c.cdpHandlers[event] = append(c.cdpHandlers[event], handler)
	return c
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

func (c *ModCDPClient) Transport() any {
	return c.transport
}

func (c *ModCDPClient) LaunchedBrowser() *LaunchedBrowser {
	return c.launchedBrowser
}

func (c *ModCDPClient) browserLauncher() browserLauncherClient {
	switch c.Launcher.LauncherMode {
	case "local":
		return NewLocalBrowserLauncher(c.Launcher)
	case "remote":
		return NewRemoteBrowserLauncher(c.Launcher)
	case "bb":
		return NewBBBrowserLauncher(c.Launcher)
	case "none":
		return NewNoneBrowserLauncher(c.Launcher)
	default:
		return nil
	}
}

func (c *ModCDPClient) upstreamTransport() upstreamTransportClient {
	switch c.Upstream.UpstreamMode {
	case "ws":
		return NewWSUpstreamTransport(c.Upstream)
	default:
		return nil
	}
}

func (c *ModCDPClient) extensionInjectorsForConfig() []extensionInjector {
	if c.Injector.InjectorMode == "none" {
		return nil
	}
	if c.Injector.InjectorMode == "cli" {
		injector := NewCLIExtensionInjector(InjectorOptions{})
		return []extensionInjector{&injector}
	}
	if c.Injector.InjectorMode == "cdp" {
		injector := NewCDPExtensionInjector(InjectorOptions{})
		return []extensionInjector{&injector}
	}
	if c.Injector.InjectorMode == "bb" {
		injector := NewBBExtensionInjector(InjectorOptions{})
		return []extensionInjector{&injector}
	}
	if c.Injector.InjectorMode == "discover" {
		injector := NewDiscoverExtensionInjector(InjectorOptions{})
		return []extensionInjector{&injector}
	}
	if c.Injector.InjectorMode == "borrow" {
		injector := NewBorrowExtensionInjector(InjectorOptions{})
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

func (c *ModCDPClient) baseInjectorOptions(send SendCDP) InjectorOptions {
	trustMatchedServiceWorker := c.trustServiceWorkerTarget()
	return InjectorOptions{
		Send:                                 send,
		InjectorCLIExtensionPath:             c.Injector.InjectorCLIExtensionPath,
		InjectorCLIExtensionID:               c.Injector.InjectorCLIExtensionID,
		InjectorCDPExtensionPath:             c.Injector.InjectorCDPExtensionPath,
		InjectorCDPExtensionID:               c.Injector.InjectorCDPExtensionID,
		InjectorBBExtensionPath:              c.Injector.InjectorBBExtensionPath,
		InjectorBBExtensionID:                c.Injector.InjectorBBExtensionID,
		InjectorDiscoverExtensionPath:        c.Injector.InjectorDiscoverExtensionPath,
		InjectorBorrowExtensionPath:          c.Injector.InjectorBorrowExtensionPath,
		InjectorServiceWorkerExtensionID:     c.Injector.InjectorServiceWorkerExtensionID,
		InjectorServiceWorkerURLIncludes:     c.Injector.InjectorServiceWorkerURLIncludes,
		InjectorServiceWorkerURLSuffixes:     c.Injector.InjectorServiceWorkerURLSuffixes,
		InjectorTrustServiceWorkerTarget:     trustMatchedServiceWorker,
		InjectorRequireServiceWorkerTarget:   c.Injector.InjectorRequireServiceWorkerTarget || c.Injector.InjectorMode == "discover",
		InjectorServiceWorkerReadyExpression: c.Injector.InjectorServiceWorkerReadyExpression,
		InjectorCDPSendTimeoutMS:             c.ClientOptions.ClientCDPSendTimeoutMS,
		InjectorExecutionContextTimeoutMS:    c.Injector.InjectorExecutionContextTimeoutMS,
		InjectorServiceWorkerProbeTimeoutMS:  c.Injector.InjectorServiceWorkerProbeTimeoutMS,
		InjectorServiceWorkerReadyTimeoutMS:  c.Injector.InjectorServiceWorkerReadyTimeoutMS,
		InjectorServiceWorkerPollIntervalMS:  c.Injector.InjectorServiceWorkerPollIntervalMS,
		InjectorTargetSessionPollIntervalMS:  c.Injector.InjectorTargetSessionPollIntervalMS,
	}
}

func (c *ModCDPClient) injectExtension(injectors []extensionInjector) (*ExtensionInjectionResult, error) {
	if len(injectors) == 0 {
		return nil, fmt.Errorf("injector.injector_mode='none' cannot be used with a raw_cdp upstream")
	}
	send := func(method string, params map[string]any, sessionID string) (map[string]any, error) {
		return c.sendMessageTimeout(method, params, sessionID, time.Duration(c.ClientOptions.ClientCDPSendTimeoutMS)*time.Millisecond)
	}
	var errors []string
	for _, injector := range injectors {
		injector.Update(c.baseInjectorOptions(send))
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

func cloneMap(value map[string]any) map[string]any {
	cloned := map[string]any{}
	for key, item := range value {
		cloned[key] = item
	}
	return cloned
}

func (c *ModCDPClient) sendRaw(command translate.RawCommand) (any, error) {
	if command.Target == "direct_cdp" {
		step := command.Steps[0]
		return c.sendMessage(step.Method, step.Params, step.SessionID)
	}
	if command.Target != "service_worker" {
		return nil, fmt.Errorf("unsupported command target %q", command.Target)
	}

	var result map[string]any
	unwrap := ""
	for _, step := range command.Steps {
		params := step.Params
		if params == nil {
			params = map[string]any{}
		}
		if step.Method == "Runtime.callFunctionOn" {
			if _, exists := params["executionContextId"]; !exists {
				if c.ExtExecutionContextID == 0 {
					contextID, err := c.router.WaitForExecutionContext(c.ExtSessionID, c.Injector.InjectorExecutionContextTimeoutMS)
					if err != nil {
						return nil, err
					}
					c.ExtExecutionContextID = contextID
				}
				params = cloneMap(params)
				params["executionContextId"] = c.ExtExecutionContextID
			}
		}
		r, err := c.sendMessage(step.Method, params, c.ExtSessionID)
		if err != nil {
			return nil, err
		}
		result = r
		unwrap = step.Unwrap
	}
	return translate.UnwrapResponseIfNeeded(result, unwrap)
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
	case <-time.After(time.Duration(c.ClientOptions.ClientEventWaitTimeoutMS) * time.Millisecond):
		return fmt.Errorf("Mod.pong timed out")
	}
}

func (c *ModCDPClient) startPingLatencyMeasurement() {
	go func() {
		_ = c.measurePingLatency()
	}()
}

func (c *ModCDPClient) startHeartbeat() {
	c.stopHeartbeat()
	if c.ServerOptions == nil || c.ServerOptions.Downstream.DownstreamCloseBrowserOnDisconnect == nil || !*c.ServerOptions.Downstream.DownstreamCloseBrowserOnDisconnect {
		return
	}
	interval := c.ClientOptions.ClientHeartbeatIntervalMS
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

func (c *ModCDPClient) sendMessage(method string, params map[string]any, sessionID string) (map[string]any, error) {
	return c.sendMessageTimeout(method, params, sessionID, time.Duration(c.ClientOptions.ClientCDPSendTimeoutMS)*time.Millisecond)
}

func (c *ModCDPClient) sendMessageTimeout(method string, params map[string]any, sessionID string, timeout time.Duration) (map[string]any, error) {
	c.mu.Lock()
	c.nextID++
	id := c.nextID
	ch := make(chan map[string]any, 1)
	c.pending[id] = ch
	c.mu.Unlock()

	msg := map[string]any{"id": id, "method": method, "params": params}
	if sessionID != "" {
		msg["sessionId"] = sessionID
	}
	var err error
	if c.transport != nil {
		err = c.transport.Send(msg)
	} else {
		err = fmt.Errorf("ModCDP upstream is not connected")
	}
	if err != nil {
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return nil, err
	}
	if timeout <= 0 {
		resp := <-ch
		if errObj, ok := resp["error"].(map[string]any); ok {
			return nil, fmt.Errorf("%s failed: %v", method, errObj["message"])
		}
		if r, ok := resp["result"].(map[string]any); ok {
			return r, nil
		}
		return map[string]any{}, nil
	}
	select {
	case <-time.After(timeout):
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return nil, fmt.Errorf("%s timed out after %s", method, timeout)
	case resp := <-ch:
		if errObj, ok := resp["error"].(map[string]any); ok {
			return nil, fmt.Errorf("%s failed: %v", method, errObj["message"])
		}
		if r, ok := resp["result"].(map[string]any); ok {
			return r, nil
		}
		return map[string]any{}, nil
	}
}

func (c *ModCDPClient) rejectAll(err error) {
	c.mu.Lock()
	pending := c.pending
	c.pending = map[int64]chan map[string]any{}
	c.mu.Unlock()
	for _, ch := range pending {
		ch <- map[string]any{"error": map[string]any{"message": fmt.Sprintf("connection closed: %v", err)}}
	}
}

func (c *ModCDPClient) handleMessage(msg map[string]any) {
	if idF, ok := msg["id"].(float64); ok {
		id := int64(idF)
		c.mu.Lock()
		ch, ok := c.pending[id]
		delete(c.pending, id)
		c.mu.Unlock()
		if ok {
			ch <- msg
		}
		return
	}
	if id, ok := msg["id"].(int); ok {
		c.mu.Lock()
		ch, found := c.pending[int64(id)]
		delete(c.pending, int64(id))
		c.mu.Unlock()
		if found {
			ch <- msg
		}
		return
	}
	c.handleEventMessage(msg)
}

func (c *ModCDPClient) handleEventMessage(msg map[string]any) {
	method, _ := msg["method"].(string)
	sessionID, _ := msg["sessionId"].(string)
	params, _ := msg["params"].(map[string]any)
	c.router.RecordProtocolEvent(method, params, sessionID)
	if c.ExtSessionID != "" && sessionID == c.ExtSessionID {
		bindingName, _ := params["name"].(string)
		if event, data, ok := translate.UnwrapEventIfNeeded(method, params, sessionID, c.ExtSessionID); ok {
			validatedData, valid := c.validateEventData(event, data)
			if !valid {
				return
			}
			c.handlersMu.Lock()
			hs := append([]handlerEntry(nil), c.handlers[event]...)
			cdpHandlers := append([]func(CDPEvent){}, c.cdpHandlers["*"]...)
			cdpHandlers = append(cdpHandlers, c.cdpHandlers[event]...)
			c.handlersMu.Unlock()
			for _, h := range hs {
				go h.handler(validatedData)
			}
			if bindingName == translate.UpstreamEventBindingName {
				dataMap, _ := validatedData.(map[string]any)
				cdpEvent := CDPEvent{Method: event, Params: dataMap, CDPSessionID: sessionID, SessionID: sessionID}
				for _, h := range cdpHandlers {
					go h(cdpEvent)
				}
			}
		}
		return
	}
	if method != "" {
		validatedParams, valid := c.validateEventData(method, params)
		if !valid {
			return
		}
		validatedParamsMap, _ := validatedParams.(map[string]any)
		if validatedParamsMap == nil {
			validatedParamsMap = map[string]any{}
		}
		c.handlersMu.Lock()
		hs := append([]handlerEntry(nil), c.handlers[method]...)
		cdpHandlers := append([]func(CDPEvent){}, c.cdpHandlers["*"]...)
		cdpHandlers = append(cdpHandlers, c.cdpHandlers[method]...)
		c.handlersMu.Unlock()
		for _, h := range hs {
			go h.handler(validatedParams)
		}
		if len(cdpHandlers) > 0 {
			event := CDPEvent{Method: method, Params: validatedParamsMap, CDPSessionID: sessionID, SessionID: sessionID}
			for _, h := range cdpHandlers {
				go h(event)
			}
		}
	}
}

func (c *ModCDPClient) trustServiceWorkerTarget() bool {
	if c.Injector.InjectorTrustServiceWorkerTarget || len(c.Injector.InjectorServiceWorkerURLIncludes) > 0 {
		return true
	}
	for _, suffix := range c.Injector.InjectorServiceWorkerURLSuffixes {
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
