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

	if NewWSUpstreamTransport(WSUpstreamTransportOptions{}) == nil {
		t.Fatal("NewWSUpstreamTransport returned nil")
	}
	if NewPipeUpstreamTransport(PipeUpstreamTransportOptions{}) == nil {
		t.Fatal("NewPipeUpstreamTransport returned nil")
	}
	if NewReverseWSUpstreamTransport(ReverseWSUpstreamTransportOptions{}) == nil {
		t.Fatal("NewReverseWSUpstreamTransport returned nil")
	}
	if NewNativeMessagingUpstreamTransport(NativeMessagingUpstreamTransportOptions{}) == nil {
		t.Fatal("NewNativeMessagingUpstreamTransport returned nil")
	}
	if NewNATSUpstreamTransport(NATSUpstreamTransportOptions{}) == nil {
		t.Fatal("NewNATSUpstreamTransport returned nil")
	}

	if UpstreamModeWS != "ws" || UpstreamModePipe != "pipe" || UpstreamModeNativeMessaging != "nativemessaging" || UpstreamModeReverseWS != "reversews" || UpstreamModeNATS != "nats" {
		t.Fatal("upstream mode constants drifted")
	}
}
