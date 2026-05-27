// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.RemoteBrowserLauncher.ts
// - ./python/tests/test_RemoteBrowserLauncher.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package launcher

import (
	"fmt"
	"testing"
)

func TestRemoteBrowserLauncherRequiresLauncherRemoteCDPURL(t *testing.T) {
	_, err := NewRemoteBrowserLauncher(LauncherConfig{}).Launch(LauncherConfig{})
	if err == nil || err.Error() != "launcher.launcher_mode=remote requires launcher_remote_cdp_url" {
		t.Fatalf("Launch error = %v", err)
	}
}

func TestRemoteBrowserLauncherConnectsToRealBrowserFromHTTPAndWebSocketCDPEndpoints(t *testing.T) {
	port, err := freePort()
	if err != nil {
		t.Fatal(err)
	}
	local, err := NewLocalBrowserLauncher(LauncherConfig{}).Launch(LauncherConfig{
		LauncherLocalHeadless:      boolPtr(true),
		LauncherLocalCDPListenPort: port,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer local.Close()

	httpLauncher := NewRemoteBrowserLauncher(LauncherConfig{LauncherRemoteCDPURL: fmt.Sprintf("http://127.0.0.1:%d", port)})
	fromHTTP, err := httpLauncher.Launch(LauncherConfig{})
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
	conn := connectBrowserbaseCDP(t, fromHTTP.CDPURL)
	defer conn.Close()
	expectCDPBrowserSurface(t, conn)
	fromHTTP.Close()

	hostPortLauncher := NewRemoteBrowserLauncher(LauncherConfig{LauncherRemoteCDPURL: fmt.Sprintf("127.0.0.1:%d", port)})
	fromHostPort, err := hostPortLauncher.Launch(LauncherConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if fromHostPort.CDPURL != local.CDPURL {
		t.Fatalf("fromHostPort.CDPURL = %q, want %q", fromHostPort.CDPURL, local.CDPURL)
	}
	fromHostPort.Close()

	optionsLauncher := NewRemoteBrowserLauncher(LauncherConfig{LauncherRemoteCDPURL: local.CDPURL})
	fromOptions, err := optionsLauncher.Launch(LauncherConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if fromOptions.CDPURL != local.CDPURL {
		t.Fatalf("fromOptions.CDPURL = %q, want %q", fromOptions.CDPURL, local.CDPURL)
	}
	fromOptions.Close()

	wsLauncher := NewRemoteBrowserLauncher(LauncherConfig{})
	fromWS, err := wsLauncher.Launch(LauncherConfig{LauncherRemoteCDPURL: local.CDPURL})
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
	expectCDPBrowserSurface(t, conn)
	fromWS.Close()

	overrideLauncher := NewRemoteBrowserLauncher(LauncherConfig{LauncherRemoteCDPURL: "127.0.0.1:1"})
	fromCallTimeOverride, err := overrideLauncher.Launch(LauncherConfig{LauncherRemoteCDPURL: local.CDPURL})
	if err != nil {
		t.Fatal(err)
	}
	if fromCallTimeOverride.CDPURL != local.CDPURL {
		t.Fatalf("fromCallTimeOverride.CDPURL = %q, want %q", fromCallTimeOverride.CDPURL, local.CDPURL)
	}
	fromCallTimeOverride.Close()
}
