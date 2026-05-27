// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.WSUpstreamTransport.ts
// - ./python/tests/test_WSUpstreamTransport.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package transport_test

import (
	"net/url"
	"strings"
	"testing"

	modcdp "github.com/browserbase/modcdp/go/modcdp/client"
	. "github.com/browserbase/modcdp/go/modcdp/transport"
)

func TestWSUpstreamTransportConstructorUpdateAndServerConfigMatchTSShape(t *testing.T) {
	transport := NewWSUpstreamTransport(UpstreamTransportOptions{})
	if transport.URL != "" {
		t.Fatalf("URL = %q", transport.URL)
	}
	transport.Update(map[string]any{"upstream_ws_cdp_url": "ws://127.0.0.1:1/devtools/browser/test"})
	if transport.URL != "ws://127.0.0.1:1/devtools/browser/test" {
		t.Fatalf("URL = %q", transport.URL)
	}
	if err := NewWSUpstreamTransport(UpstreamTransportOptions{}).Connect(); err == nil || !strings.Contains(err.Error(), "WSUpstreamTransport requires") {
		t.Fatalf("connect error = %v", err)
	}
	if err := NewWSUpstreamTransport(UpstreamTransportOptions{}).Send(map[string]any{"id": 1, "method": "Browser.getVersion"}); err == nil || !strings.Contains(err.Error(), "CDP websocket is not connected") {
		t.Fatalf("send error = %v", err)
	}
}

func TestWSUpstreamTransportLaunchesRealBrowserAndSpeaksRawCDP(t *testing.T) {
	chrome, err := modcdp.NewLocalBrowserLauncher(modcdp.LaunchOptions{
		LauncherLocalHeadless: boolPtr(true),
	}).Launch(modcdp.LaunchOptions{})
	if err != nil {
		t.Fatal(err)
	}
	defer chrome.Close()

	transport := NewWSUpstreamTransport(UpstreamTransportOptions{UpstreamWSCDPURL: chrome.CDPURL})
	if err := transport.Connect(); err != nil {
		t.Fatal(err)
	}
	defer transport.Close()
	if !strings.HasPrefix(transport.URL, "ws://") {
		t.Fatalf("transport.URL = %q", transport.URL)
	}

	received := make(chan map[string]any, 1)
	transport.OnRecv(func(message map[string]any) { received <- message })
	if err := transport.Send(map[string]any{"id": 1, "method": "Browser.getVersion", "params": map[string]any{}}); err != nil {
		t.Fatal(err)
	}
	message := <-received
	result, _ := message["result"].(map[string]any)
	if _, ok := result["product"].(string); !ok {
		t.Fatalf("Browser.getVersion response = %#v", message)
	}
}

func TestWSUpstreamTransportResolvesRealHTTPCDPEndpointToBrowserWebSocket(t *testing.T) {
	chrome, err := modcdp.NewLocalBrowserLauncher(modcdp.LaunchOptions{
		LauncherLocalHeadless: boolPtr(true),
	}).Launch(modcdp.LaunchOptions{})
	if err != nil {
		t.Fatal(err)
	}
	defer chrome.Close()

	transport := NewWSUpstreamTransport(UpstreamTransportOptions{UpstreamWSCDPURL: chrome.CDPURL})
	if err := transport.Connect(); err != nil {
		t.Fatal(err)
	}
	defer transport.Close()
	if !strings.HasPrefix(transport.URL, "ws://") {
		t.Fatalf("transport.URL = %q", transport.URL)
	}
	received := make(chan map[string]any, 1)
	transport.OnRecv(func(message map[string]any) { received <- message })
	if err := transport.Send(map[string]any{"id": 1, "method": "Browser.getVersion", "params": map[string]any{}}); err != nil {
		t.Fatal(err)
	}
	message := <-received
	if message["id"] != float64(1) && message["id"] != 1 {
		t.Fatalf("Browser.getVersion id = %#v", message["id"])
	}
	result, _ := message["result"].(map[string]any)
	if _, ok := result["product"].(string); !ok {
		t.Fatalf("Browser.getVersion response = %#v", message)
	}

	parsedCDPURL, err := url.Parse(chrome.CDPURL)
	if err != nil {
		t.Fatal(err)
	}
	hostPortTransport := NewWSUpstreamTransport(UpstreamTransportOptions{UpstreamWSCDPURL: parsedCDPURL.Host})
	if err := hostPortTransport.Connect(); err != nil {
		t.Fatal(err)
	}
	defer hostPortTransport.Close()
	if !strings.HasPrefix(hostPortTransport.URL, "ws://") && !strings.HasPrefix(hostPortTransport.URL, "wss://") {
		t.Fatalf("hostPortTransport.URL = %q", hostPortTransport.URL)
	}
}

func TestWSUpstreamTransportCloseClearsConnectionState(t *testing.T) {
	chrome, err := modcdp.NewLocalBrowserLauncher(modcdp.LaunchOptions{
		LauncherLocalHeadless: boolPtr(true),
	}).Launch(modcdp.LaunchOptions{})
	if err != nil {
		t.Fatal(err)
	}
	defer chrome.Close()

	transport := NewWSUpstreamTransport(UpstreamTransportOptions{UpstreamWSCDPURL: chrome.CDPURL})
	if err := transport.Connect(); err != nil {
		t.Fatal(err)
	}
	if transport.Conn == nil {
		t.Fatal("expected connected websocket")
	}
	if err := transport.Close(); err != nil {
		t.Fatal(err)
	}
	if transport.Conn != nil {
		t.Fatal("Close left Conn set")
	}
	if err := transport.Send(map[string]any{"id": 1, "method": "Browser.getVersion"}); err == nil || !strings.Contains(err.Error(), "CDP websocket is not connected") {
		t.Fatalf("Send after close error = %v", err)
	}
}
