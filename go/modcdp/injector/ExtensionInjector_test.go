// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.ExtensionInjector.ts
// - ./python/tests/test_ExtensionInjector.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package injector_test

import (
	"strings"
	"testing"

	. "github.com/browserbase/modcdp/go/modcdp/injector"
)

func TestExtensionInjectorOwnsSharedInjectorConfig(t *testing.T) {
	injector := NewExtensionInjector(InjectorConfig{
		InjectorServiceWorkerExtensionID: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		InjectorServiceWorkerURLSuffixes: []string{"/modcdp/service_worker.js"},
	})

	if injector.Config.InjectorServiceWorkerExtensionID != "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" {
		t.Fatalf("InjectorServiceWorkerExtensionID = %v", injector.Config.InjectorServiceWorkerExtensionID)
	}
	if len(injector.ConfigForUpstream()) != 0 {
		t.Fatalf("expected empty upstream config")
	}
	if len(injector.ExtraArgs) != 0 {
		t.Fatalf("expected empty extra args")
	}
	if !injector.ServiceWorkerTargetMatches(map[string]any{
		"targetId": "target-1",
		"type":     "service_worker",
		"url":      "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/modcdp/service_worker.js",
	}) {
		t.Fatal("expected service worker target to match")
	}
	if injector.ServiceWorkerTargetMatches(map[string]any{
		"targetId": "target-1",
		"type":     "service_worker",
		"url":      "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/background.js",
	}) {
		t.Fatal("expected background target not to match")
	}
}

func TestExtensionInjectorBaseInjectReportsTheClassName(t *testing.T) {
	injector := NewExtensionInjector(InjectorConfig{})
	if _, err := injector.Inject(); err == nil || !strings.Contains(err.Error(), "ExtensionInjector.Inject is not implemented") {
		t.Fatalf("Inject error = %v", err)
	}
}
