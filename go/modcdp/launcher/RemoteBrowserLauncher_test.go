// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.RemoteBrowserLauncher.ts
// - ./python/tests/test_RemoteBrowserLauncher.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package launcher_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/browserbase/modcdp/go/modcdp/launcher"
	"github.com/browserbase/modcdp/go/modcdp/transport"
)

func TestRequiresLauncherRemoteCDPURL(t *testing.T) {
	_, err := launcher.NewRemoteBrowserLauncher(launcher.LauncherConfig{}).Launch(launcher.LauncherConfig{})
	if err == nil || err.Error() != "launcher_mode=remote requires launcher_remote_cdp_url." {
		t.Fatalf("Launch error = %v", err)
	}
}

func TestConnectsToARealBrowserFromBothHTTPDiscoveryAndWebSocketCDPEndpoints(t *testing.T) {
	headless := true
	port, err := launcher.NewLocalBrowserLauncher(launcher.LauncherConfig{}).FreePort()
	if err != nil {
		t.Fatal(err)
	}
	local, err := launcher.NewLocalBrowserLauncher(launcher.LauncherConfig{}).Launch(launcher.LauncherConfig{
		LauncherLocalHeadless:      &headless,
		LauncherLocalCDPListenPort: port,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer local.Close()

	httpLauncher := launcher.NewRemoteBrowserLauncher(launcher.LauncherConfig{LauncherRemoteCDPURL: fmt.Sprintf("http://127.0.0.1:%d", port)})
	fromHTTP, err := httpLauncher.Launch(launcher.LauncherConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if httpLauncher.Launched != fromHTTP {
		t.Fatal("expected launcher to retain launched browser")
	}
	httpTransportConfig := httpLauncher.ConfigForUpstream()
	if httpTransportConfig["upstream_ws_cdp_url"] != local.CDPURL {
		t.Fatalf("http transport cdp_url = %v, want %s", httpTransportConfig["upstream_ws_cdp_url"], local.CDPURL)
	}
	if fromHTTP.CDPURL != local.CDPURL {
		t.Fatalf("fromHTTP.CDPURL = %q, want %q", fromHTTP.CDPURL, local.CDPURL)
	}
	cdp_transport := connectLauncherCDP(t, fromHTTP.CDPURL)
	defer cdp_transport.Close()
	expectCDPBrowserSurface(t, cdp_transport)
	fromHTTP.Close()

	hostPortLauncher := launcher.NewRemoteBrowserLauncher(launcher.LauncherConfig{LauncherRemoteCDPURL: fmt.Sprintf("127.0.0.1:%d", port)})
	fromHostPort, err := hostPortLauncher.Launch(launcher.LauncherConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if fromHostPort.CDPURL != local.CDPURL {
		t.Fatalf("fromHostPort.CDPURL = %q, want %q", fromHostPort.CDPURL, local.CDPURL)
	}
	fromHostPort.Close()

	configLauncher := launcher.NewRemoteBrowserLauncher(launcher.LauncherConfig{LauncherRemoteCDPURL: local.CDPURL})
	fromConfig, err := configLauncher.Launch(launcher.LauncherConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if fromConfig.CDPURL != local.CDPURL {
		t.Fatalf("fromConfig.CDPURL = %q, want %q", fromConfig.CDPURL, local.CDPURL)
	}
	fromConfig.Close()

	wsLauncher := launcher.NewRemoteBrowserLauncher(launcher.LauncherConfig{})
	fromWS, err := wsLauncher.Launch(launcher.LauncherConfig{LauncherRemoteCDPURL: local.CDPURL})
	if err != nil {
		t.Fatal(err)
	}
	if wsLauncher.Launched != fromWS {
		t.Fatal("expected ws launcher to retain launched browser")
	}
	wsTransportConfig := wsLauncher.ConfigForUpstream()
	if wsTransportConfig["upstream_ws_cdp_url"] != local.CDPURL {
		t.Fatalf("ws transport cdp_url = %v, want %s", wsTransportConfig["upstream_ws_cdp_url"], local.CDPURL)
	}
	if fromWS.CDPURL != local.CDPURL {
		t.Fatalf("fromWS.CDPURL = %q", fromWS.CDPURL)
	}
	expectCDPBrowserSurface(t, cdp_transport)
	fromWS.Close()
}

func TestLetsLaunchConfigOverrideConstructorCDPURL(t *testing.T) {
	headless := true
	firstPort, err := launcher.NewLocalBrowserLauncher(launcher.LauncherConfig{}).FreePort()
	if err != nil {
		t.Fatal(err)
	}
	secondPort, err := launcher.NewLocalBrowserLauncher(launcher.LauncherConfig{}).FreePort()
	if err != nil {
		t.Fatal(err)
	}
	first, err := launcher.NewLocalBrowserLauncher(launcher.LauncherConfig{}).Launch(launcher.LauncherConfig{
		LauncherLocalHeadless:      &headless,
		LauncherLocalCDPListenPort: firstPort,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := launcher.NewLocalBrowserLauncher(launcher.LauncherConfig{}).Launch(launcher.LauncherConfig{
		LauncherLocalHeadless:      &headless,
		LauncherLocalCDPListenPort: secondPort,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()

	launched, err := launcher.NewRemoteBrowserLauncher(launcher.LauncherConfig{LauncherRemoteCDPURL: first.CDPURL}).Launch(launcher.LauncherConfig{
		LauncherRemoteCDPURL: fmt.Sprintf("127.0.0.1:%d", second.CDPListenPort),
	})
	if err != nil {
		t.Fatal(err)
	}
	defer launched.Close()
	if launched.CDPURL != second.CDPURL {
		t.Fatalf("launched.CDPURL = %q, want %q", launched.CDPURL, second.CDPURL)
	}
}

// MODCDP_TEST_SUPPORT: LANGUAGE-SPECIFIC TEST SUPPORT ONLY.
// Keep the setup semantics above 1:1 with translated tests; helpers here only call real transport classes and real CDP endpoints.
func connectLauncherCDP(t *testing.T, rawURL string) *transport.WSUpstreamTransport {
	t.Helper()
	cdp_transport := transport.NewWSUpstreamTransport(transport.UpstreamTransportConfig{UpstreamWSCDPURL: rawURL})
	if err := cdp_transport.Connect(); err != nil {
		t.Fatal(err)
	}
	return cdp_transport
}

func expectCDPBrowserSurface(t *testing.T, cdp_transport *transport.WSUpstreamTransport) {
	t.Helper()
	result, err := cdp_transport.Send("Browser.getVersion", map[string]any{}, "", 10*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	product, _ := result["product"].(string)
	if !strings.Contains(product, "Chrome") && !strings.Contains(product, "Chromium") {
		t.Fatalf("Browser.getVersion result = %#v", result)
	}
}
