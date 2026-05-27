// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.ModCDPClientTypedEventInference.ts
// - ./python/tests/test_ModCDPClientTypedEventInference.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package client

import "testing"

func TestTypedCDPEventTokensInferCallbackPayloadsWithoutLocalTypeAliases(t *testing.T) {
	cdp := New(Config{
		Launcher:     LauncherConfig{LauncherMode: "none"},
		Upstream:     UpstreamTransportConfig{UpstreamMode: "ws"},
		Injector:     InjectorConfig{InjectorMode: "none"},
		ServerConfig: ServerConfigNone,
	})
	seen := make(chan string, 1)

	cdp.Target.On.TargetCreated(func(event TargetTargetCreatedEvent) {
		seen <- string(event.TargetInfo.TargetID)
	})

	cdp.handleEventMessage(map[string]any{
		"method": "Target.targetCreated",
		"params": map[string]any{
			"targetInfo": map[string]any{
				"targetId":        "target-1",
				"type":            "page",
				"title":           "Example",
				"url":             "https://example.com",
				"attached":        true,
				"canAccessOpener": false,
			},
		},
	})

	if got := <-seen; got != "target-1" {
		t.Fatalf("seen = %q", got)
	}
}
