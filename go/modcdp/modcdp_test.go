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

	if NewUpstreamTransport(UpstreamTransportOptions{}).Options.UpstreamMode != "" {
		t.Fatal("NewUpstreamTransport returned non-empty mode")
	}
	if NewWSUpstreamTransport(UpstreamTransportOptions{}) == nil {
		t.Fatal("NewWSUpstreamTransport returned nil")
	}

	if UpstreamModeWS != "ws" {
		t.Fatal("upstream mode constants drifted")
	}
}
