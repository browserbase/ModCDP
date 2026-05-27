// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.AutoSessionRouter.ts
// - ./python/tests/test_AutoSessionRouter.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package router_test

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"testing"
	"time"

	modcdp "github.com/browserbase/modcdp/go/modcdp/client"
)

func TestAutoSessionRouterTracksRealTargetSessionsAndExecutionContextsFromLiveCDPEvents(t *testing.T) {
	headless := true
	extensionPath, err := filepath.Abs(filepath.Join("..", "..", "..", "dist", "extension"))
	if err != nil {
		t.Fatal(err)
	}
	cdp := modcdp.New(modcdp.Config{
		Launcher: modcdp.LauncherConfig{
			LauncherMode:                "local",
			LauncherLocalHeadless:       &headless,
			LauncherLocalExecutablePath: loadExtensionTestBrowserPath(t),
		},
		Upstream: modcdp.UpstreamTransportConfig{UpstreamMode: "ws"},
		Injector: modcdp.InjectorConfig{
			InjectorMode:                     "cli",
			InjectorCLIExtensionPath:         extensionPath,
			InjectorServiceWorkerURLSuffixes: []string{"/modcdp/service_worker.js"},
			InjectorTrustServiceWorkerTarget: true,
		},
		Router: modcdp.RouterConfig{RouterRoutes: map[string]string{
			"Mod.*":    "service_worker",
			"Custom.*": "service_worker",
			"*.*":      "direct_cdp",
		}},
	})
	defer cdp.Close()

	var targetID string
	var pendingTargetID string
	defer func() {
		if targetID != "" {
			closeTarget(cdp, targetID)
		}
		if pendingTargetID != "" {
			closeTarget(cdp, pendingTargetID)
		}
	}()

	if err := cdp.Connect(); err != nil {
		t.Fatal(err)
	}
	created, err := cdp.Target.CreateTarget(modcdp.TargetCreateTargetParams{URL: "about:blank#modcdp-auto-session-router"})
	if err != nil {
		t.Fatal(err)
	}
	targetID = string(created.TargetID)
	sessionID := waitForString(t, func() string { return cdp.Router.SessionId_from_targetId[targetID] })

	contextResult := make(chan int, 1)
	contextError := make(chan error, 1)
	go func() {
		contextID, err := cdp.Router.WaitForExecutionContext(sessionID, 30000)
		if err != nil {
			contextError <- err
			return
		}
		contextResult <- contextID
	}()
	if _, err := cdp.Send("Runtime.enable", map[string]any{}, sessionID); err != nil {
		t.Fatal(err)
	}
	var contextID int
	select {
	case contextID = <-contextResult:
		if contextID == 0 {
			t.Fatal("context id was zero")
		}
	case err := <-contextError:
		t.Fatal(err)
	case <-time.After(35 * time.Second):
		t.Fatal("timed out waiting for execution context")
	}
	foundContext := false
	for _, context := range cdp.Router.Contexts {
		if context["sessionId"] == sessionID && context["id"] == contextID {
			foundContext = true
			break
		}
	}
	if !foundContext {
		t.Fatalf("context id %d for session %s was not recorded", contextID, sessionID)
	}
	topologyOne, err := cdp.Router.GetTopology(nil)
	if err != nil {
		t.Fatal(err)
	}
	objectGroupOne, _ := topologyOne["objectGroup"].(string)
	if !regexp.MustCompile(`^modcdp-topology-\d+-[0-9a-f]+$`).MatchString(objectGroupOne) {
		t.Fatalf("topology objectGroup = %q", objectGroupOne)
	}
	topologyTwo, err := cdp.Router.GetTopology(nil)
	if err != nil {
		t.Fatal(err)
	}
	objectGroupTwo, _ := topologyTwo["objectGroup"].(string)
	if objectGroupOne == objectGroupTwo {
		t.Fatalf("topology objectGroup was reused: %q", objectGroupOne)
	}
	if _, _, err := cdp.Router.EnsureRouteForTarget("missing-target-id"); err == nil {
		t.Fatal("EnsureRouteForTarget should return the attach error for an unknown target")
	}

	detachTarget(t, cdp, sessionID)
	expectEventually(t, func() error {
		if cdp.Router.SessionId_from_targetId[targetID] != "" {
			return fmt.Errorf("session still recorded")
		}
		return nil
	})
	for _, context := range cdp.Router.Contexts {
		if context["sessionId"] == sessionID {
			t.Fatal("execution context remained after detach")
		}
	}
	closeTarget(cdp, targetID)
	targetID = ""

	pendingCreated, err := cdp.Target.CreateTarget(modcdp.TargetCreateTargetParams{URL: "about:blank#modcdp-auto-session-router-pending-context"})
	if err != nil {
		t.Fatal(err)
	}
	pendingTargetID = string(pendingCreated.TargetID)
	pendingSessionID := waitForString(t, func() string { return cdp.Router.SessionId_from_targetId[pendingTargetID] })
	pendingContextError := make(chan error, 1)
	go func() {
		_, err := cdp.Router.WaitForExecutionContext(pendingSessionID, 30000)
		pendingContextError <- err
	}()
	detachTarget(t, cdp, pendingSessionID)
	select {
	case err := <-pendingContextError:
		expected := "Runtime execution context wait cancelled because session " + pendingSessionID + " detached."
		if err == nil || err.Error() != expected {
			t.Fatalf("wait error = %v", err)
		}
	case <-time.After(35 * time.Second):
		t.Fatal("timed out waiting for detach error")
	}
	expectEventually(t, func() error {
		if cdp.Router.SessionId_from_targetId[pendingTargetID] != "" {
			return fmt.Errorf("pending session still recorded")
		}
		return nil
	})
	closeTarget(cdp, pendingTargetID)
	pendingTargetID = ""
}

func detachTarget(t *testing.T, cdp *modcdp.ModCDPClient, sessionID string) {
	t.Helper()
	value := modcdp.TargetSessionID(sessionID)
	if _, err := cdp.Target.DetachFromTarget(modcdp.TargetDetachFromTargetParams{SessionIDValue: &value}); err != nil {
		t.Fatal(err)
	}
}

func closeTarget(cdp *modcdp.ModCDPClient, targetID string) {
	value := modcdp.TargetTargetID(targetID)
	_, _ = cdp.Target.CloseTarget(modcdp.TargetCloseTargetParams{TargetID: value})
}

func waitForString(t *testing.T, fn func() string) string {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		value := fn()
		if value != "" {
			return value
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatal("timed out waiting for string")
	return ""
}

func expectEventually(t *testing.T, assertion func() error) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	var lastError error
	for time.Now().Before(deadline) {
		if err := assertion(); err != nil {
			lastError = err
			time.Sleep(100 * time.Millisecond)
			continue
		}
		return
	}
	if lastError != nil {
		t.Fatal(lastError)
	}
	t.Fatal("timed out waiting for assertion")
}

// MODCDP_TEST_SUPPORT: LANGUAGE-SPECIFIC TEST SUPPORT ONLY.
// Keep setup semantics 1:1 with TS; this only selects a real browser for real --load-extension runs.
func loadExtensionTestBrowserPath(t *testing.T) string {
	t.Helper()
	for _, candidate := range []string{os.Getenv("CHROME_PATH"), linuxChromiumPath()} {
		if candidate == "" {
			continue
		}
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		home = "."
	}
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		localAppData = filepath.Join(home, "AppData", "Local")
	}
	var patterns []string
	switch runtime.GOOS {
	case "darwin":
		patterns = []string{
			filepath.Join(home, "Library", "Caches", "ms-playwright", "chromium-*", "chrome-mac*", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
			filepath.Join(home, "Library", "Caches", "ms-playwright", "chromium-*", "chrome-mac*", "Chromium.app", "Contents", "MacOS", "Chromium"),
			filepath.Join(home, "Library", "Caches", "puppeteer", "chrome", "mac*-*", "chrome-mac*", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
		}
	case "windows":
		patterns = []string{
			filepath.Join(localAppData, "ms-playwright", "chromium-*", "chrome-win*", "chrome.exe"),
			filepath.Join(home, ".cache", "puppeteer", "chrome", "win*-*", "chrome.exe"),
		}
	default:
		patterns = []string{
			filepath.Join(home, ".cache", "ms-playwright", "chromium-*", "chrome-linux*", "chrome"),
			filepath.Join("/opt", "pw-browsers", "chromium-*", "chrome-linux*", "chrome"),
			filepath.Join(home, ".cache", "puppeteer", "chrome", "linux-*", "chrome-linux*", "chrome"),
		}
	}
	var candidates []string
	for _, pattern := range patterns {
		matches, err := filepath.Glob(pattern)
		if err == nil {
			candidates = append(candidates, matches...)
		}
	}
	candidates = newestChromeForTestingFirst(candidates)
	if len(candidates) > 0 {
		return candidates[0]
	}
	t.Fatal("No browser found for --load-extension tests. Install Chrome for Testing or set CHROME_PATH.")
	return ""
}

func linuxChromiumPath() string {
	if runtime.GOOS == "linux" {
		return "/usr/bin/chromium"
	}
	return ""
}

func newestChromeForTestingFirst(candidates []string) []string {
	seen := map[string]bool{}
	deduped := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		if candidate == "" || seen[candidate] {
			continue
		}
		seen[candidate] = true
		deduped = append(deduped, candidate)
	}
	sort.Slice(deduped, func(i, j int) bool {
		leftVersion, leftMtime := browserPathScore(deduped[i])
		rightVersion, rightMtime := browserPathScore(deduped[j])
		if leftVersion != rightVersion {
			return leftVersion > rightVersion
		}
		if leftMtime != rightMtime {
			return leftMtime > rightMtime
		}
		return deduped[i] < deduped[j]
	})
	return deduped
}

func browserPathScore(candidate string) (int, int64) {
	version := 0
	for _, match := range regexp.MustCompile(`\d+`).FindAllString(candidate, -1) {
		value := 0
		for _, digit := range match {
			value = value*10 + int(digit-'0')
		}
		if value > version {
			version = value
		}
	}
	info, err := os.Stat(candidate)
	if err != nil {
		return version, 0
	}
	return version, info.ModTime().UnixNano()
}
