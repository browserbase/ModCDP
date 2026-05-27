// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.ModCDPClient.ts
// - ./python/tests/test_ModCDPClient.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package client

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	transportpkg "github.com/browserbase/modcdp/go/modcdp/transport"
)

func TestModCDPClientUsesFlatOwnerPrefixedConfig(t *testing.T) {
	cdp := New(Config{
		Launcher: LauncherConfig{
			LauncherMode:                "local",
			LauncherLocalExecutablePath: "/tmp/chrome",
			LauncherLocalUserDataDir:    "/tmp/profile",
			LauncherLocalHeadless:       boolPtr(true),
		},
		Upstream: UpstreamTransportConfig{
			UpstreamMode:                          "ws",
			UpstreamWSCDPURL:                      "http://127.0.0.1:9222",
			UpstreamWSConnectErrorSettleTimeoutMS: 321,
		},
		Injector: InjectorConfig{
			InjectorMode:                        "discover",
			InjectorDiscoverExtensionPath:       "/tmp/ext",
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
		Router: RouterConfig{RouterRoutes: map[string]string{"*.*": "direct_cdp"}, LoopbackExecutionContextTimeoutMS: 4321},
		ClientConfig: ClientConfig{
			ClientHydrateAliases:       boolPtr(false),
			ClientMirrorUpstreamEvents: boolPtr(false),
			ClientCDPSendTimeoutMS:     1234,
			ClientEventWaitTimeoutMS:   2345,
			ClientHeartbeatIntervalMS:  3456,
		},
		ServerConfig: &ServerConfig{
			Router:       RouterConfig{RouterRoutes: map[string]string{"*.*": "loopback_cdp"}},
			ClientConfig: ClientConfig{ClientCDPSendTimeoutMS: 9876},
			Upstream:     UpstreamTransportConfig{UpstreamWSConnectErrorSettleTimeoutMS: 7654},
		},
	})

	if cdp.Config.Launcher.LauncherLocalExecutablePath != "/tmp/chrome" {
		t.Fatalf("Launcher.LauncherLocalExecutablePath = %q", cdp.Config.Launcher.LauncherLocalExecutablePath)
	}
	if cdp.Config.Launcher.LauncherLocalUserDataDir != "/tmp/profile" {
		t.Fatalf("Launcher.LauncherLocalUserDataDir = %q", cdp.Config.Launcher.LauncherLocalUserDataDir)
	}
	if cdp.Config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS != 321 {
		t.Fatalf("Upstream.UpstreamWSConnectErrorSettleTimeoutMS = %d", cdp.Config.Upstream.UpstreamWSConnectErrorSettleTimeoutMS)
	}
	if cdp.Config.Injector.InjectorExecutionContextTimeoutMS != 4321 {
		t.Fatalf("Injector.InjectorExecutionContextTimeoutMS = %d", cdp.Config.Injector.InjectorExecutionContextTimeoutMS)
	}
	if cdp.Config.Injector.InjectorServiceWorkerProbeTimeoutMS != 5432 {
		t.Fatalf("Injector.InjectorServiceWorkerProbeTimeoutMS = %d", cdp.Config.Injector.InjectorServiceWorkerProbeTimeoutMS)
	}
	if cdp.Config.Injector.InjectorServiceWorkerReadyTimeoutMS != 6543 {
		t.Fatalf("Injector.InjectorServiceWorkerReadyTimeoutMS = %d", cdp.Config.Injector.InjectorServiceWorkerReadyTimeoutMS)
	}
	if cdp.Config.Injector.InjectorServiceWorkerPollIntervalMS != 76 {
		t.Fatalf("Injector.InjectorServiceWorkerPollIntervalMS = %d", cdp.Config.Injector.InjectorServiceWorkerPollIntervalMS)
	}
	if cdp.Config.Injector.InjectorTargetSessionPollIntervalMS != 87 {
		t.Fatalf("Injector.InjectorTargetSessionPollIntervalMS = %d", cdp.Config.Injector.InjectorTargetSessionPollIntervalMS)
	}
	if cdp.Config.Router.RouterRoutes["*.*"] != "direct_cdp" {
		t.Fatalf("Router.RouterRoutes[*.*] = %q", cdp.Config.Router.RouterRoutes["*.*"])
	}
	if cdp.Config.ClientConfig.ClientHydrateAliases == nil || *cdp.Config.ClientConfig.ClientHydrateAliases {
		t.Fatalf("ClientConfig.ClientHydrateAliases = %#v", cdp.Config.ClientConfig.ClientHydrateAliases)
	}
	if _, err := cdp.Browser.GetVersion(); err == nil || !strings.Contains(err.Error(), "client_hydrate_aliases is false") {
		t.Fatalf("Browser.GetVersion with aliases disabled error = %v", err)
	}
	if cdp.Config.ClientConfig.ClientMirrorUpstreamEvents == nil || *cdp.Config.ClientConfig.ClientMirrorUpstreamEvents {
		t.Fatalf("ClientConfig.ClientMirrorUpstreamEvents = %#v", cdp.Config.ClientConfig.ClientMirrorUpstreamEvents)
	}
	if cdp.Config.ClientConfig.ClientCDPSendTimeoutMS != 1234 {
		t.Fatalf("ClientConfig.ClientCDPSendTimeoutMS = %d", cdp.Config.ClientConfig.ClientCDPSendTimeoutMS)
	}
	if cdp.Config.ClientConfig.ClientEventWaitTimeoutMS != 2345 {
		t.Fatalf("ClientConfig.ClientEventWaitTimeoutMS = %d", cdp.Config.ClientConfig.ClientEventWaitTimeoutMS)
	}
	if cdp.Config.ClientConfig.ClientHeartbeatIntervalMS != 3456 {
		t.Fatalf("ClientConfig.ClientHeartbeatIntervalMS = %d", cdp.Config.ClientConfig.ClientHeartbeatIntervalMS)
	}
	params := cdp.serverConfigureParams(nil, nil, nil)
	clientConfigConfig := params["client_config"].(map[string]any)
	routerConfig := params["router"].(map[string]any)
	upstreamConfig := params["upstream"].(map[string]any)
	routes := routerConfig["router_routes"].(map[string]string)
	if routes["*.*"] != "loopback_cdp" {
		t.Fatalf("configure router routes = %#v", routes)
	}
	if clientConfigConfig["client_cdp_send_timeout_ms"] != 9876 {
		t.Fatalf("configure cdp_send_timeout_ms = %#v", clientConfigConfig["client_cdp_send_timeout_ms"])
	}
	if routerConfig["loopback_execution_context_timeout_ms"] != 4321 {
		t.Fatalf("configure loopback_execution_context_timeout_ms = %#v", routerConfig["loopback_execution_context_timeout_ms"])
	}
	if upstreamConfig["upstream_ws_connect_error_settle_timeout_ms"] != 7654 {
		t.Fatalf("configure ws_connect_error_settle_timeout_ms = %#v", upstreamConfig["upstream_ws_connect_error_settle_timeout_ms"])
	}
}

func TestModCDPClientDispatchesRootEventsBeforeExtensionSessionIsAttached(t *testing.T) {
	cdp := New(Config{})
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
	cdp := New(Config{})
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

func TestModCDPClientValidatesNativeCommandParamsBeforeSending(t *testing.T) {
	cdp := New(Config{})

	if _, err := cdp.Send("Runtime.evaluate", map[string]any{}); err == nil || !strings.Contains(err.Error(), "expression") {
		t.Fatalf("Runtime.evaluate validation error = %v", err)
	}
}

func TestModCDPClientValidatesNativeAndRegisteredCustomEventsBeforeDispatch(t *testing.T) {
	cdp := New(Config{})

	expectPanic(t, func() {
		cdp.handleEventMessage(map[string]any{"method": "Target.targetCreated", "params": map[string]any{}})
	})

	if _, err := cdp.Mod.AddCustomEvent(CustomEvent{
		Name: "Custom.ready",
		EventSchema: map[string]any{
			"type":                 "object",
			"properties":           map[string]any{"ok": map[string]any{"type": "boolean"}},
			"required":             []any{"ok"},
			"additionalProperties": false,
		},
	}); err != nil {
		t.Fatal(err)
	}
	expectPanic(t, func() {
		cdp.handleEventMessage(map[string]any{"method": "Custom.ready", "params": map[string]any{"ok": "yes"}})
	})
}

func TestModCDPClientPreservesExplicitEmptyServiceWorkerSuffixConfig(t *testing.T) {
	cdp := New(Config{
		Injector: InjectorConfig{
			InjectorMode:                     "discover",
			InjectorServiceWorkerURLSuffixes: []string{},
		},
	})

	if len(cdp.Config.Injector.InjectorServiceWorkerURLSuffixes) != 0 {
		t.Fatalf("InjectorServiceWorkerURLSuffixes = %#v", cdp.Config.Injector.InjectorServiceWorkerURLSuffixes)
	}
	injectorConfig := cdp.baseInjectorConfig(nil)
	if len(injectorConfig.InjectorServiceWorkerURLSuffixes) != 0 {
		t.Fatalf("injector InjectorServiceWorkerURLSuffixes = %#v", injectorConfig.InjectorServiceWorkerURLSuffixes)
	}
}

func TestModCDPClientPreservesExplicitNullServerConfig(t *testing.T) {
	cdp := New(Config{ServerConfig: ServerConfigNone})

	if cdp.Config.ServerConfig != nil {
		t.Fatalf("ServerConfig = %#v", cdp.Config.ServerConfig)
	}
}

func TestModCDPClientDefaultsServiceWorkerSuffixConfigToTheModCDPWorker(t *testing.T) {
	cdp := New(Config{Injector: InjectorConfig{InjectorMode: "discover"}})

	if len(cdp.Config.Injector.InjectorServiceWorkerURLSuffixes) != 1 || cdp.Config.Injector.InjectorServiceWorkerURLSuffixes[0] != "/modcdp/service_worker.js" {
		t.Fatalf("InjectorServiceWorkerURLSuffixes = %#v", cdp.Config.Injector.InjectorServiceWorkerURLSuffixes)
	}
	injectorConfig := cdp.baseInjectorConfig(nil)
	if len(injectorConfig.InjectorServiceWorkerURLSuffixes) != 1 || injectorConfig.InjectorServiceWorkerURLSuffixes[0] != "/modcdp/service_worker.js" {
		t.Fatalf("injector InjectorServiceWorkerURLSuffixes = %#v", injectorConfig.InjectorServiceWorkerURLSuffixes)
	}
}

func TestModCDPClientSelectsExactlyOneInjectorFromExplicitInjectorMode(t *testing.T) {
	cdp := New(Config{
		Launcher: LauncherConfig{LauncherMode: "local"},
		Injector: InjectorConfig{InjectorMode: "cli"},
	})
	if _, ok := cdp.extensionInjectors[0].(*CLIExtensionInjector); !ok {
		t.Fatalf("Injector = %T", cdp.extensionInjectors[0])
	}
	if _, ok := New(Config{Launcher: LauncherConfig{LauncherMode: "remote"}, Injector: InjectorConfig{InjectorMode: "cdp"}}).extensionInjectors[0].(*CDPExtensionInjector); !ok {
		t.Fatalf("cdp injector type mismatch")
	}
	if _, ok := New(Config{Launcher: LauncherConfig{LauncherMode: "bb"}, Injector: InjectorConfig{InjectorMode: "bb"}}).extensionInjectors[0].(*BBExtensionInjector); !ok {
		t.Fatalf("bb injector type mismatch")
	}
	if _, ok := New(Config{Launcher: LauncherConfig{LauncherMode: "remote"}, Injector: InjectorConfig{InjectorMode: "discover"}}).extensionInjectors[0].(*DiscoverExtensionInjector); !ok {
		t.Fatalf("discover injector type mismatch")
	}
}

func TestModCDPClientUsesNoInjectorUnlessInjectorModeIsExplicit(t *testing.T) {
	launched := New(Config{
		Launcher: LauncherConfig{LauncherMode: "local"},
		Upstream: UpstreamTransportConfig{UpstreamMode: "ws"},
	})
	if launched.Config.Launcher.LauncherMode != "local" {
		t.Fatalf("launcher mode = %q", launched.Config.Launcher.LauncherMode)
	}
	if launched.Config.Injector.InjectorMode != "none" {
		t.Fatalf("injector mode = %q", launched.Config.Injector.InjectorMode)
	}

	attachOnly := New(Config{Upstream: UpstreamTransportConfig{UpstreamMode: "ws"}})
	if attachOnly.Config.Launcher.LauncherMode != "none" {
		t.Fatalf("launcher mode = %q", attachOnly.Config.Launcher.LauncherMode)
	}
	if attachOnly.Config.Injector.InjectorMode != "none" {
		t.Fatalf("injector mode = %q", attachOnly.Config.Injector.InjectorMode)
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
			cdp:  New(Config{Upstream: UpstreamTransportConfig{UpstreamMode: "bogus"}}),
			want: "unknown upstream_mode=bogus",
		},
		{
			name: "launch",
			cdp: New(Config{
				Launcher: LauncherConfig{LauncherMode: "bogus"},
				Upstream: UpstreamTransportConfig{UpstreamMode: "ws", UpstreamWSCDPURL: "ws://127.0.0.1:1/devtools/browser/test"},
			}),
			want: "unknown launcher_mode=bogus",
		},
		{
			name: "injector",
			cdp: New(Config{
				Launcher: LauncherConfig{LauncherMode: "none"},
				Upstream: UpstreamTransportConfig{UpstreamMode: "ws", UpstreamWSCDPURL: "ws://127.0.0.1:1/devtools/browser/test"},
				Injector: InjectorConfig{InjectorMode: "bogus"},
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

func TestModCDPClientConnectsWithNestedLaunchUpstreamExtensionClientServerConfig(t *testing.T) {
	headless := runtime.GOOS == "linux" && os.Getenv("DISPLAY") == ""
	extensionPath, err := filepath.Abs("../../../dist/extension")
	if err != nil {
		t.Fatal(err)
	}
	cdp := New(Config{
		Launcher: LauncherConfig{
			LauncherMode:                      "local",
			LauncherLocalHeadless:             boolPtr(headless),
			LauncherLocalChromeReadyTimeoutMS: 60_000,
			LauncherLocalExecutablePath:       reverseWSTestBrowserPath(t),
		},
		Upstream: UpstreamTransportConfig{UpstreamMode: "ws"},
		Injector: InjectorConfig{
			InjectorMode:                        "cli",
			InjectorCLIExtensionPath:            extensionPath,
			InjectorServiceWorkerURLSuffixes:    []string{"/modcdp/service_worker.js"},
			InjectorTrustServiceWorkerTarget:    true,
			InjectorServiceWorkerProbeTimeoutMS: 30_000,
		},
		Router: RouterConfig{RouterRoutes: map[string]string{"Mod.*": "service_worker", "Custom.*": "service_worker", "*.*": "direct_cdp"}},
		ClientConfig: ClientConfig{
			ClientHydrateAliases:       boolPtr(true),
			ClientMirrorUpstreamEvents: boolPtr(true),
			ClientCDPSendTimeoutMS:     30_000,
			ClientEventWaitTimeoutMS:   30_000,
		},
		ServerConfig: &ServerConfig{
			ClientConfig: ClientConfig{ClientCDPSendTimeoutMS: 30_000},
			Router: RouterConfig{
				RouterRoutes:                      map[string]string{"*.*": "loopback_cdp"},
				LoopbackExecutionContextTimeoutMS: 30_000,
			},
			Upstream: UpstreamTransportConfig{UpstreamWSConnectErrorSettleTimeoutMS: 250},
		},
	})
	defer cdp.Close()

	if err := cdp.Connect(); err != nil {
		t.Fatal(err)
	}
	switch cdp.ConnectTiming["injector_source"] {
	case "discover", "cli", "cdp":
	default:
		t.Fatalf("injector_source = %v", cdp.ConnectTiming["injector_source"])
	}
	if cdp.Injector.ExtensionID != DefaultModCDPExtensionID {
		t.Fatalf("Injector.ExtensionID = %q", cdp.Injector.ExtensionID)
	}
	if cdp.Config.Launcher.LauncherMode != "local" {
		t.Fatalf("launcher mode = %q", cdp.Config.Launcher.LauncherMode)
	}
	if cdp.Config.Upstream.UpstreamMode != "ws" {
		t.Fatalf("upstream mode = %q", cdp.Config.Upstream.UpstreamMode)
	}
	if cdp.Config.Injector.InjectorMode != "cli" {
		t.Fatalf("injector mode = %q", cdp.Config.Injector.InjectorMode)
	}
	if cdp.Config.Router.RouterRoutes["*.*"] != "direct_cdp" {
		t.Fatalf("router route *.* = %q", cdp.Config.Router.RouterRoutes["*.*"])
	}
	if !strings.HasPrefix(cdp.Config.Upstream.UpstreamWSCDPURL, "ws://") {
		t.Fatalf("upstream ws url = %q", cdp.Config.Upstream.UpstreamWSCDPURL)
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
	offscreenReady, err := cdp.Mod.Evaluate(map[string]any{
		"expression": "chrome.runtime.getContexts({}).then((contexts) => contexts.some((context) => context.contextType === 'OFFSCREEN_DOCUMENT'))",
	})
	if err != nil {
		t.Fatal(err)
	}
	if offscreenReady != true {
		t.Fatalf("expected offscreen keepalive context, got %#v", offscreenReady)
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

func TestModCDPClientCloseDoesNotCloseARemoteBrowserItDidNotLaunch(t *testing.T) {
	headless := true
	extensionPath, err := filepath.Abs("../../../dist/extension")
	if err != nil {
		t.Fatal(err)
	}
	chrome, err := NewLocalBrowserLauncher(LauncherConfig{
		LauncherLocalHeadless:             &headless,
		LauncherLocalChromeReadyTimeoutMS: 60_000,
		// This test manually supplies --load-extension, so it intentionally uses
		// the launch-flag browser path instead of relying on the client fallback.
		LauncherLocalExecutablePath: reverseWSTestBrowserPath(t),
		LauncherLocalExtraArgs:      []string{"--load-extension=" + extensionPath},
	}).Launch(LauncherConfig{})
	if err != nil {
		t.Fatal(err)
	}
	defer chrome.Close()

	cdp_transport := transportpkg.NewWSUpstreamTransport(transportpkg.UpstreamTransportConfig{UpstreamWSCDPURL: chrome.CDPURL})
	if err := cdp_transport.Connect(); err != nil {
		t.Fatal(err)
	}
	defer cdp_transport.Close()
	cdp := New(Config{
		Launcher: LauncherConfig{LauncherMode: "remote", LauncherRemoteCDPURL: chrome.CDPURL},
		Upstream: UpstreamTransportConfig{UpstreamMode: "ws", UpstreamWSCDPURL: chrome.CDPURL},
		Injector: InjectorConfig{
			InjectorMode:                        "cli",
			InjectorCLIExtensionPath:            extensionPath,
			InjectorServiceWorkerURLSuffixes:    []string{"/modcdp/service_worker.js"},
			InjectorTrustServiceWorkerTarget:    true,
			InjectorServiceWorkerReadyTimeoutMS: 30_000,
			InjectorServiceWorkerProbeTimeoutMS: 30_000,
		},
		Router: RouterConfig{RouterRoutes: map[string]string{"*.*": "direct_cdp"}},
	})
	if err := cdp.Connect(); err != nil {
		t.Fatal(err)
	}
	cdp.Close()
	time.Sleep(500 * time.Millisecond)

	response, err := cdp_transport.Send("Browser.getVersion", map[string]any{}, "", 10*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	product, _ := response["product"].(string)
	if !strings.Contains(product, "Chrome") && !strings.Contains(product, "Chromium") {
		t.Fatalf("unexpected product %q", product)
	}
}

func TestModCDPClientCloseKeepsInjectorFilesUntilAfterLaunchedBrowserShutdown(t *testing.T) {
	extensionPath, err := filepath.Abs(filepath.Join("..", "..", "..", "dist", "extension"))
	if err != nil {
		t.Fatal(err)
	}
	cdp := New(Config{
		Launcher: LauncherConfig{
			LauncherMode:          "local",
			LauncherLocalHeadless: boolPtr(true),
			// After explicit CHROME_PATH and CI /usr/bin/chromium, this test uses
			// Chrome for Testing because Canary rejects --load-extension in this
			// local launch injector path.
			LauncherLocalExecutablePath: reverseWSTestBrowserPath(t),
		},
		Upstream: UpstreamTransportConfig{
			UpstreamMode: "ws",
		},
		Injector: InjectorConfig{
			InjectorMode:                     "cli",
			InjectorCLIExtensionPath:         extensionPath,
			InjectorServiceWorkerURLSuffixes: []string{"/modcdp/service_worker.js"},
			InjectorTrustServiceWorkerTarget: true,
		},
		ServerConfig: &ServerConfig{Router: RouterConfig{RouterRoutes: map[string]string{"*.*": "loopback_cdp"}}},
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

	launcher, ok := cdp.Launcher.(*LocalBrowserLauncher)
	if !ok || launcher.Launched == nil {
		t.Fatalf("expected local launcher state, got %T", cdp.Launcher)
	}
	originalClose := launcher.Launched.Close
	browserCloseSawExtension := false
	launcher.Launched.Close = func() {
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
	if launcher.Launched != nil {
		t.Fatal("expected launcher launched state to be nil")
	}
	if cdp.extensionInjectors != nil {
		t.Fatal("expected extensionInjectors to be nil")
	}
}

func TestModCDPClientCloseClearsTopLevelConnectionState(t *testing.T) {
	extensionPath, err := filepath.Abs(filepath.Join("..", "..", "..", "dist", "extension"))
	if err != nil {
		t.Fatal(err)
	}
	cdp := New(Config{
		Launcher: LauncherConfig{
			LauncherMode:                "local",
			LauncherLocalHeadless:       boolPtr(true),
			LauncherLocalExecutablePath: reverseWSTestBrowserPath(t),
		},
		Upstream: UpstreamTransportConfig{UpstreamMode: "ws"},
		Injector: InjectorConfig{
			InjectorMode:                     "cli",
			InjectorCLIExtensionPath:         extensionPath,
			InjectorServiceWorkerURLSuffixes: []string{"/modcdp/service_worker.js"},
			InjectorTrustServiceWorkerTarget: true,
		},
	})
	if err := cdp.Connect(); err != nil {
		t.Fatal(err)
	}
	transport, ok := cdp.Upstream.(*WSUpstreamTransport)
	if !ok {
		t.Fatalf("transport = %T", cdp.Upstream)
	}
	if transport.Conn == nil {
		t.Fatal("expected transport-owned websocket conn")
	}
	cdp.Close()
	if transport.Conn != nil {
		t.Fatal("Close left websocket connection set")
	}
	if launcher, ok := cdp.Launcher.(*LocalBrowserLauncher); !ok || launcher.Launched != nil {
		t.Fatalf("Close left launcher launched state set: %T", cdp.Launcher)
	}
}

// MODCDP_TEST_SUPPORT: LANGUAGE-SPECIFIC TEST SUPPORT ONLY.
// Keep setup semantics 1:1 with TS; this only selects a real browser for real --load-extension runs.
func boolPtr(value bool) *bool {
	return &value
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
