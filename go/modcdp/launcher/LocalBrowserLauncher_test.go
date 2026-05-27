// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.LocalBrowserLauncher.ts
// - ./python/tests/test_LocalBrowserLauncher.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package launcher

import (
	"context"
	"encoding/json"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gobwas/ws"
	"github.com/gobwas/ws/wsutil"
)

func TestClassHelpersMatchTheLocalLauncherSurface(t *testing.T) {
	launcher := NewLocalBrowserLauncher(LauncherConfig{})
	if chromePath, err := launcher.FindChromeBinary(""); err != nil || chromePath == "" {
		t.Fatalf("FindChromeBinary = %q, %v", chromePath, err)
	}
	if port, err := launcher.FreePort(); err != nil || port <= 0 {
		t.Fatalf("FreePort = %d, %v", port, err)
	}
}

func TestLaunchesARealBrowserOverAChosenCDPPortAndExplicitProfileDir(t *testing.T) {
	headless := true
	profileDir := t.TempDir()
	port, err := freePort()
	if err != nil {
		t.Fatal(err)
	}
	launcher := NewLocalBrowserLauncher(LauncherConfig{
		LauncherLocalHeadless:                  &headless,
		LauncherLocalChromeReadyTimeoutMS:      45_000,
		LauncherLocalChromeReadyPollIntervalMS: 50,
	})
	chrome, err := launcher.Launch(LauncherConfig{
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
	if launcher.Launched != chrome {
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
	transportConfig := launcher.ConfigForUpstream()
	if transportConfig["upstream_ws_cdp_url"] != chrome.CDPURL {
		t.Fatalf("transport cdp_url = %v, want %s", transportConfig["upstream_ws_cdp_url"], chrome.CDPURL)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn, _, _, err := ws.Dial(ctx, chrome.CDPURL)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	if err := wsutil.WriteClientText(conn, []byte(`{"id":1,"method":"Browser.getVersion","params":{}}`)); err != nil {
		t.Fatal(err)
	}
	body, err := wsutil.ReadServerText(conn)
	if err != nil {
		t.Fatal(err)
	}
	var response struct {
		ID     int `json:"id"`
		Result struct {
			Product         string `json:"product"`
			ProtocolVersion string `json:"protocolVersion"`
		} `json:"result"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		t.Fatal(err)
	}
	if response.ID != 1 {
		t.Fatalf("unexpected response id %d", response.ID)
	}
	if !strings.Contains(response.Result.Product, "Chrome") && !strings.Contains(response.Result.Product, "Chromium") {
		t.Fatalf("unexpected product %q", response.Result.Product)
	}
	if response.Result.ProtocolVersion == "" {
		t.Fatal("expected protocolVersion")
	}
}

func TestLaunchesARealBrowserWithAnAuxiliaryLoopbackCDPEndpointWhenRequested(t *testing.T) {
	headless := true
	loopbackCDP := true
	chrome, err := NewLocalBrowserLauncher(LauncherConfig{
		LauncherLocalHeadless:             &headless,
		LauncherLocalChromeReadyTimeoutMS: 45_000,
	}).Launch(LauncherConfig{LauncherLocalLoopbackCDP: &loopbackCDP})
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
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn, _, _, err := ws.Dial(ctx, chrome.LoopbackCDPURL)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if err := wsutil.WriteClientText(conn, []byte(`{"id":1,"method":"Browser.getVersion","params":{}}`)); err != nil {
		t.Fatal(err)
	}
	body, err := wsutil.ReadServerText(conn)
	if err != nil {
		t.Fatal(err)
	}
	var response map[string]any
	if err := json.Unmarshal(body, &response); err != nil {
		t.Fatal(err)
	}
	if response["id"] != float64(1) {
		t.Fatalf("response id = %v", response["id"])
	}
}

func TestRemovesAnExplicitUserDataDirWhenCleanupUserDataDirIsSet(t *testing.T) {
	headless := true
	cleanupUserDataDir := true
	profileDir, err := os.MkdirTemp("", "modcdp-go-local-profile-")
	if err != nil {
		t.Fatal(err)
	}
	chrome, err := NewLocalBrowserLauncher(LauncherConfig{
		LauncherLocalHeadless:             &headless,
		LauncherLocalChromeReadyTimeoutMS: 45_000,
	}).Launch(LauncherConfig{
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
