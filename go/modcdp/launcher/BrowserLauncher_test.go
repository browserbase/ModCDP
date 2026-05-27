// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.BrowserLauncher.ts
// - ./python/tests/test_BrowserLauncher.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package launcher

import (
	"strings"
	"testing"
)

func TestBrowserLauncherMergesLaunchConfigAndExposesUpstreamOptions(t *testing.T) {
	launcher := NewBrowserLauncher(LaunchOptions{
		LauncherRemoteCDPURL:     "ws://127.0.0.1:9222/devtools/browser/initial",
		LauncherLocalUserDataDir: "/tmp/modcdp-browser-launcher",
	})
	launcher.Update(LaunchOptions{
		LauncherRemoteCDPURL: "ws://127.0.0.1:9222/devtools/browser/updated",
	})

	transportConfig := launcher.ConfigForUpstream()
	if transportConfig["upstream_ws_cdp_url"] != "ws://127.0.0.1:9222/devtools/browser/updated" {
		t.Fatalf("cdp_url = %v", transportConfig["upstream_ws_cdp_url"])
	}
	if _, err := launcher.Launch(LaunchOptions{}); err == nil || !strings.Contains(err.Error(), "BrowserLauncher.Launch is not implemented") {
		t.Fatalf("Launch error = %v", err)
	}
}
