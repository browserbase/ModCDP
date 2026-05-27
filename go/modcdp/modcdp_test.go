// MODCDP_GO_ONLY_TEST: DO NOT TRANSLATE THIS TEST FILE TO OTHER LANGUAGES.
// Go package re-export compile checks are Go-only and have no TS/Python test sibling.
// If a translated sibling is added, all test cases, descriptions, covered edge cases, and setup must be kept perfectly 1:1 in sync.
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package modcdp

import "testing"

func TestRootExportsConcreteLaunchersInjectorsAndTransports(t *testing.T) {
	if NewLocalBrowserLauncher(LauncherConfig{}) == nil {
		t.Fatal("NewLocalBrowserLauncher returned nil")
	}
	if NewRemoteBrowserLauncher(LauncherConfig{LauncherRemoteCDPURL: "ws://127.0.0.1:9222/devtools/browser/test"}) == nil {
		t.Fatal("NewRemoteBrowserLauncher returned nil")
	}
	if NewBBBrowserLauncher(LauncherConfig{}) == nil {
		t.Fatal("NewBBBrowserLauncher returned nil")
	}
	if NewNoneBrowserLauncher(LauncherConfig{}) == nil {
		t.Fatal("NewNoneBrowserLauncher returned nil")
	}

	extensionInjector := NewExtensionInjector(InjectorConfig{})
	discoveredInjector := NewDiscoverExtensionInjector(InjectorConfig{})
	bbInjector := NewBBExtensionInjector(InjectorConfig{})
	localLaunchInjector := NewCLIExtensionInjector(InjectorConfig{})
	loadUnpackedInjector := NewCDPExtensionInjector(InjectorConfig{})
	_ = []any{extensionInjector, discoveredInjector, bbInjector, localLaunchInjector, loadUnpackedInjector}

	if NewUpstreamTransport(UpstreamTransportConfig{}).Config.UpstreamMode != string(UpstreamModeWS) {
		t.Fatal("NewUpstreamTransport did not hydrate default ws mode")
	}
	if NewWSUpstreamTransport(UpstreamTransportConfig{}) == nil {
		t.Fatal("NewWSUpstreamTransport returned nil")
	}

	if UpstreamModeWS != "ws" {
		t.Fatal("upstream mode constants drifted")
	}
}
