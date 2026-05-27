// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.BBExtensionInjector.ts
// - ./python/tests/test_BBExtensionInjector.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package injector_test

import (
	"fmt"
	modcdp "github.com/browserbase/modcdp/go/modcdp/client"
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

func TestUploadsTheRealExtensionAndLaunchesABrowserbaseBrowserWithItInstalled(t *testing.T) {
	if os.Getenv("BROWSERBASE_API_KEY") == "" {
		t.Fatal("BROWSERBASE_API_KEY is required for live Browserbase tests")
	}
	extensionPath, err := filepath.Abs("../../../dist/extension")
	if err != nil {
		t.Fatal(err)
	}
	launchConfig := modcdp.LauncherConfig{
		LauncherMode:      "bb",
		LauncherBBTimeout: 120,
	}
	if region := os.Getenv("BROWSERBASE_REGION"); region != "" {
		launchConfig.LauncherBBRegion = region
	}
	cdp := modcdp.New(modcdp.Config{
		Launcher: launchConfig,
		Upstream: modcdp.UpstreamTransportConfig{UpstreamMode: "ws"},
		Injector: modcdp.InjectorConfig{
			InjectorMode:                     "bb",
			InjectorBBExtensionPath:          extensionPath,
			InjectorServiceWorkerURLSuffixes: []string{"/modcdp/service_worker.js"},
			InjectorTrustServiceWorkerTarget: true,
		},
	})
	defer cdp.Close()

	if err := cdp.Connect(); err != nil {
		t.Fatal(err)
	}
	if cdp.ConnectTiming["injector_source"] != "bb" {
		t.Fatalf("injector_source = %v", cdp.ConnectTiming["injector_source"])
	}
	if cdp.Injector.ExtensionID == "" {
		t.Fatal("expected Injector.ExtensionID")
	}
	result, err := cdp.Mod.Evaluate(map[string]any{
		"expression": "chrome.runtime.getURL('modcdp/service_worker.js')",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`^chrome-extension://[a-z]{32}/modcdp/service_worker\.js$`).MatchString(fmt.Sprint(result)) {
		t.Fatalf("service worker url = %#v", result)
	}
}
