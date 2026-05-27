// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.WSUpstreamTransport.ts
// - ./python/tests/test_WSUpstreamTransport.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package transport_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	modcdp "github.com/browserbase/modcdp/go/modcdp/client"
	"github.com/browserbase/modcdp/go/modcdp/launcher"
	. "github.com/browserbase/modcdp/go/modcdp/transport"
	"github.com/browserbase/modcdp/go/modcdp/types"
)

func TestWSUpstreamConstructorUpdateServerConfigAndUnconnectedErrorsMatchTheTransportSurface(t *testing.T) {
	transport := NewWSUpstreamTransport(UpstreamTransportConfig{})
	if transport.URL != "" {
		t.Fatalf("URL = %q", transport.URL)
	}
	transport.Update(map[string]any{"upstream_ws_cdp_url": "ws://127.0.0.1:1/devtools/browser/test"})
	if transport.URL != "ws://127.0.0.1:1/devtools/browser/test" {
		t.Fatalf("URL = %q", transport.URL)
	}
	if err := NewWSUpstreamTransport(UpstreamTransportConfig{}).Connect(); err == nil || !strings.Contains(err.Error(), "WSUpstreamTransport requires") {
		t.Fatalf("connect error = %v", err)
	}
	if _, err := NewWSUpstreamTransport(UpstreamTransportConfig{}).Send(types.CdpCommandMessage{ID: 1, Method: "Browser.getVersion"}, nil, ""); err == nil || !strings.Contains(err.Error(), "CDP websocket is not connected") {
		t.Fatalf("send error = %v", err)
	}
	state := transport.ToJSON()["state"].(map[string]any)
	if state["connected"] != false {
		t.Fatalf("connected state = %#v", state["connected"])
	}
}

func TestWSUpstreamLaunchesARealBrowserAndSpeaksRawCDP(t *testing.T) {
	headless := true
	chrome, err := modcdp.NewLocalBrowserLauncher(modcdp.LauncherConfig{
		LauncherLocalHeadless: &headless,
	}).Launch(modcdp.LauncherConfig{})
	if err != nil {
		t.Fatal(err)
	}
	defer chrome.Close()

	transport := NewWSUpstreamTransport(UpstreamTransportConfig{UpstreamWSCDPURL: chrome.CDPURL})
	received := make(chan map[string]any, 1)
	transport.OnRecv(func(message map[string]any) {
		if message["id"] == float64(1) || message["id"] == int64(1) || message["id"] == 1 {
			received <- message
		}
	})
	if err := transport.Connect(); err != nil {
		t.Fatal(err)
	}
	defer transport.Close()
	if !strings.HasPrefix(transport.URL, "ws://") {
		t.Fatalf("transport.URL = %q", transport.URL)
	}
	if _, err := transport.Send(types.CdpCommandMessage{ID: 1, Method: "Browser.getVersion", Params: map[string]any{}}, nil, ""); err != nil {
		t.Fatal(err)
	}
	select {
	case message := <-received:
		result, _ := message["result"].(map[string]any)
		if _, ok := result["product"].(string); !ok {
			t.Fatalf("Browser.getVersion result = %#v", result)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for Browser.getVersion response")
	}
}

func TestWSUpstreamResolvesABareHostPortCDPEndpointToTheBrowserWebsocket(t *testing.T) {
	headless := true
	port, err := launcher.NewLocalBrowserLauncher(launcher.LauncherConfig{}).FreePort()
	if err != nil {
		t.Fatal(err)
	}
	chrome, err := modcdp.NewLocalBrowserLauncher(modcdp.LauncherConfig{
		LauncherLocalCDPListenPort: port,
		LauncherLocalHeadless:      &headless,
	}).Launch(modcdp.LauncherConfig{})
	if err != nil {
		t.Fatal(err)
	}
	defer chrome.Close()

	transport := NewWSUpstreamTransport(UpstreamTransportConfig{UpstreamWSCDPURL: fmt.Sprintf("127.0.0.1:%d", port)})
	if err := transport.Connect(); err != nil {
		t.Fatal(err)
	}
	defer transport.Close()
	if transport.URL != chrome.CDPURL {
		t.Fatalf("transport.URL = %q", transport.URL)
	}
	if !strings.HasPrefix(transport.URL, "ws://") && !strings.HasPrefix(transport.URL, "wss://") {
		t.Fatalf("transport.URL = %q", transport.URL)
	}
	hostPortResult, err := transport.Send("Browser.getVersion", map[string]any{}, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := hostPortResult["product"].(string); !ok {
		t.Fatalf("Browser.getVersion host:port result = %#v", hostPortResult)
	}
}

func TestWSUpstreamCloseClearsConnectionState(t *testing.T) {
	headless := true
	chrome, err := modcdp.NewLocalBrowserLauncher(modcdp.LauncherConfig{
		LauncherLocalHeadless: &headless,
	}).Launch(modcdp.LauncherConfig{})
	if err != nil {
		t.Fatal(err)
	}
	defer chrome.Close()

	transport := NewWSUpstreamTransport(UpstreamTransportConfig{UpstreamWSCDPURL: chrome.CDPURL})
	if err := transport.Connect(); err != nil {
		t.Fatal(err)
	}
	if transport.Conn == nil {
		t.Fatal("expected connected websocket")
	}
	state := transport.ToJSON()["state"].(map[string]any)
	if state["connected"] != true {
		t.Fatalf("connected state = %#v", state["connected"])
	}
	if err := transport.Close(); err != nil {
		t.Fatal(err)
	}
	if transport.Conn != nil {
		t.Fatal("Close left Conn set")
	}
	state = transport.ToJSON()["state"].(map[string]any)
	if state["connected"] != false {
		t.Fatalf("connected state after close = %#v", state["connected"])
	}
	if _, err := transport.Send(types.CdpCommandMessage{ID: 1, Method: "Browser.getVersion"}, nil, ""); err == nil || !strings.Contains(err.Error(), "CDP websocket is not connected") {
		t.Fatalf("Send after close error = %v", err)
	}
}
