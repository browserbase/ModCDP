// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.BBBrowserLauncher.ts
// - ./python/tests/test_BBBrowserLauncher.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package launcher_test

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/browserbase/modcdp/go/modcdp/launcher"
	"github.com/browserbase/modcdp/go/modcdp/transport"
)

func TestCreatesVerifiesResumesAndReleasesARealBrowserbaseBrowserSession(t *testing.T) {
	if strings.TrimSpace(os.Getenv("BROWSERBASE_API_KEY")) == "" {
		t.Fatal("BROWSERBASE_API_KEY is required for live Browserbase tests")
	}
	config := launcher.LauncherConfig{
		LauncherBBTimeout: 120,
		LauncherBBBrowserSettings: map[string]any{
			"viewport":      map[string]any{"width": 900, "height": 700},
			"recordSession": false,
		},
		LauncherBBUserMetadata: map[string]any{
			"modcdp_launcher_test": "BBBrowserLauncher",
		},
	}
	if region := os.Getenv("BROWSERBASE_REGION"); region != "" {
		config.LauncherBBRegion = region
	}
	bb_launcher := launcher.NewBBBrowserLauncher(config)
	browser, err := bb_launcher.Launch(launcher.LauncherConfig{})
	if err != nil {
		t.Fatal(err)
	}
	var resumed *launcher.LaunchedBrowser
	var cdp_transport *transport.WSUpstreamTransport
	defer func() {
		if cdp_transport != nil {
			_ = cdp_transport.Close()
		}
		if resumed != nil {
			resumed.Close()
		}
		browser.Close()
		browser.Close()
	}()

	if browser.BrowserbaseSessionID == "" {
		t.Fatal("expected browserbase session id")
	}
	if bb_launcher.Launched != browser {
		t.Fatal("expected launcher to retain launched browser")
	}
	transportConfig := bb_launcher.ConfigForUpstream()
	if transportConfig["upstream_ws_cdp_url"] != browser.CDPURL {
		t.Fatalf("transport cdp_url = %v, want %s", transportConfig["upstream_ws_cdp_url"], browser.CDPURL)
	}
	if !strings.Contains(browser.BrowserbaseSessionURL, browser.BrowserbaseSessionID) {
		t.Fatalf("browserbase session url = %q", browser.BrowserbaseSessionURL)
	}
	if !strings.HasPrefix(browser.CDPURL, "wss://") {
		t.Fatalf("ws url = %q", browser.CDPURL)
	}
	cdp_transport = connectBrowserbaseCDP(t, browser.CDPURL)
	expectBrowserbaseCDPBrowserSurface(t, cdp_transport)

	retrieved := retrieveBrowserbaseSession(t, browser.BrowserbaseSessionID)
	if retrieved["id"] != browser.BrowserbaseSessionID {
		t.Fatalf("retrieved id = %v", retrieved["id"])
	}
	if retrieved["status"] != "RUNNING" {
		t.Fatalf("retrieved status = %v", retrieved["status"])
	}

	closeSessionOnClose := false
	resumed, err = launcher.NewBBBrowserLauncher(launcher.LauncherConfig{
		LauncherBBSessionID:           browser.BrowserbaseSessionID,
		LauncherBBCloseSessionOnClose: &closeSessionOnClose,
	}).Launch(launcher.LauncherConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if resumed.BrowserbaseSessionID != browser.BrowserbaseSessionID {
		t.Fatalf("resumed session id = %q", resumed.BrowserbaseSessionID)
	}
	if !strings.HasPrefix(resumed.CDPURL, "wss://") {
		t.Fatalf("resumed ws url = %q", resumed.CDPURL)
	}
	expectBrowserbaseCDPBrowserSurface(t, cdp_transport)

	_ = cdp_transport.Close()
	cdp_transport = nil
	resumed.Close()
	browser.Close()
	browser.Close()

	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		if retrieveBrowserbaseSession(t, browser.BrowserbaseSessionID)["status"] != "RUNNING" {
			return
		}
		time.Sleep(time.Second)
	}
	t.Fatal("Browserbase session did not leave RUNNING status after release")
}

// MODCDP_TEST_SUPPORT: LANGUAGE-SPECIFIC TEST SUPPORT ONLY.
// Keep the setup semantics above 1:1 with translated tests; helpers here only call real Browserbase APIs and real CDP endpoints.
func connectBrowserbaseCDP(t *testing.T, rawURL string) *transport.WSUpstreamTransport {
	t.Helper()
	cdp_transport := transport.NewWSUpstreamTransport(transport.UpstreamTransportConfig{
		UpstreamWSCDPURL:         rawURL,
		UpstreamCDPSendTimeoutMS: 120_000,
	})
	if err := cdp_transport.Connect(); err != nil {
		t.Fatal(err)
	}
	return cdp_transport
}

func expectBrowserbaseCDPBrowserSurface(t *testing.T, cdp_transport *transport.WSUpstreamTransport) {
	t.Helper()
	result, err := cdp_transport.Send("Browser.getVersion", map[string]any{}, "", 120*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	product, _ := result["product"].(string)
	if !strings.Contains(product, "Chrome") && !strings.Contains(product, "Chromium") {
		t.Fatalf("Browser.getVersion result = %#v", result)
	}
}

func retrieveBrowserbaseSession(t *testing.T, sessionID string) map[string]any {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, browserbaseAPIURL("/v1/sessions/"+sessionID), nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("x-bb-api-key", os.Getenv("BROWSERBASE_API_KEY"))
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		t.Fatalf("Browserbase session fetch returned %d: %s", response.StatusCode, string(body))
	}
	var session map[string]any
	if err := json.Unmarshal(body, &session); err != nil {
		t.Fatal(err)
	}
	return session
}

func browserbaseAPIURL(pathname string) string {
	baseURL := os.Getenv("BROWSERBASE_BASE_URL")
	if baseURL == "" {
		baseURL = launcher.DefaultBrowserbaseLauncherBaseURL
	}
	return strings.TrimRight(baseURL, "/") + "/" + strings.TrimLeft(pathname, "/")
}
