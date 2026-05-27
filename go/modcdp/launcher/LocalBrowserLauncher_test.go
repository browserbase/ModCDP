// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.LocalBrowserLauncher.ts
// - ./python/tests/test_LocalBrowserLauncher.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package launcher_test

import (
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/browserbase/modcdp/go/modcdp/launcher"
	"github.com/browserbase/modcdp/go/modcdp/transport"
)

func TestClassHelpersMatchTheLocalLauncherSurface(t *testing.T) {
	local_launcher := launcher.NewLocalBrowserLauncher(launcher.LauncherConfig{})
	if chromePath, err := local_launcher.FindChromeBinary(""); err != nil || chromePath == "" {
		t.Fatalf("FindChromeBinary = %q, %v", chromePath, err)
	}
	if port, err := local_launcher.FreePort(); err != nil || port <= 0 {
		t.Fatalf("FreePort = %d, %v", port, err)
	}
}

func TestLaunchesARealBrowserOverAChosenCDPPortAndExplicitProfileDir(t *testing.T) {
	headless := true
	profileDir := t.TempDir()
	port, err := launcher.NewLocalBrowserLauncher(launcher.LauncherConfig{}).FreePort()
	if err != nil {
		t.Fatal(err)
	}
	local_launcher := launcher.NewLocalBrowserLauncher(launcher.LauncherConfig{
		LauncherLocalHeadless:                  &headless,
		LauncherLocalChromeReadyTimeoutMS:      45_000,
		LauncherLocalChromeReadyPollIntervalMS: 50,
	})
	chrome, err := local_launcher.Launch(launcher.LauncherConfig{
		LauncherLocalCDPListenPort: port,
		LauncherLocalUserDataDir:   profileDir,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		chrome.Close()
		if _, err := os.Stat(profileDir); err != nil {
			t.Fatalf("expected explicit user data dir to remain after close: %v", err)
		}
	}()
	if local_launcher.Launched != chrome {
		t.Fatal("expected launcher to retain launched browser")
	}
	expectedPrefix := "ws://127.0.0.1:" + strconv.Itoa(port) + "/"
	if !strings.HasPrefix(chrome.CDPURL, expectedPrefix) {
		t.Fatalf("CDPURL = %q", chrome.CDPURL)
	}
	if chrome.ProfileDir != profileDir {
		t.Fatalf("ProfileDir = %q, want %q", chrome.ProfileDir, profileDir)
	}
	if chrome.CDPListenPort != port {
		t.Fatalf("CDPListenPort = %d, want %d", chrome.CDPListenPort, port)
	}
	transportConfig := local_launcher.ConfigForUpstream()
	if transportConfig["upstream_ws_cdp_url"] != chrome.CDPURL {
		t.Fatalf("transport cdp_url = %v, want %s", transportConfig["upstream_ws_cdp_url"], chrome.CDPURL)
	}
	cdp_transport := transport.NewWSUpstreamTransport(transport.UpstreamTransportConfig{UpstreamWSCDPURL: chrome.CDPURL})
	if err := cdp_transport.Connect(); err != nil {
		t.Fatal(err)
	}
	defer cdp_transport.Close()
	response, err := cdp_transport.Send("Browser.getVersion", map[string]any{}, "", 10*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	product, _ := response["product"].(string)
	if !strings.Contains(product, "Chrome") && !strings.Contains(product, "Chromium") {
		t.Fatalf("unexpected product %q", product)
	}
	protocolVersion, _ := response["protocolVersion"].(string)
	if protocolVersion == "" {
		t.Fatal("expected protocolVersion")
	}
}

func TestLaunchesARealBrowserWithAnAuxiliaryLoopbackCDPEndpointWhenRequested(t *testing.T) {
	headless := true
	loopbackCDP := true
	chrome, err := launcher.NewLocalBrowserLauncher(launcher.LauncherConfig{
		LauncherLocalHeadless:             &headless,
		LauncherLocalChromeReadyTimeoutMS: 45_000,
	}).Launch(launcher.LauncherConfig{LauncherLocalLoopbackCDP: &loopbackCDP})
	if err != nil {
		t.Fatal(err)
	}
	defer chrome.Close()
	if !strings.HasPrefix(chrome.CDPURL, "ws://127.0.0.1:") {
		t.Fatalf("CDPURL = %q", chrome.CDPURL)
	}
	if !strings.HasPrefix(chrome.LoopbackCDPURL, "ws://127.0.0.1:") {
		t.Fatalf("LoopbackCDPURL = %q", chrome.LoopbackCDPURL)
	}
	if chrome.CDPListenPort <= 0 {
		t.Fatalf("CDPListenPort = %d", chrome.CDPListenPort)
	}
	cdp_transport := transport.NewWSUpstreamTransport(transport.UpstreamTransportConfig{UpstreamWSCDPURL: chrome.LoopbackCDPURL})
	if err := cdp_transport.Connect(); err != nil {
		t.Fatal(err)
	}
	defer cdp_transport.Close()
	response, err := cdp_transport.Send("Browser.getVersion", map[string]any{}, "", 10*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	product, _ := response["product"].(string)
	if !strings.Contains(product, "Chrome") && !strings.Contains(product, "Chromium") {
		t.Fatalf("unexpected product %q", product)
	}
}

func TestRemovesAnExplicitUserDataDirWhenCleanupUserDataDirIsSet(t *testing.T) {
	headless := true
	cleanupUserDataDir := true
	profileDir, err := os.MkdirTemp("", "modcdp-go-local-profile-")
	if err != nil {
		t.Fatal(err)
	}
	chrome, err := launcher.NewLocalBrowserLauncher(launcher.LauncherConfig{
		LauncherLocalHeadless:             &headless,
		LauncherLocalChromeReadyTimeoutMS: 45_000,
	}).Launch(launcher.LauncherConfig{
		LauncherLocalUserDataDir:        profileDir,
		LauncherLocalCleanupUserDataDir: &cleanupUserDataDir,
	})
	if err != nil {
		_ = os.RemoveAll(profileDir)
		t.Fatal(err)
	}

	chrome.Close()

	if _, err := os.Stat(profileDir); !os.IsNotExist(err) {
		_ = os.RemoveAll(profileDir)
		t.Fatalf("expected explicit user data dir to be removed, got %v", err)
	}
}
