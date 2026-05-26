package launcher

import "testing"

func TestNoneBrowserLauncherConstructorLaunchAndConfigMatchTSShape(t *testing.T) {
	launcher := NewNoneBrowserLauncher(LaunchOptions{LauncherRemoteCDPURL: "ws://127.0.0.1:9222/devtools/browser/initial"})
	if launcher.Options.LauncherRemoteCDPURL != "ws://127.0.0.1:9222/devtools/browser/initial" {
		t.Fatalf("Options.LauncherRemoteCDPURL = %q", launcher.Options.LauncherRemoteCDPURL)
	}
	if transportConfig := launcher.GetTransportConfig(); transportConfig["upstream_ws_cdp_url"] != "ws://127.0.0.1:9222/devtools/browser/initial" {
		t.Fatalf("transport config before launch = %#v", transportConfig)
	}
	launched, err := launcher.Launch(LaunchOptions{LauncherRemoteCDPURL: "ws://127.0.0.1:9222/devtools/browser/call"})
	if err != nil {
		t.Fatal(err)
	}
	if launcher.Launched != launched {
		t.Fatal("expected launcher to retain launched browser")
	}
	if launched.CDPURL != "" {
		t.Fatalf("launched.CDPURL = %q", launched.CDPURL)
	}
	if len(launcher.GetServerConfig()) != 0 {
		t.Fatalf("server config after launch = %#v", launcher.GetServerConfig())
	}
	launched.Close()
}
