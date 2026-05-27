// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.BBBrowserLauncher.ts
// - ./python/tests/test_BBBrowserLauncher.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package launcher

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gobwas/ws"
	"github.com/gobwas/ws/wsutil"
)

func TestBBBrowserLauncherCreatesVerifiesResumesAndReleasesRealSession(t *testing.T) {
	if strings.TrimSpace(os.Getenv("BROWSERBASE_API_KEY")) == "" {
		t.Fatal("BROWSERBASE_API_KEY is required for live Browserbase tests")
	}
	options := LauncherConfig{
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
		options.LauncherBBRegion = region
	}
	launcher := NewBBBrowserLauncher(options)
	browser, err := launcher.Launch(LauncherConfig{})
	if err != nil {
		t.Fatal(err)
	}
	var resumed *LaunchedBrowser
	var conn io.ReadWriteCloser
	defer func() {
		if conn != nil {
			_ = conn.Close()
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
	if launcher.Launched != browser {
		t.Fatal("expected launcher to retain launched browser")
	}
	transportConfig := launcher.ConfigForUpstream()
	if transportConfig["upstream_ws_cdp_url"] != browser.CDPURL {
		t.Fatalf("transport cdp_url = %v, want %s", transportConfig["upstream_ws_cdp_url"], browser.CDPURL)
	}
	if !strings.Contains(browser.BrowserbaseSessionURL, browser.BrowserbaseSessionID) {
		t.Fatalf("browserbase session url = %q", browser.BrowserbaseSessionURL)
	}
	if !strings.HasPrefix(browser.CDPURL, "wss://") {
		t.Fatalf("ws url = %q", browser.CDPURL)
	}
	conn = connectBrowserbaseCDP(t, browser.CDPURL)
	expectCDPBrowserSurface(t, conn)

	retrieved := retrieveBrowserbaseSession(t, browser.BrowserbaseSessionID)
	if retrieved["id"] != browser.BrowserbaseSessionID {
		t.Fatalf("retrieved id = %v", retrieved["id"])
	}
	if retrieved["status"] != "RUNNING" {
		t.Fatalf("retrieved status = %v", retrieved["status"])
	}

	closeSessionOnClose := false
	resumed, err = NewBBBrowserLauncher(LauncherConfig{
		LauncherBBSessionID:           browser.BrowserbaseSessionID,
		LauncherBBCloseSessionOnClose: &closeSessionOnClose,
	}).Launch(LauncherConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if resumed.BrowserbaseSessionID != browser.BrowserbaseSessionID {
		t.Fatalf("resumed session id = %q", resumed.BrowserbaseSessionID)
	}
	if !strings.HasPrefix(resumed.CDPURL, "wss://") {
		t.Fatalf("resumed ws url = %q", resumed.CDPURL)
	}
	expectCDPBrowserSurface(t, conn)

	_ = conn.Close()
	conn = nil
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
func connectBrowserbaseCDP(t *testing.T, rawURL string) io.ReadWriteCloser {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	conn, _, _, err := ws.Dial(ctx, rawURL)
	if err != nil {
		t.Fatal(err)
	}
	return conn
}

func expectCDPBrowserSurface(t *testing.T, conn io.ReadWriter) {
	t.Helper()
	body, _ := json.Marshal(map[string]any{"id": 1, "method": "Browser.getVersion", "params": map[string]any{}})
	if err := wsutil.WriteClientText(conn, body); err != nil {
		t.Fatal(err)
	}
	data, _, err := wsutil.ReadServerData(conn)
	if err != nil {
		t.Fatal(err)
	}
	var message map[string]any
	if err := json.Unmarshal(data, &message); err != nil {
		t.Fatal(err)
	}
	result, _ := message["result"].(map[string]any)
	product, _ := result["product"].(string)
	if !strings.Contains(product, "Chrome") && !strings.Contains(product, "Chromium") {
		t.Fatalf("Browser.getVersion result = %#v", message)
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
	baseURL := firstString(os.Getenv("BROWSERBASE_BASE_URL"), DefaultBrowserbaseLauncherBaseURL)
	return strings.TrimRight(baseURL, "/") + "/" + strings.TrimLeft(pathname, "/")
}
