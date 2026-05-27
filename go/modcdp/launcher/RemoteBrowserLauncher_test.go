package launcher

import (
	"fmt"
	"testing"
)

func TestRemoteBrowserLauncherRequiresLauncherRemoteCDPURL(t *testing.T) {
	_, err := NewRemoteBrowserLauncher(LaunchOptions{}).Launch(LaunchOptions{})
	if err == nil || err.Error() != "launcher.launcher_mode=remote requires launcher_remote_cdp_url" {
		t.Fatalf("Launch error = %v", err)
	}
}

func TestRemoteBrowserLauncherConnectsToRealBrowserFromHTTPAndWebSocketCDPEndpoints(t *testing.T) {
	port, err := freePort()
	if err != nil {
		t.Fatal(err)
	}
	local, err := NewLocalBrowserLauncher(LaunchOptions{}).Launch(LaunchOptions{
		LauncherLocalHeadless:      boolPtr(true),
		LauncherLocalCDPListenPort: port,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer local.Close()

	httpLauncher := NewRemoteBrowserLauncher(LaunchOptions{LauncherRemoteCDPURL: fmt.Sprintf("http://127.0.0.1:%d", port)})
	fromHTTP, err := httpLauncher.Launch(LaunchOptions{})
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

	hostPortLauncher := NewRemoteBrowserLauncher(LaunchOptions{LauncherRemoteCDPURL: fmt.Sprintf("127.0.0.1:%d", port)})
	fromHostPort, err := hostPortLauncher.Launch(LaunchOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if fromHostPort.CDPURL != local.CDPURL {
		t.Fatalf("fromHostPort.CDPURL = %q, want %q", fromHostPort.CDPURL, local.CDPURL)
	}
	fromHostPort.Close()

	optionsLauncher := NewRemoteBrowserLauncher(LaunchOptions{LauncherRemoteCDPURL: local.CDPURL})
	fromOptions, err := optionsLauncher.Launch(LaunchOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if fromOptions.CDPURL != local.CDPURL {
		t.Fatalf("fromOptions.CDPURL = %q, want %q", fromOptions.CDPURL, local.CDPURL)
	}
	fromOptions.Close()

	wsLauncher := NewRemoteBrowserLauncher(LaunchOptions{})
	fromWS, err := wsLauncher.Launch(LaunchOptions{LauncherRemoteCDPURL: local.CDPURL})
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

	overrideLauncher := NewRemoteBrowserLauncher(LaunchOptions{LauncherRemoteCDPURL: "127.0.0.1:1"})
	fromCallTimeOverride, err := overrideLauncher.Launch(LaunchOptions{LauncherRemoteCDPURL: local.CDPURL})
	if err != nil {
		t.Fatal(err)
	}
	if fromCallTimeOverride.CDPURL != local.CDPURL {
		t.Fatalf("fromCallTimeOverride.CDPURL = %q, want %q", fromCallTimeOverride.CDPURL, local.CDPURL)
	}
	fromCallTimeOverride.Close()
}
