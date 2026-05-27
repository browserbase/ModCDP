// MODCDP_GO_ONLY_TEST: DO NOT TRANSLATE THIS TEST FILE TO OTHER LANGUAGES.
// Go package re-export compile checks are Go-only and have no TS/Python test sibling.
// If a translated sibling is added, all test cases, descriptions, covered edge cases, and setup must be kept perfectly 1:1 in sync.
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package modcdp

import "testing"

func TestRootExportsConcreteLaunchersInjectorsAndTransports(t *testing.T) {
	if NewLocalBrowserLauncher(LaunchOptions{}) == nil {
		t.Fatal("NewLocalBrowserLauncher returned nil")
	}
	if NewRemoteBrowserLauncher(LaunchOptions{LauncherRemoteCDPURL: "ws://127.0.0.1:9222/devtools/browser/test"}) == nil {
		t.Fatal("NewRemoteBrowserLauncher returned nil")
	}
	if NewBBBrowserLauncher(LaunchOptions{}) == nil {
		t.Fatal("NewBBBrowserLauncher returned nil")
	}
	if NewNoneBrowserLauncher(LaunchOptions{}) == nil {
		t.Fatal("NewNoneBrowserLauncher returned nil")
	}

	extensionInjector := NewExtensionInjector(InjectorOptions{})
	discoveredInjector := NewDiscoverExtensionInjector(InjectorOptions{})
	bbInjector := NewBBExtensionInjector(InjectorOptions{})
	localLaunchInjector := NewCLIExtensionInjector(InjectorOptions{})
	loadUnpackedInjector := NewCDPExtensionInjector(InjectorOptions{})
	borrowedInjector := NewBorrowExtensionInjector(InjectorOptions{})
	_ = []any{extensionInjector, discoveredInjector, bbInjector, localLaunchInjector, loadUnpackedInjector, borrowedInjector}

	if NewUpstreamTransport(UpstreamTransportOptions{}).Config.UpstreamMode != "" {
		t.Fatal("NewUpstreamTransport returned non-empty mode")
	}
	if NewWSUpstreamTransport(UpstreamTransportOptions{}) == nil {
		t.Fatal("NewWSUpstreamTransport returned nil")
	}

	if UpstreamModeWS != "ws" {
		t.Fatal("upstream mode constants drifted")
	}
}
