// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.NoneBrowserLauncher.ts
// - ./python/tests/test_NoneBrowserLauncher.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package launcher

import "testing"

func TestNoneBrowserLauncherConstructorLaunchAndConfigMatchTSShape(t *testing.T) {
	launcher := NewNoneBrowserLauncher(LauncherConfig{LauncherRemoteCDPURL: "ws://127.0.0.1:9222/devtools/browser/initial"})
	if launcher.Config.LauncherRemoteCDPURL != "ws://127.0.0.1:9222/devtools/browser/initial" {
		t.Fatalf("Config.LauncherRemoteCDPURL = %q", launcher.Config.LauncherRemoteCDPURL)
	}
	if transportConfig := launcher.ConfigForUpstream(); transportConfig["upstream_ws_cdp_url"] != "ws://127.0.0.1:9222/devtools/browser/initial" {
		t.Fatalf("transport config before launch = %#v", transportConfig)
	}
	launched, err := launcher.Launch(LauncherConfig{LauncherRemoteCDPURL: "ws://127.0.0.1:9222/devtools/browser/call"})
	if err != nil {
		t.Fatal(err)
	}
	if launcher.Launched != launched {
		t.Fatal("expected launcher to retain launched browser")
	}
	if launched.CDPURL != "" {
		t.Fatalf("launched.CDPURL = %q", launched.CDPURL)
	}
	if len(launcher.ConfigForServer(UpstreamTransportConfig{})) != 0 {
		t.Fatalf("server config after launch = %#v", launcher.ConfigForServer(UpstreamTransportConfig{}))
	}
	launched.Close()
}
