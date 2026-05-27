// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.DiscoverExtensionInjector.ts
// - ./python/tests/test_DiscoverExtensionInjector.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package injector_test

import (
	modcdp "github.com/browserbase/modcdp/go/modcdp/client"
	. "github.com/browserbase/modcdp/go/modcdp/injector"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"testing"
)

func TestDiscoverExtensionInjectorAttachesToAnAlreadyLoadedRealModCDPExtension(t *testing.T) {
	extensionPath, err := filepath.Abs(filepath.Join("..", "..", "..", "dist", "extension"))
	if err != nil {
		t.Fatal(err)
	}
	headless := true
	owner := modcdp.New(modcdp.Config{
		Launcher: modcdp.LauncherConfig{LauncherMode: "local", LauncherLocalHeadless: &headless, LauncherLocalExecutablePath: loadExtensionTestBrowserPath(t)},
		Upstream: modcdp.UpstreamTransportConfig{UpstreamMode: "ws"},
		Injector: modcdp.InjectorConfig{
			InjectorMode:                     "cli",
			InjectorCLIExtensionPath:         extensionPath,
			InjectorServiceWorkerURLSuffixes: []string{"/modcdp/service_worker.js"},
			InjectorTrustServiceWorkerTarget: true,
		},
	})
	defer owner.Close()

	if err := owner.Connect(); err != nil {
		t.Fatal(err)
	}
	cdp := modcdp.New(modcdp.Config{
		Launcher: modcdp.LauncherConfig{LauncherMode: "remote", LauncherRemoteCDPURL: owner.CDPURL},
		Upstream: modcdp.UpstreamTransportConfig{UpstreamMode: "ws", UpstreamWSCDPURL: owner.CDPURL},
		Injector: modcdp.InjectorConfig{
			InjectorMode:                     "discover",
			InjectorServiceWorkerURLSuffixes: []string{"/modcdp/service_worker.js"},
			InjectorTrustServiceWorkerTarget: true,
		},
	})
	defer cdp.Close()

	if err := cdp.Connect(); err != nil {
		t.Fatal(err)
	}
	if cdp.ConnectTiming["injector_source"] != "discover" {
		t.Fatalf("injector_source = %v", cdp.ConnectTiming["injector_source"])
	}
	if cdp.Injector.ExtensionID != DefaultModCDPExtensionID {
		t.Fatalf("Injector.ExtensionID = %q", cdp.Injector.ExtensionID)
	}
	result, err := cdp.Mod.Evaluate(map[string]any{
		"expression": "chrome.runtime.getURL('modcdp/service_worker.js')",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result != "chrome-extension://mdedooklbnfejodmnhmkdpkaedafkehf/modcdp/service_worker.js" {
		t.Fatalf("Mod.evaluate = %#v", result)
	}
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
