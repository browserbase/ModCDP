// Go demo for ModCDPClient. Mirrors js/examples/demo.js and python/examples/demo.py.
//
// Modes:
//   --live       Use the running Google Chrome enabled via chrome://inspect.
//   --direct     *.* -> direct_cdp on the client.
//   --loopback   *.* -> service_worker on client; *.* -> loopback_cdp on server. Default.
//   --debugger   *.* -> service_worker on client; *.* -> chrome_debugger on server.
//   --upstream   ws|pipe|reversews|nativemessaging|nats. Defaults to ws.
//                reversews and nativemessaging use the fixed extension defaults:
//                ws://127.0.0.1:29292 and com.modcdp.bridge.

package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"

	modcdp "github.com/browserbase/modcdp/go/modcdp"
	"golang.org/x/term"
)

const demoCDPSendTimeoutMS = 60_000
const demoExecutionContextTimeoutMS = 60_000
const reverseTransportWaitTimeoutMS = 60_000

func optionsFor(mode, upstreamMode, cdpURL, extensionPath string, launchOptions modcdp.LaunchOptions) modcdp.Options {
	upstream := modcdp.UpstreamConfig{UpstreamMode: upstreamMode, UpstreamCDPURL: cdpURL}
	if upstreamMode == "reversews" {
		upstream.UpstreamReverseWSWaitTimeoutMS = reverseTransportWaitTimeoutMS
	}
	if upstreamMode == "nativemessaging" {
		upstream.UpstreamNativeMessagingWaitTimeoutMS = reverseTransportWaitTimeoutMS
	}
	if upstreamMode == "nats" {
		upstream.UpstreamNATSWaitTimeoutMS = reverseTransportWaitTimeoutMS
	}
	if mode == "direct" {
		return modcdp.Options{
			Launcher: modcdp.LauncherConfig{LauncherMode: map[bool]string{true: "remote", false: "local"}[cdpURL != ""], LauncherOptions: launchOptions},
			Upstream: upstream,
			Injector: modcdp.InjectorConfig{
				InjectorMode:                      "auto",
				InjectorExtensionPath:             extensionPath,
				InjectorExecutionContextTimeoutMS: demoExecutionContextTimeoutMS,
			},
			Client: modcdp.ClientConfig{ClientRoutes: clientRoutesFor(mode), ClientCDPSendTimeoutMS: demoCDPSendTimeoutMS},
		}
	}
	server := &modcdp.ServerConfig{
		ServerRoutes:                            serverRoutesFor(mode, upstreamMode),
		ServerLoopbackExecutionContextTimeoutMS: demoExecutionContextTimeoutMS,
	}
	return modcdp.Options{
		Launcher: modcdp.LauncherConfig{LauncherMode: map[bool]string{true: "remote", false: "local"}[cdpURL != ""], LauncherOptions: launchOptions},
		Upstream: upstream,
		Injector: modcdp.InjectorConfig{
			InjectorMode:                      "auto",
			InjectorExtensionPath:             extensionPath,
			InjectorExecutionContextTimeoutMS: demoExecutionContextTimeoutMS,
		},
		Client: modcdp.ClientConfig{ClientRoutes: clientRoutesFor(mode), ClientCDPSendTimeoutMS: demoCDPSendTimeoutMS},
		Server: server,
	}
}

func clientRoutesFor(mode string) map[string]string {
	route := "service_worker"
	if mode == "direct" {
		route = "direct_cdp"
	}
	routes := map[string]string{
		"Mod.*":     "service_worker",
		"Custom.*":  "service_worker",
		"Runtime.*": "service_worker",
		"*.*":       route,
	}
	return routes
}

func serverRoutesFor(mode, upstreamMode string) map[string]string {
	_ = upstreamMode
	serverRoute := "auto"
	if mode == "loopback" {
		serverRoute = "loopback_cdp"
	} else if mode == "debugger" {
		serverRoute = "chrome_debugger"
	}
	routes := map[string]string{
		"Mod.*":    "service_worker",
		"Custom.*": "service_worker",
		"*.*":      serverRoute,
	}
	return routes
}

func mustMap(value any, label string) map[string]any {
	result, ok := value.(map[string]any)
	if !ok {
		log.Fatalf("%s returned non-object value: %v", label, value)
	}
	return result
}

func mustString(value any, label string) string {
	result, ok := value.(string)
	if !ok || result == "" {
		log.Fatalf("%s returned non-string value: %v", label, value)
	}
	return result
}

func int64Value(value any) (int64, bool) {
	switch typed := value.(type) {
	case int64:
		return typed, true
	case int:
		return int64(typed), true
	case float64:
		return int64(typed), true
	default:
		return 0, false
	}
}

func waitForEvent(ch <-chan map[string]any, label string, predicate func(map[string]any) bool) map[string]any {
	timeout := time.After(3 * time.Second)
	for {
		select {
		case event := <-ch:
			if predicate(event) {
				return event
			}
		case <-timeout:
			log.Fatalf("timed out waiting for %s", label)
		}
	}
}

func parseArgs(argv []string) (string, string, bool, error) {
	flags := map[string]bool{}
	upstreamMode := "ws"
	for index, a := range argv {
		if strings.HasPrefix(a, "--") {
			flags[strings.TrimPrefix(a, "--")] = true
		}
		if a == "--upstream" && index+1 < len(argv) {
			upstreamMode = argv[index+1]
		} else if strings.HasPrefix(a, "--upstream=") {
			upstreamMode = strings.TrimPrefix(a, "--upstream=")
		}
	}
	for _, mode := range []string{"ws", "pipe", "reversews", "nativemessaging", "nats"} {
		if flags[mode] {
			upstreamMode = mode
		}
	}
	switch upstreamMode {
	case "ws", "pipe", "reversews", "nativemessaging", "nats":
	default:
		return "", "", false, fmt.Errorf("unknown --upstream=%s; expected ws|pipe|reversews|nativemessaging|nats", upstreamMode)
	}
	live := flags["live"]
	mode := "loopback"
	if flags["debugger"] {
		mode = "debugger"
	} else if flags["direct"] {
		mode = "direct"
	} else if flags["loopback"] {
		mode = "loopback"
	} else if live {
		mode = "direct"
	}
	if live && upstreamMode == "pipe" {
		return "", "", false, fmt.Errorf("--live cannot be combined with --upstream=pipe because pipe handles only exist for launched browsers")
	}
	if mode == "direct" && (upstreamMode == "reversews" || upstreamMode == "nativemessaging" || upstreamMode == "nats") {
		return "", "", false, fmt.Errorf("--direct cannot be combined with --upstream=%s; reverse transports terminate at ModCDPServer", upstreamMode)
	}
	return mode, upstreamMode, live, nil
}

func main() {
	mode, upstreamMode, live, err := parseArgs(os.Args[1:])
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("== mode: %s%s; upstream: %s ==\n", map[bool]string{true: "live/", false: ""}[live], mode, upstreamMode)

	chromePath := os.Getenv("CHROME_PATH")
	// Resolve repo root from this source file so the demo runs correctly from
	// any CWD (`go run ./go`, `go run .` from inside go, etc.).
	_, thisFile, _, _ := runtime.Caller(0)
	root, _ := filepath.Abs(filepath.Join(filepath.Dir(thisFile), "..", "..", ".."))
	extensionPath := filepath.Join(root, "dist", "extension")
	var cdpURL string
	launchOptions := modcdp.LaunchOptions{}
	if live {
		var err error
		cdpURL, err = waitForLiveCDPURL()
		if err != nil {
			log.Fatal(err)
		}
	} else {
		headless := false
		sandbox := runtime.GOOS != "linux"
		if runtime.GOOS == "linux" && os.Getenv("DISPLAY") == "" {
			headless = true
		}
		launchOptions = modcdp.LaunchOptions{
			ExecutablePath:       chromePath,
			ChromeReadyTimeoutMS: 60_000,
			Headless:             &headless,
			Sandbox:              &sandbox,
		}
	}

	cdp := modcdp.New(optionsFor(mode, upstreamMode, cdpURL, extensionPath, launchOptions))

	if err := cdp.Connect(); err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer cdp.Close()
	fmt.Println("upstream cdp:", cdp.CDPURL)
	fmt.Printf("connected; ext %s session %s\n", cdp.ExtensionID, cdp.ExtSessionID)
	if b, err := json.Marshal(cdp.ConnectTiming); err == nil {
		fmt.Println("connect timing    ->", string(b))
	}

	serverConfig := map[string]any{
		"server_routes": serverRoutesFor(mode, upstreamMode),
		"server_loopback_execution_context_timeout_ms": demoExecutionContextTimeoutMS,
	}
	configureParams := map[string]any{
		"upstream": map[string]any{"upstream_mode": upstreamMode},
		"client":   map[string]any{"client_routes": clientRoutesFor(mode)},
		"server":   serverConfig,
	}
	configureRaw, err := cdp.Mod.Configure(configureParams)
	if err != nil {
		log.Fatalf("Mod.configure: %v", err)
	}
	configure := mustMap(configureRaw, "Mod.configure")
	configureRoutes := mustMap(configure["routes"], "Mod.configure.routes")
	if configureRoutes["*.*"] != serverRoutesFor(mode, upstreamMode)["*.*"] {
		log.Fatalf("unexpected Mod.configure result: %v", configure)
	}
	fmt.Println("Mod.configure    ->", configureRoutes)

	pongCh := make(chan map[string]any, 16)
	cdp.On("Mod.pong", func(data any) {
		if event, ok := data.(map[string]any); ok {
			pongCh <- event
		}
	})
	ping_sent_at := time.Now().UnixMilli()
	pingRaw, err := cdp.Mod.Ping(map[string]any{"sent_at": ping_sent_at})
	if err != nil {
		log.Fatalf("Mod.ping: %v", err)
	}
	ping := mustMap(pingRaw, "Mod.ping")
	pong := waitForEvent(pongCh, "Mod.pong", func(event map[string]any) bool {
		return event["sent_at"] == float64(ping_sent_at) || event["sent_at"] == ping_sent_at
	})
	if ping["ok"] != true || pong["received_at"] == nil || pong["from"] != "extension-service-worker" {
		log.Fatalf("unexpected Mod.ping/Mod.pong result: ping=%v pong=%v", ping, pong)
	}
	pingReturnedAt := time.Now().UnixMilli()
	fmt.Println("Mod.ping/pong    ->", ping, pong)
	pingLatency := map[string]any{
		"round_trip_ms": pingReturnedAt - ping_sent_at,
	}
	if pongReceivedAt, ok := int64Value(pong["received_at"]); ok {
		pingLatency["service_worker_ms"] = pongReceivedAt - ping_sent_at
		pingLatency["return_path_ms"] = pingReturnedAt - pongReceivedAt
	}
	if b, err := json.Marshal(pingLatency); err == nil {
		fmt.Println("ping latency      ->", string(b))
	}

	if r, err := cdp.Mod.Evaluate(map[string]any{
		"expression": "({ extension_id: chrome.runtime.id })",
	}); err != nil {
		log.Fatalf("Mod.evaluate: %v", err)
	} else {
		modcdpEval, _ := r.(map[string]any)
		extensionID, _ := modcdpEval["extension_id"].(string)
		if extensionID == "" || (cdp.ExtensionID != "" && extensionID != cdp.ExtensionID) {
			log.Fatalf("unexpected Mod.evaluate result: %v", modcdpEval)
		}
		b, _ := json.Marshal(r)
		fmt.Println("Mod.evaluate     ->", string(b))
	}

	topologyChecked := false
	if mode != "direct" {
		topologyRaw, err := cdp.Mod.GetTopology(nil)
		if err != nil {
			log.Fatalf("Mod.getTopology: %v", err)
		}
		topology := mustMap(topologyRaw, "Mod.getTopology")
		rootFrameID := mustString(topology["rootFrameId"], "Mod.getTopology.rootFrameId")
		frames := mustMap(topology["frames"], "Mod.getTopology.frames")
		roots := mustMap(topology["roots"], "Mod.getTopology.roots")
		contexts := mustMap(topology["contexts"], "Mod.getTopology.contexts")
		if _, ok := frames[rootFrameID]; !ok {
			log.Fatalf("Mod.getTopology frames missing root frame %s: %v", rootFrameID, frames)
		}
		hasDocumentRoot := false
		for _, root := range roots {
			rootMap, ok := root.(map[string]any)
			if ok && rootMap["kind"] == "document" {
				hasDocumentRoot = true
			}
		}
		hasPiercerContext := false
		for _, context := range contexts {
			contextMap, ok := context.(map[string]any)
			if ok && contextMap["world"] == "piercer" {
				hasPiercerContext = true
			}
		}
		if !hasDocumentRoot || !hasPiercerContext {
			log.Fatalf("unexpected Mod.getTopology result: %v", topology)
		}
		topologyChecked = true
		b, _ := json.Marshal(map[string]any{
			"rootFrameId": rootFrameID,
			"frames":      len(frames),
			"roots":       len(roots),
			"contexts":    len(contexts),
		})
		fmt.Println("Mod.getTopology ->", string(b))
	}

	responseMiddlewareRegistrationRaw, err := cdp.Mod.AddMiddleware(modcdp.CustomMiddleware{
		Name:       "Custom.echo",
		Phase:      "response",
		Expression: `async (payload, next) => next({ ...payload, responseMiddleware: "ok" })`,
	})
	if err != nil {
		log.Fatalf("Mod.addMiddleware response: %v", err)
	}
	responseMiddlewareRegistration := mustMap(responseMiddlewareRegistrationRaw, "Mod.addMiddleware response")
	if responseMiddlewareRegistration["registered"] != true || responseMiddlewareRegistration["phase"] != "response" {
		log.Fatalf("unexpected response middleware registration: %v", responseMiddlewareRegistration)
	}

	eventMiddlewareRegistrationRaw, err := cdp.Mod.AddMiddleware(modcdp.CustomMiddleware{
		Name:       "Custom.demoEvent",
		Phase:      "event",
		Expression: `async (payload, next) => next({ ...payload, eventMiddleware: "ok" })`,
	})
	if err != nil {
		log.Fatalf("Mod.addMiddleware event: %v", err)
	}
	eventMiddlewareRegistration := mustMap(eventMiddlewareRegistrationRaw, "Mod.addMiddleware event")
	if eventMiddlewareRegistration["registered"] != true || eventMiddlewareRegistration["phase"] != "event" {
		log.Fatalf("unexpected event middleware registration: %v", eventMiddlewareRegistration)
	}

	echoRegistrationRaw, err := cdp.Mod.AddCustomCommand(modcdp.CustomCommand{
		Name:       "Custom.echo",
		Expression: `async (params, method) => ({ echoed: params.value, method })`,
	})
	if err != nil {
		log.Fatalf("Mod.addCustomCommand Custom.echo: %v", err)
	}
	echoRegistration := mustMap(echoRegistrationRaw, "Mod.addCustomCommand Custom.echo")
	if echoRegistration["registered"] != true || echoRegistration["name"] != "Custom.echo" {
		log.Fatalf("unexpected Custom.echo registration: %v", echoRegistration)
	}
	echoResult := mustMap(mustSend(cdp, "Custom.echo", map[string]any{"value": "custom-command-ok"}), "Custom.echo")
	if echoResult["echoed"] != "custom-command-ok" || echoResult["method"] != "Custom.echo" || echoResult["responseMiddleware"] != "ok" {
		log.Fatalf("unexpected Custom.echo result: %v", echoResult)
	}
	echoJSON, _ := json.Marshal(echoResult)
	fmt.Println("Custom.echo      ->", string(echoJSON))

	demoEventCh := make(chan map[string]any, 16)
	cdp.On("Custom.demoEvent", func(data any) {
		if event, ok := data.(map[string]any); ok {
			demoEventCh <- event
		}
	})
	demoEventRegistrationRaw, err := cdp.Mod.AddCustomEvent(modcdp.CustomEvent{Name: "Custom.demoEvent"})
	if err != nil {
		log.Fatalf("Mod.addCustomEvent Custom.demoEvent: %v", err)
	}
	demoEventRegistration := mustMap(demoEventRegistrationRaw, "Mod.addCustomEvent Custom.demoEvent")
	if demoEventRegistration["registered"] != true || demoEventRegistration["name"] != "Custom.demoEvent" {
		log.Fatalf("unexpected Custom.demoEvent registration: %v", demoEventRegistration)
	}
	emitRaw, err := cdp.Mod.Evaluate(map[string]any{
		"expression": `async () => await ModCDP.emit("Custom.demoEvent", { value: "custom-event-ok" })`,
	})
	if err != nil {
		log.Fatalf("Custom.demoEvent emit: %v", err)
	}
	emitResult := mustMap(emitRaw, "Custom.demoEvent emit")
	if emitResult["emitted"] != true {
		log.Fatalf("unexpected Custom.demoEvent emit result: %v", emitResult)
	}
	demoEvent := waitForEvent(demoEventCh, "Custom.demoEvent", func(event map[string]any) bool {
		return event["value"] == "custom-event-ok" && event["eventMiddleware"] == "ok"
	})
	fmt.Println("Custom.demoEvent ->", demoEvent)

	runtimeEval := mustMap(mustSend(cdp, "Runtime.evaluate", map[string]any{
		"expression":    "(() => 42)()",
		"returnByValue": true,
	}), "Runtime.evaluate")
	runtimeResult := mustMap(runtimeEval["result"], "Runtime.evaluate.result")
	if runtimeResult["value"] != float64(42) && runtimeResult["value"] != 42 {
		log.Fatalf("unexpected Runtime.evaluate result: %v", runtimeEval)
	}
	runtimeJSON, _ := json.Marshal(runtimeEval)
	fmt.Println("Runtime.evaluate ->", string(runtimeJSON))

	topologyLabel := ""
	if topologyChecked {
		topologyLabel = "topology, "
	}
	fmt.Printf("\nSUCCESS (%s/%s): native command, %scustom commands, custom event, and middleware all passed\n", mode, upstreamMode, topologyLabel)

	// TTY-only REPL. Lets you poke at the live browser interactively;
	// subscribed events print as they arrive. Skip when stdin is not a tty
	// (CI / piped input / /dev/null) so the demo exits cleanly after
	// assertions.
	if term.IsTerminal(int(os.Stdin.Fd())) {
		cdp.On("Mod.pong", func(p any) {
			b, _ := json.Marshal(p)
			fmt.Printf("\n[event] Mod.pong %s\n", string(b))
		})
		runRepl(cdp, mode)
	}
}

func mustSend(cdp *modcdp.ModCDPClient, method string, params map[string]any) any {
	result, err := cdp.Send(method, params)
	if err != nil {
		log.Fatalf("%s: %v", method, err)
	}
	return result
}

func waitForLiveCDPURL() (string, error) {
	startedAt := time.Now()
	if runtime.GOOS == "darwin" {
		_ = exec.Command("open", "chrome://inspect/#remote-debugging").Start()
	} else {
		_ = exec.Command("xdg-open", "chrome://inspect/#remote-debugging").Start()
	}
	fmt.Println("opened chrome://inspect/#remote-debugging")
	fmt.Println("waiting for Chrome to expose DevToolsActivePort; click Allow when Chrome asks.")

	var candidates []string
	home, _ := os.UserHomeDir()
	if runtime.GOOS == "darwin" {
		candidates = []string{
			filepath.Join(home, "Library", "Application Support", "Google", "Chrome", "DevToolsActivePort"),
			filepath.Join(home, "Library", "Application Support", "Google", "Chrome Beta", "DevToolsActivePort"),
		}
	} else {
		candidates = []string{
			filepath.Join(home, ".config", "google-chrome", "DevToolsActivePort"),
			filepath.Join(home, ".config", "chromium", "DevToolsActivePort"),
		}
	}

	for {
		for _, candidate := range candidates {
			info, err := os.Stat(candidate)
			if err != nil || info.ModTime().Before(startedAt.Add(-time.Second)) {
				continue
			}
			body, err := os.ReadFile(candidate)
			if err != nil {
				continue
			}
			lines := strings.Fields(string(body))
			if len(lines) >= 2 {
				return "ws://127.0.0.1:" + lines[0] + lines[1], nil
			}
		}
		time.Sleep(250 * time.Millisecond)
	}
}

func runRepl(cdp *modcdp.ModCDPClient, mode string) {
	fmt.Printf("\nBrowser remains running. Mode: %s.\n", mode)
	fmt.Println("Enter commands as Domain.method({...JSON params...}). Examples:")
	fmt.Println(`  Browser.getVersion({})`)
	fmt.Println(`  Mod.evaluate({"expression": "chrome.tabs.query({active: true})"})`)
	fmt.Println(`  Runtime.evaluate({"expression": "document.title", "returnByValue": true})`)
	fmt.Println("Type exit or quit to disconnect (browser keeps running).")
	cmdRE := regexp.MustCompile(`^([A-Za-z_]\w*\.[A-Za-z_]\w*)(?:\((.*)\))?$`)
	sc := bufio.NewScanner(os.Stdin)
	fmt.Print("ModCDP> ")
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			fmt.Print("ModCDP> ")
			continue
		}
		if line == "exit" || line == "quit" {
			break
		}
		m := cmdRE.FindStringSubmatch(line)
		if m == nil {
			fmt.Println("error: format: Domain.method({...JSON...})")
			fmt.Print("ModCDP> ")
			continue
		}
		method := m[1]
		raw := strings.TrimSpace(m[2])
		params := map[string]any{}
		if raw != "" {
			if err := json.Unmarshal([]byte(raw), &params); err != nil {
				fmt.Printf("error: parse params: %v\n", err)
				fmt.Print("ModCDP> ")
				continue
			}
		}
		result, err := cdp.Send(method, params)
		if err != nil {
			fmt.Printf("error: %v\n", err)
			fmt.Print("ModCDP> ")
			continue
		}
		b, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(b))
		fmt.Print("ModCDP> ")
	}
}
