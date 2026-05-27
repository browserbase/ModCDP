package client

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gobwas/ws"
	"github.com/gobwas/ws/wsutil"
)

func boolPtr(value bool) *bool {
	return &value
}

func TestModCDPClientNormalizesNestedConfigOwners(t *testing.T) {
	cdp := New(Options{
		Launcher: LaunchOptions{
			LauncherMode:                "local",
			LauncherLocalExecutablePath: "/tmp/chrome",
			LauncherLocalUserDataDir:    "/tmp/profile",
			LauncherLocalHeadless:       boolPtr(true),
		},
		Upstream: UpstreamTransportOptions{
			UpstreamMode:                          "ws",
			UpstreamWSCDPURL:                      "http://127.0.0.1:9222",
			UpstreamNATSWaitTimeoutMS:             345,
			UpstreamReverseWSWaitTimeoutMS:        456,
			UpstreamNativeMessagingHostName:       "com.modcdp.custom",
			UpstreamWSConnectErrorSettleTimeoutMS: 321,
		},
		Injector: InjectorOptions{
			InjectorMode:                        "discover",
			InjectorCLIExtensionPath:            "/tmp/ext",
			InjectorServiceWorkerExtensionID:    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			InjectorServiceWorkerURLIncludes:    []string{"modcdp"},
			InjectorServiceWorkerURLSuffixes:    []string{"/custom/service_worker.js"},
			InjectorTrustServiceWorkerTarget:    true,
			InjectorRequireServiceWorkerTarget:  true,
			InjectorExecutionContextTimeoutMS:   4321,
			InjectorServiceWorkerProbeTimeoutMS: 5432,
			InjectorServiceWorkerReadyTimeoutMS: 6543,
			InjectorServiceWorkerPollIntervalMS: 76,
			InjectorTargetSessionPollIntervalMS: 87,
		},
		ClientOptions: ClientOptions{
			ClientRoutes:               map[string]string{"*.*": "direct_cdp"},
			ClientHydrateAliases:       boolPtr(false),
			ClientMirrorUpstreamEvents: boolPtr(false),
			ClientCDPSendTimeoutMS:     1234,
			ClientEventWaitTimeoutMS:   2345,
		},
		ServerOptions: &ServerConfig{
			Router:             RouterOptions{RouterRoutes: map[string]string{"*.*": "loopback_cdp"}, LoopbackExecutionContextTimeoutMS: 8765},
			ClientOptions:      ClientOptions{ClientCDPSendTimeoutMS: 9876},
			Upstream:           UpstreamTransportOptions{UpstreamWSConnectErrorSettleTimeoutMS: 7654},
			ServerBrowserToken: "token-1",
		},
	})

	if cdp.Launcher.LauncherLocalExecutablePath != "/tmp/chrome" {
		t.Fatalf("Launcher.LauncherLocalExecutablePath = %q", cdp.Launcher.LauncherLocalExecutablePath)
	}
	if cdp.Launcher.LauncherLocalUserDataDir != "/tmp/profile" {
		t.Fatalf("Launcher.LauncherLocalUserDataDir = %q", cdp.Launcher.LauncherLocalUserDataDir)
	}
	if cdp.Upstream.UpstreamWSConnectErrorSettleTimeoutMS != 321 {
		t.Fatalf("Upstream.UpstreamWSConnectErrorSettleTimeoutMS = %d", cdp.Upstream.UpstreamWSConnectErrorSettleTimeoutMS)
	}
	if cdp.Injector.InjectorExecutionContextTimeoutMS != 4321 {
		t.Fatalf("Injector.InjectorExecutionContextTimeoutMS = %d", cdp.Injector.InjectorExecutionContextTimeoutMS)
	}
	if cdp.Injector.InjectorServiceWorkerProbeTimeoutMS != 5432 {
		t.Fatalf("Injector.InjectorServiceWorkerProbeTimeoutMS = %d", cdp.Injector.InjectorServiceWorkerProbeTimeoutMS)
	}
	if cdp.Injector.InjectorServiceWorkerReadyTimeoutMS != 6543 {
		t.Fatalf("Injector.InjectorServiceWorkerReadyTimeoutMS = %d", cdp.Injector.InjectorServiceWorkerReadyTimeoutMS)
	}
	if cdp.Injector.InjectorServiceWorkerPollIntervalMS != 76 {
		t.Fatalf("Injector.InjectorServiceWorkerPollIntervalMS = %d", cdp.Injector.InjectorServiceWorkerPollIntervalMS)
	}
	if cdp.Injector.InjectorTargetSessionPollIntervalMS != 87 {
		t.Fatalf("Injector.InjectorTargetSessionPollIntervalMS = %d", cdp.Injector.InjectorTargetSessionPollIntervalMS)
	}
	if cdp.ClientOptions.ClientRoutes["*.*"] != "direct_cdp" {
		t.Fatalf("ClientOptions.ClientRoutes[*.*] = %q", cdp.ClientOptions.ClientRoutes["*.*"])
	}
	if cdp.ClientOptions.ClientHydrateAliases == nil || *cdp.ClientOptions.ClientHydrateAliases {
		t.Fatalf("ClientOptions.ClientHydrateAliases = %#v", cdp.ClientOptions.ClientHydrateAliases)
	}
	if _, err := cdp.Browser.GetVersion(); err == nil || !strings.Contains(err.Error(), "client_hydrate_aliases is false") {
		t.Fatalf("Browser.GetVersion with aliases disabled error = %v", err)
	}
	if cdp.ClientOptions.ClientMirrorUpstreamEvents == nil || *cdp.ClientOptions.ClientMirrorUpstreamEvents {
		t.Fatalf("ClientOptions.ClientMirrorUpstreamEvents = %#v", cdp.ClientOptions.ClientMirrorUpstreamEvents)
	}
	if cdp.ClientOptions.ClientCDPSendTimeoutMS != 1234 {
		t.Fatalf("ClientOptions.ClientCDPSendTimeoutMS = %d", cdp.ClientOptions.ClientCDPSendTimeoutMS)
	}
	if cdp.ClientOptions.ClientEventWaitTimeoutMS != 2345 {
		t.Fatalf("ClientOptions.ClientEventWaitTimeoutMS = %d", cdp.ClientOptions.ClientEventWaitTimeoutMS)
	}
	params := cdp.serverConfigureParams(nil, nil, nil)
	clientOptionsConfig := params["client_options"].(map[string]any)
	routes := clientOptionsConfig["client_routes"].(map[string]string)
	routerConfig := params["router"].(map[string]any)
	upstreamConfig := params["upstream"].(map[string]any)
	if routes["*.*"] != "direct_cdp" {
		t.Fatalf("configure client routes = %#v", routes)
	}
	if params["server_browser_token"] != "token-1" {
		t.Fatalf("configure browser_token = %#v", params["server_browser_token"])
	}
	if clientOptionsConfig["client_cdp_send_timeout_ms"] != 9876 {
		t.Fatalf("configure cdp_send_timeout_ms = %#v", clientOptionsConfig["client_cdp_send_timeout_ms"])
	}
	if routerConfig["loopback_execution_context_timeout_ms"] != 8765 {
		t.Fatalf("configure loopback_execution_context_timeout_ms = %#v", routerConfig["loopback_execution_context_timeout_ms"])
	}
	if upstreamConfig["upstream_ws_connect_error_settle_timeout_ms"] != 7654 {
		t.Fatalf("configure ws_connect_error_settle_timeout_ms = %#v", upstreamConfig["upstream_ws_connect_error_settle_timeout_ms"])
	}
}

func TestModCDPClientDispatchesRootEventsBeforeExtensionSessionAttached(t *testing.T) {
	cdp := New(Options{})
	seen := make(chan string, 1)
	cdp.On("Target.targetCreated", func(payload any) {
		event, _ := payload.(map[string]any)
		targetInfo, _ := event["targetInfo"].(map[string]any)
		targetID, _ := targetInfo["targetId"].(string)
		seen <- targetID
	})

	cdp.handleEventMessage(map[string]any{
		"method": "Target.targetCreated",
		"params": map[string]any{
			"targetInfo": map[string]any{
				"targetId":        "target-1",
				"type":            "page",
				"title":           "about:blank",
				"url":             "about:blank",
				"attached":        false,
				"canAccessOpener": false,
			},
		},
	})

	select {
	case got := <-seen:
		if got != "target-1" {
			t.Fatalf("Target.targetCreated targetId = %q", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for root event")
	}
}

func TestModCDPClientEventDispatchSnapshotsHandlersWhenOnceRemovesItself(t *testing.T) {
	cdp := New(Options{})
	cdp.ExtSessionID = "ext-session"
	seen := make(chan string, 3)
	cdp.Once("Target.targetCreated", func(payload any) {
		seen <- "once"
	})
	cdp.On("Target.targetCreated", func(payload any) {
		seen <- "persistent"
	})

	cdp.handleEventMessage(map[string]any{
		"method": "Target.targetCreated",
		"params": map[string]any{
			"targetInfo": map[string]any{
				"targetId":        "target-1",
				"type":            "page",
				"title":           "about:blank",
				"url":             "about:blank",
				"attached":        false,
				"canAccessOpener": false,
			},
		},
	})

	first := map[string]bool{}
	for len(first) < 2 {
		select {
		case got := <-seen:
			first[got] = true
		case <-time.After(time.Second):
			t.Fatalf("timed out waiting for first dispatch, saw %#v", first)
		}
	}
	if !first["once"] || !first["persistent"] {
		t.Fatalf("first dispatch handlers = %#v", first)
	}

	cdp.handleEventMessage(map[string]any{
		"method": "Target.targetCreated",
		"params": map[string]any{
			"targetInfo": map[string]any{
				"targetId":        "target-2",
				"type":            "page",
				"title":           "about:blank",
				"url":             "about:blank",
				"attached":        false,
				"canAccessOpener": false,
			},
		},
	})

	select {
	case got := <-seen:
		if got != "persistent" {
			t.Fatalf("second dispatch handler = %q", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for second dispatch")
	}
	select {
	case got := <-seen:
		t.Fatalf("unexpected extra handler on second dispatch: %q", got)
	case <-time.After(100 * time.Millisecond):
	}
}

func TestModCDPClientOptionsMarshalToSnakeCaseConfigShape(t *testing.T) {
	encoded, err := json.Marshal(Options{
		Launcher: LaunchOptions{
			LauncherMode:                      "local",
			LauncherLocalExecutablePath:       "/tmp/chrome",
			LauncherLocalUserDataDir:          "/tmp/profile",
			LauncherLocalCDPTransport:         "pipe",
			LauncherLocalChromeReadyTimeoutMS: 45_000,
			LauncherBBAPIKey:                  "test-key",
			LauncherBBSessionCreateParams:     map[string]any{"keepAlive": true},
		},
		Upstream: UpstreamTransportOptions{
			UpstreamMode:                          "nativemessaging",
			UpstreamNATSSubjectPrefix:             "modcdp.test",
			UpstreamNATSWaitTimeoutMS:             789,
			UpstreamReverseWSWaitTimeoutMS:        1_234,
			UpstreamNativeMessagingHostName:       "com.modcdp.custom",
			UpstreamWSConnectErrorSettleTimeoutMS: 321,
		},
		Injector: InjectorOptions{
			InjectorMode:                         "discover",
			InjectorServiceWorkerExtensionID:     "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			InjectorServiceWorkerURLSuffixes:     []string{"/modcdp/service_worker.js"},
			InjectorTrustServiceWorkerTarget:     true,
			InjectorRequireServiceWorkerTarget:   true,
			InjectorServiceWorkerReadyExpression: "Boolean(globalThis.ModCDP)",
			InjectorExecutionContextTimeoutMS:    4_321,
		},
		ClientOptions: ClientOptions{
			ClientRoutes:               map[string]string{"*.*": "service_worker"},
			ClientHydrateAliases:       boolPtr(false),
			ClientMirrorUpstreamEvents: boolPtr(false),
			ClientCDPSendTimeoutMS:     987,
		},
		ServerOptions: &ServerConfig{
			Upstream: UpstreamTransportOptions{UpstreamWSCDPURL: "http://127.0.0.1:9222"},
		},
		CustomCommands: []CustomCommand{{Name: "Custom.echo", Expression: "async () => null"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	raw := string(encoded)
	for _, wrong := range []string{
		"Launcher", "ExecutablePath", "LocalCDPTransport", "BrowserbaseAPIKey",
		"Upstream", "UpstreamNATSSubjectPrefix", "UpstreamNATSWaitTimeoutMS", "UpstreamReverseWSWaitTimeoutMS", "UpstreamNativeMessagingHostName",
		"Injector", "InjectorServiceWorkerURLSuffixes", "InjectorTrustServiceWorkerTarget",
		"Client", "HydrateAliases", "CustomCommands",
	} {
		if strings.Contains(raw, wrong) {
			t.Fatalf("encoded options leaked Go field name %q in %s", wrong, raw)
		}
	}
	for _, expected := range []string{
		`"launcher"`,
		`"launcher_mode"`,
		`"launcher_local_executable_path"`,
		`"launcher_local_user_data_dir"`,
		`"launcher_local_cdp_transport"`,
		`"launcher_bb_api_key"`,
		`"launcher_bb_session_create_params"`,
		`"upstream"`,
		`"upstream_mode"`,
		`"upstream_nats_subject_prefix"`,
		`"upstream_nats_wait_timeout_ms"`,
		`"upstream_reversews_wait_timeout_ms"`,
		`"upstream_nativemessaging_host_name"`,
		`"injector"`,
		`"injector_mode"`,
		`"injector_service_worker_url_suffixes"`,
		`"injector_trust_service_worker_target"`,
		`"injector_require_service_worker_target"`,
		`"injector_service_worker_ready_expression"`,
		`"injector_execution_context_timeout_ms"`,
		`"client_options"`,
		`"client_hydrate_aliases"`,
		`"client_mirror_upstream_events"`,
		`"client_cdp_send_timeout_ms"`,
		`"custom_commands"`,
	} {
		if !strings.Contains(raw, expected) {
			t.Fatalf("encoded options missing %s in %s", expected, raw)
		}
	}
}

func TestModCDPClientOptionsUnmarshalNullServerOptionsDisablesServerConfig(t *testing.T) {
	var options Options
	if err := json.Unmarshal([]byte(`{"server_options": null}`), &options); err != nil {
		t.Fatal(err)
	}
	cdp := New(options)

	if cdp.ServerOptions != nil {
		t.Fatalf("ServerOptions = %#v", cdp.ServerOptions)
	}
}

func TestModCDPClientPreservesExplicitEmptyServiceWorkerSuffixConfig(t *testing.T) {
	cdp := New(Options{
		Injector: InjectorOptions{
			InjectorMode:                     "borrow",
			InjectorServiceWorkerURLSuffixes: []string{},
		},
	})

	if len(cdp.Injector.InjectorServiceWorkerURLSuffixes) != 0 {
		t.Fatalf("InjectorServiceWorkerURLSuffixes = %#v", cdp.Injector.InjectorServiceWorkerURLSuffixes)
	}
	injectorConfig := cdp.baseInjectorOptions(nil)
	if len(injectorConfig.InjectorServiceWorkerURLSuffixes) != 0 {
		t.Fatalf("injector InjectorServiceWorkerURLSuffixes = %#v", injectorConfig.InjectorServiceWorkerURLSuffixes)
	}
}

func TestModCDPClientPreservesExplicitNoneServerOptionsConfig(t *testing.T) {
	cdp := New(Options{ServerOptions: ServerOptionsNone})

	if cdp.ServerOptions != nil {
		t.Fatalf("ServerOptions = %#v", cdp.ServerOptions)
	}
}

func TestModCDPClientAllowsDisabledServerOptionsWithModCDPServerUpstreams(t *testing.T) {
	for _, mode := range []string{"nativemessaging", "reversews", "nats"} {
		cdp := New(Options{
			Upstream:      UpstreamTransportOptions{UpstreamMode: mode},
			ServerOptions: ServerOptionsNone,
		})
		if cdp.ServerOptions != nil {
			t.Fatalf("%s ServerOptions = %#v", mode, cdp.ServerOptions)
		}
	}
}

func TestModCDPClientDefaultsServiceWorkerSuffixConfigToModCDPWorker(t *testing.T) {
	cdp := New(Options{})

	if len(cdp.Injector.InjectorServiceWorkerURLSuffixes) != 1 || cdp.Injector.InjectorServiceWorkerURLSuffixes[0] != "/modcdp/service_worker.js" {
		t.Fatalf("InjectorServiceWorkerURLSuffixes = %#v", cdp.Injector.InjectorServiceWorkerURLSuffixes)
	}
	injectorConfig := cdp.baseInjectorOptions(nil)
	if len(injectorConfig.InjectorServiceWorkerURLSuffixes) != 1 || injectorConfig.InjectorServiceWorkerURLSuffixes[0] != "/modcdp/service_worker.js" {
		t.Fatalf("injector InjectorServiceWorkerURLSuffixes = %#v", injectorConfig.InjectorServiceWorkerURLSuffixes)
	}
}

func TestModCDPClientDefaultsUnconfiguredModCDPServerUpstreamsToNoInjector(t *testing.T) {
	for _, mode := range []string{"nativemessaging", "reversews", "nats"} {
		launched := New(Options{
			Launcher: LaunchOptions{LauncherMode: "local"},
			Upstream: UpstreamTransportOptions{UpstreamMode: mode},
		})
		if launched.Launcher.LauncherMode != "local" {
			t.Fatalf("%s launched Launcher.LauncherMode = %q", mode, launched.Launcher.LauncherMode)
		}
		if launched.Injector.InjectorMode != "none" {
			t.Fatalf("%s launched Injector.InjectorMode = %q", mode, launched.Injector.InjectorMode)
		}

		attachOnly := New(Options{
			Upstream: UpstreamTransportOptions{UpstreamMode: mode},
		})
		if attachOnly.Launcher.LauncherMode != "none" {
			t.Fatalf("%s attach-only Launcher.LauncherMode = %q", mode, attachOnly.Launcher.LauncherMode)
		}
		if attachOnly.Injector.InjectorMode != "none" {
			t.Fatalf("%s attach-only Injector.InjectorMode = %q", mode, attachOnly.Injector.InjectorMode)
		}
	}
}

func TestModCDPClientOrdersLocalAutoInjectionAsLaunchFlagThenLoadUnpackedFallback(t *testing.T) {
	cdp := New(Options{
		Launcher: LaunchOptions{LauncherMode: "local"},
		Injector: InjectorOptions{InjectorMode: "cli"},
	})

	got := []string{}
	for _, injector := range cdp.extensionInjectorsForConfig() {
		switch injector.(type) {
		case *CLIExtensionInjector:
			got = append(got, "CLIExtensionInjector")
		case *CDPExtensionInjector:
			got = append(got, "CDPExtensionInjector")
		case *DiscoverExtensionInjector:
			got = append(got, "DiscoverExtensionInjector")
		case *BorrowExtensionInjector:
			got = append(got, "BorrowExtensionInjector")
		default:
			got = append(got, fmt.Sprintf("%T", injector))
		}
	}
	want := []string{
		"CLIExtensionInjector",
		"CDPExtensionInjector",
		"DiscoverExtensionInjector",
		"BorrowExtensionInjector",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("injector order = %#v", got)
	}
}

func TestModCDPClientRejectsUnknownComponentModesAtTheirOwningFactoryBoundary(t *testing.T) {
	cases := []struct {
		name string
		cdp  *ModCDPClient
		want string
	}{
		{
			name: "upstream",
			cdp:  New(Options{Upstream: UpstreamTransportOptions{UpstreamMode: "bogus"}}),
			want: "unknown upstream.upstream_mode=bogus",
		},
		{
			name: "launch",
			cdp: New(Options{
				Launcher: LaunchOptions{LauncherMode: "bogus"},
				Upstream: UpstreamTransportOptions{UpstreamMode: "ws", UpstreamWSCDPURL: "ws://127.0.0.1:1/devtools/browser/test"},
			}),
			want: "unknown launcher.launcher_mode=bogus",
		},
		{
			name: "injector",
			cdp: New(Options{
				Launcher: LaunchOptions{LauncherMode: "none"},
				Upstream: UpstreamTransportOptions{UpstreamMode: "ws", UpstreamWSCDPURL: "ws://127.0.0.1:1/devtools/browser/test"},
				Injector: InjectorOptions{InjectorMode: "bogus"},
			}),
			want: "unknown injector.injector_mode=bogus",
		},
	}
	for _, testCase := range cases {
		if err := testCase.cdp.Connect(); err == nil || !strings.Contains(err.Error(), testCase.want) {
			t.Fatalf("%s Connect error = %v", testCase.name, err)
		}
	}
}

func TestModCDPClientConnectsWithLocalLaunchAndInjectorChain(t *testing.T) {
	headless := runtime.GOOS == "linux" && os.Getenv("DISPLAY") == ""
	extensionPath, err := filepath.Abs("../../../dist/extension")
	if err != nil {
		t.Fatal(err)
	}
	cdp := New(Options{
		Launcher: LaunchOptions{
			LauncherMode:                      "local",
			LauncherLocalHeadless:             boolPtr(headless),
			LauncherLocalChromeReadyTimeoutMS: 60_000,
		},
		Upstream: UpstreamTransportOptions{UpstreamMode: "ws"},
		Injector: InjectorOptions{
			InjectorMode:                        "cli",
			InjectorCLIExtensionPath:            extensionPath,
			InjectorServiceWorkerURLSuffixes:    []string{"/modcdp/service_worker.js"},
			InjectorTrustServiceWorkerTarget:    true,
			InjectorServiceWorkerProbeTimeoutMS: 30_000,
		},
		ClientOptions: ClientOptions{
			ClientRoutes:             map[string]string{"Mod.*": "service_worker", "Custom.*": "service_worker", "*.*": "direct_cdp"},
			ClientCDPSendTimeoutMS:   30_000,
			ClientEventWaitTimeoutMS: 30_000,
		},
		ServerOptions: &ServerConfig{
			Router: RouterOptions{RouterRoutes: map[string]string{"*.*": "loopback_cdp"}},
		},
	})
	defer cdp.Close()

	if err := cdp.Connect(); err != nil {
		t.Fatal(err)
	}
	switch cdp.ConnectTiming["injector_source"] {
	case "discover", "cli", "cdp", "borrow":
	default:
		t.Fatalf("injector_source = %v", cdp.ConnectTiming["injector_source"])
	}
	if cdp.ExtensionID != DefaultModCDPExtensionID {
		t.Fatalf("ExtensionID = %q", cdp.ExtensionID)
	}
	result, err := cdp.Mod.Evaluate(map[string]any{
		"expression": "chrome.runtime.getURL('modcdp/service_worker.js')",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result != "chrome-extension://mdedooklbnfejodmnhmkdpkaedafkehf/modcdp/service_worker.js" {
		t.Fatalf("Mod.evaluate = %#v", result)
	}
	contextsRaw, err := cdp.Mod.Evaluate(map[string]any{
		"expression": "chrome.runtime.getContexts({}).then((contexts) => contexts.map((context) => ({ type: context.contextType, url: context.documentUrl || context.origin || '' })))",
	})
	if err != nil {
		t.Fatal(err)
	}
	contexts, _ := contextsRaw.([]any)
	foundOffscreen := false
	for _, rawContext := range contexts {
		context, _ := rawContext.(map[string]any)
		if context["type"] == "OFFSCREEN_DOCUMENT" &&
			context["url"] == "chrome-extension://"+DefaultModCDPExtensionID+"/offscreen/keepalive.html" {
			foundOffscreen = true
		}
	}
	if !foundOffscreen {
		t.Fatalf("expected offscreen keepalive context, got %#v", contextsRaw)
	}
	directTargetRaw, err := cdp.Send("Target.createTarget", map[string]any{"url": "about:blank#direct-session-routing"})
	if err != nil {
		t.Fatal(err)
	}
	directTarget, _ := directTargetRaw.(map[string]any)
	directTargetID, _ := directTarget["targetId"].(string)
	if directTargetID == "" {
		t.Fatalf("Target.createTarget = %#v", directTargetRaw)
	}
	defer cdp.Send("Target.closeTarget", map[string]any{"targetId": directTargetID})
	directSessionRaw, err := cdp.Send("Target.attachToTarget", map[string]any{"targetId": directTargetID, "flatten": true})
	if err != nil {
		t.Fatal(err)
	}
	directSession, _ := directSessionRaw.(map[string]any)
	directSessionID, _ := directSession["sessionId"].(string)
	if directSessionID == "" {
		t.Fatalf("Target.attachToTarget = %#v", directSessionRaw)
	}
	directEvalRaw, err := cdp.Send("Runtime.evaluate", map[string]any{"expression": "1 + 1", "returnByValue": true}, directSessionID)
	if err != nil {
		t.Fatal(err)
	}
	directEval, _ := directEvalRaw.(map[string]any)
	directRemoteObject, _ := directEval["result"].(map[string]any)
	if directRemoteObject["value"] != float64(2) {
		t.Fatalf("Runtime.evaluate = %#v", directEvalRaw)
	}
	sent_at := time.Now().UnixMilli()
	pong := make(chan map[string]any, 1)
	muted := make(chan any, 1)
	mutedHandler := func(payload any) {
		muted <- payload
	}
	cdp.On("Mod.pong", mutedHandler)
	cdp.Off("Mod.pong", mutedHandler)
	pongHandler := func(payload any) {
		event, _ := payload.(map[string]any)
		if event == nil {
			return
		}
		if event["sent_at"] == float64(sent_at) || event["sent_at"] == sent_at {
			pong <- event
		}
	}
	cdp.On("Mod.pong", pongHandler)
	pongHandlerActive := true
	removePongHandler := func() {
		if pongHandlerActive {
			cdp.Off("Mod.pong", pongHandler)
			pongHandlerActive = false
		}
	}
	defer removePongHandler()
	ping_raw, err := cdp.Mod.Ping(map[string]any{"sent_at": sent_at})
	if err != nil {
		t.Fatal(err)
	}
	ping_result, _ := ping_raw.(map[string]any)
	if ping_result["ok"] != true {
		t.Fatalf("Mod.ping = %#v", ping_result)
	}
	select {
	case pong_payload := <-pong:
		removePongHandler()
		if pong_payload["from"] != "extension-service-worker" {
			t.Fatalf("Mod.pong from = %#v", pong_payload["from"])
		}
		if _, ok := numberAsInt64(pong_payload["received_at"]); !ok {
			t.Fatalf("Mod.pong received_at = %#v", pong_payload["received_at"])
		}
		select {
		case payload := <-muted:
			t.Fatalf("off handler received payload %#v", payload)
		case <-time.After(200 * time.Millisecond):
		}
		if _, err := cdp.Mod.Ping(map[string]any{"sent_at": sent_at + 1}); err != nil {
			t.Fatal(err)
		}
		select {
		case event := <-pong:
			t.Fatalf("once handler received second event %#v", event)
		case <-time.After(200 * time.Millisecond):
		}
	case <-time.After(30 * time.Second):
		t.Fatal("timed out waiting for Mod.pong")
	}
}

func TestModCDPClientCloseDoesNotCloseRemoteBrowserItDidNotLaunch(t *testing.T) {
	headless := true
	extensionPath, err := filepath.Abs("../../../dist/extension")
	if err != nil {
		t.Fatal(err)
	}
	chrome, err := NewLocalBrowserLauncher(LaunchOptions{
		LauncherLocalHeadless:             &headless,
		LauncherLocalChromeReadyTimeoutMS: 60_000,
		// This test manually supplies --load-extension, so it intentionally uses
		// the launch-flag browser path instead of relying on the client fallback.
		LauncherLocalExecutablePath: reverseWSTestBrowserPath(t),
		LauncherLocalExtraArgs:      []string{"--load-extension=" + extensionPath},
	}).Launch(LaunchOptions{})
	if err != nil {
		t.Fatal(err)
	}
	defer chrome.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	rawConn, _, _, err := ws.Dial(ctx, chrome.CDPURL)
	if err != nil {
		t.Fatal(err)
	}
	defer rawConn.Close()
	cdp := New(Options{
		Launcher: LaunchOptions{LauncherMode: "remote", LauncherRemoteCDPURL: chrome.CDPURL},
		Upstream: UpstreamTransportOptions{UpstreamMode: "ws", UpstreamWSCDPURL: chrome.CDPURL},
		Injector: InjectorOptions{
			InjectorMode:                        "cli",
			InjectorCLIExtensionPath:            extensionPath,
			InjectorServiceWorkerURLSuffixes:    []string{"/modcdp/service_worker.js"},
			InjectorTrustServiceWorkerTarget:    true,
			InjectorServiceWorkerReadyTimeoutMS: 30_000,
			InjectorServiceWorkerProbeTimeoutMS: 30_000,
		},
		ClientOptions: ClientOptions{ClientRoutes: map[string]string{"*.*": "direct_cdp"}},
	})
	if err := cdp.Connect(); err != nil {
		t.Fatal(err)
	}
	cdp.Close()
	time.Sleep(500 * time.Millisecond)

	if err := wsutil.WriteClientText(rawConn, []byte(`{"id":1,"method":"Browser.getVersion","params":{}}`)); err != nil {
		t.Fatal(err)
	}
	body, err := wsutil.ReadServerText(rawConn)
	if err != nil {
		t.Fatal(err)
	}
	var response struct {
		ID     int `json:"id"`
		Result struct {
			Product string `json:"product"`
		} `json:"result"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		t.Fatal(err)
	}
	if response.ID != 1 {
		t.Fatalf("unexpected response id %d", response.ID)
	}
	if !strings.Contains(response.Result.Product, "Chrome") && !strings.Contains(response.Result.Product, "Chromium") {
		t.Fatalf("unexpected product %q", response.Result.Product)
	}
}

func TestModCDPClientCloseKeepsInjectorFilesUntilAfterLaunchedBrowserShutdown(t *testing.T) {
	extensionPath, err := filepath.Abs(filepath.Join("..", "..", "..", "dist", "extension"))
	if err != nil {
		t.Fatal(err)
	}
	cdp := New(Options{
		Launcher: LaunchOptions{
			LauncherMode:          "local",
			LauncherLocalHeadless: boolPtr(true),
			// After explicit CHROME_PATH and CI /usr/bin/chromium, this test uses
			// Chrome for Testing because Canary rejects --load-extension in this
			// local launch injector path.
			LauncherLocalExecutablePath: reverseWSTestBrowserPath(t),
		},
		Upstream: UpstreamTransportOptions{
			UpstreamMode: "ws",
		},
		Injector: InjectorOptions{
			InjectorMode:                     "cli",
			InjectorCLIExtensionPath:         extensionPath,
			InjectorServiceWorkerURLSuffixes: []string{"/modcdp/service_worker.js"},
			InjectorTrustServiceWorkerTarget: true,
		},
		ServerOptions: &ServerConfig{Router: RouterOptions{RouterRoutes: map[string]string{"*.*": "loopback_cdp"}}},
	})
	defer cdp.Close()

	if err := cdp.Connect(); err != nil {
		t.Fatal(err)
	}
	var localLaunchInjector *CLIExtensionInjector
	for _, injector := range cdp.extensionInjectors {
		if typed, ok := injector.(*CLIExtensionInjector); ok {
			localLaunchInjector = typed
		}
	}
	if localLaunchInjector == nil {
		t.Fatal("expected CLIExtensionInjector")
	}
	unpackedExtensionPath := localLaunchInjector.UnpackedExtensionPath
	if unpackedExtensionPath == extensionPath {
		t.Fatalf("UnpackedExtensionPath = %q", unpackedExtensionPath)
	}

	originalClose := cdp.launchedBrowser.Close
	browserCloseSawExtension := false
	cdp.launchedBrowser.Close = func() {
		_, err := os.Stat(unpackedExtensionPath)
		browserCloseSawExtension = err == nil
		originalClose()
	}
	cdp.Close()

	if !browserCloseSawExtension {
		t.Fatal("browser close did not see prepared extension files")
	}
	if _, err := os.Stat(unpackedExtensionPath); err == nil {
		t.Fatalf("expected prepared temp extension files to be cleaned up after close")
	}
	if cdp.transport != nil {
		t.Fatal("expected transport to be nil")
	}
	if cdp.launchedBrowser != nil {
		t.Fatal("expected launchedBrowser to be nil")
	}
	if cdp.extensionInjectors != nil {
		t.Fatal("expected extensionInjectors to be nil")
	}
}

func TestModCDPClientCloseClearsTopLevelConnectionState(t *testing.T) {
	cdp := New(Options{
		Launcher: LaunchOptions{
			LauncherMode:          "local",
			LauncherLocalHeadless: boolPtr(true),
		},
		Upstream: UpstreamTransportOptions{UpstreamMode: "ws"},
		Injector: InjectorOptions{
			InjectorMode:                     "cli",
			InjectorServiceWorkerURLSuffixes: []string{"/modcdp/service_worker.js"},
			InjectorTrustServiceWorkerTarget: true,
		},
	})
	if err := cdp.Connect(); err != nil {
		t.Fatal(err)
	}
	transport, ok := cdp.transport.(*WSUpstreamTransport)
	if !ok {
		t.Fatalf("transport = %T", cdp.transport)
	}
	if transport.Conn == nil {
		t.Fatal("expected transport-owned websocket conn")
	}
	cdp.Close()
	if cdp.transport != nil {
		t.Fatal("Close left transport set")
	}
	if _, err := cdp.SendRaw("Browser.getVersion", map[string]any{}); err == nil || !strings.Contains(err.Error(), "ModCDP upstream is not connected") {
		t.Fatalf("SendRaw after close error = %v", err)
	}
}

func reverseWSTestBrowserPath(t *testing.T) string {
	t.Helper()
	explicitCandidates := []string{os.Getenv("CHROME_PATH")}
	if runtime.GOOS == "linux" {
		explicitCandidates = append(explicitCandidates, "/usr/bin/chromium")
	}
	for _, candidate := range explicitCandidates {
		if candidate == "" {
			continue
		}
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		home = "."
	}
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		localAppData = filepath.Join(home, "AppData", "Local")
	}
	var patterns []string
	switch runtime.GOOS {
	case "darwin":
		patterns = []string{
			filepath.Join(home, "Library", "Caches", "ms-playwright", "chromium-*", "chrome-mac*", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
			filepath.Join(home, "Library", "Caches", "ms-playwright", "chromium-*", "chrome-mac*", "Chromium.app", "Contents", "MacOS", "Chromium"),
			filepath.Join(home, "Library", "Caches", "puppeteer", "chrome", "mac*-*", "chrome-mac*", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
		}
	case "windows":
		patterns = []string{
			filepath.Join(localAppData, "ms-playwright", "chromium-*", "chrome-win*", "chrome.exe"),
			filepath.Join(home, ".cache", "puppeteer", "chrome", "win*-*", "chrome.exe"),
		}
	default:
		patterns = []string{
			filepath.Join(home, ".cache", "ms-playwright", "chromium-*", "chrome-linux*", "chrome"),
			filepath.Join("/opt", "pw-browsers", "chromium-*", "chrome-linux*", "chrome"),
			filepath.Join(home, ".cache", "puppeteer", "chrome", "linux-*", "chrome-linux*", "chrome"),
		}
	}
	var candidates []string
	for _, pattern := range patterns {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			continue
		}
		candidates = append(candidates, matches...)
	}
	candidates = newestChromeForTestingFirst(candidates)
	if len(candidates) > 0 {
		return candidates[0]
	}
	t.Fatal("Reversews tests require CHROME_PATH, /usr/bin/chromium, or Chrome for Testing.")
	return ""
}

func newestChromeForTestingFirst(candidates []string) []string {
	seen := map[string]bool{}
	deduped := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		if candidate == "" || seen[candidate] {
			continue
		}
		seen[candidate] = true
		deduped = append(deduped, candidate)
	}
	sort.SliceStable(deduped, func(i, j int) bool {
		leftVersion := maxPathNumber(deduped[i])
		rightVersion := maxPathNumber(deduped[j])
		if leftVersion != rightVersion {
			return leftVersion > rightVersion
		}
		leftStat, leftErr := os.Stat(deduped[i])
		rightStat, rightErr := os.Stat(deduped[j])
		var leftMtime, rightMtime time.Time
		if leftErr == nil {
			leftMtime = leftStat.ModTime()
		}
		if rightErr == nil {
			rightMtime = rightStat.ModTime()
		}
		if !leftMtime.Equal(rightMtime) {
			return leftMtime.After(rightMtime)
		}
		return deduped[i] < deduped[j]
	})
	return deduped
}

func maxPathNumber(value string) int {
	maxValue := 0
	for _, raw := range regexp.MustCompile(`\d+`).FindAllString(value, -1) {
		number, err := strconv.Atoi(raw)
		if err == nil && number > maxValue {
			maxValue = number
		}
	}
	return maxValue
}

func TestCustomCommandSchemasValidateParamsAndResults(t *testing.T) {
	cdp := New(Options{
		CustomCommands: []CustomCommand{
			{
				Name: "Custom.echo",
				ParamsSchema: map[string]any{
					"type":                 "object",
					"required":             []any{"value"},
					"properties":           map[string]any{"value": map[string]any{"type": "string"}},
					"additionalProperties": false,
				},
				ResultSchema: map[string]any{
					"type":                 "object",
					"required":             []any{"value"},
					"properties":           map[string]any{"value": map[string]any{"type": "string"}},
					"additionalProperties": false,
				},
			},
		},
	})

	if err := cdp.validateCommandParams("Custom.echo", map[string]any{"value": "ok"}); err != nil {
		t.Fatalf("expected valid params, got %v", err)
	}
	if err := cdp.validateCommandParams("Custom.echo", map[string]any{"value": 42}); err == nil || !strings.Contains(err.Error(), "params_schema") {
		t.Fatalf("expected params schema error, got %v", err)
	}
	if err := cdp.validateCommandResult("Custom.echo", map[string]any{"value": "ok"}); err != nil {
		t.Fatalf("expected valid result, got %v", err)
	}
	if err := cdp.validateCommandResult("Custom.echo", map[string]any{"value": 42}); err == nil || !strings.Contains(err.Error(), "result_schema") {
		t.Fatalf("expected result schema error, got %v", err)
	}
}

func TestCustomEventSchemasValidatePayloads(t *testing.T) {
	cdp := New(Options{
		CustomEvents: []CustomEvent{
			{
				Name: "Custom.changed",
				EventSchema: map[string]any{
					"type":                 "object",
					"required":             []any{"targetId"},
					"properties":           map[string]any{"targetId": map[string]any{"type": "string"}},
					"additionalProperties": false,
				},
			},
		},
	})

	if _, ok := cdp.validateEventData("Custom.changed", map[string]any{"targetId": "target-1"}); !ok {
		t.Fatal("expected valid event payload")
	}
	expectPanic(t, func() { cdp.validateEventData("Custom.changed", map[string]any{"targetId": 1}) })
}

func TestTypedCDPSurfaceInitializesAndEncodesParams(t *testing.T) {
	cdp := New(Options{})
	if cdp.Target.client != cdp {
		t.Fatal("expected Target domain to be initialized with the client")
	}

	params := TargetCreateTargetParams{
		URL:        "https://example.com",
		Background: Bool(true),
	}
	raw, err := cdpParamsMap(params)
	if err != nil {
		t.Fatal(err)
	}
	if raw["url"] != "https://example.com" || raw["background"] != true {
		t.Fatalf("unexpected encoded Target.createTarget params: %#v", raw)
	}
	if _, ok := raw["sessionId"]; ok {
		t.Fatalf("SessionID must stay transport-only, got %#v", raw)
	}
}
