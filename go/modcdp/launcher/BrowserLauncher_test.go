package launcher

import (
	"strings"
	"testing"
)

func TestBrowserLauncherMergesLaunchConfigAndExposesTransportAndInjectorOptions(t *testing.T) {
	launcher := NewBrowserLauncher(LaunchOptions{
		LauncherRemoteCDPURL:     "ws://127.0.0.1:9222/devtools/browser/initial",
		LauncherLocalUserDataDir: "/tmp/modcdp-browser-launcher",
		LauncherBBAPIKey:         "test-key",
		LauncherBBExtensionID:    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		LauncherLocalArgs:        []string{"--load-extension=/tmp/args-one"},
		LauncherLocalExtraArgs:   []string{"--load-extension=/tmp/one"},
	})
	launcher.Update(LaunchOptions{
		LauncherRemoteCDPURL:   "ws://127.0.0.1:9222/devtools/browser/updated",
		LauncherLocalArgs:      []string{"--load-extension=/tmp/args-two", "--lang=en-US"},
		LauncherLocalExtraArgs: []string{"--load-extension=/tmp/two", "--window-size=900,700"},
	})

	assertStringsEqual(t, launcher.Options.LauncherLocalArgs, []string{"--lang=en-US", "--load-extension=/tmp/args-one,/tmp/args-two"})
	assertStringsEqual(t, launcher.Options.LauncherLocalExtraArgs, []string{"--window-size=900,700", "--load-extension=/tmp/one,/tmp/two"})

	transportConfig := launcher.ConfigForUpstream()
	if transportConfig["upstream_ws_cdp_url"] != "ws://127.0.0.1:9222/devtools/browser/updated" {
		t.Fatalf("cdp_url = %v", transportConfig["upstream_ws_cdp_url"])
	}
	injectorConfig := launcher.ConfigForInjector()
	if injectorConfig.InjectorBBAPIKey != "test-key" {
		t.Fatalf("InjectorBBAPIKey = %v", injectorConfig.InjectorBBAPIKey)
	}
	if injectorConfig.InjectorBBExtensionID != "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" {
		t.Fatalf("InjectorBBExtensionID = %v", injectorConfig.InjectorBBExtensionID)
	}

	if _, err := launcher.Launch(LaunchOptions{}); err == nil || !strings.Contains(err.Error(), "BrowserLauncher.Launch is not implemented") {
		t.Fatalf("Launch error = %v", err)
	}
}

func assertStringsEqual(t *testing.T, actual []string, expected []string) {
	t.Helper()
	if len(actual) != len(expected) {
		t.Fatalf("len(%v) != len(%v)", actual, expected)
	}
	for index := range actual {
		if actual[index] != expected[index] {
			t.Fatalf("index %d: %q != %q in %v", index, actual[index], expected[index], actual)
		}
	}
}
