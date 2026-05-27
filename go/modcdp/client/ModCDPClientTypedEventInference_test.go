// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.ModCDPClientTypedEventInference.ts
// - ./python/tests/test_ModCDPClientTypedEventInference.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package client

import "testing"

func TestTypedCDPEventsWrapRawHandlers(t *testing.T) {
	cdp := New(Config{})
	typedEvents := make(chan TargetTargetCreatedEvent, 1)
	rawEvents := make(chan any, 1)

	cdp.Target.On.TargetCreated(func(event TargetTargetCreatedEvent) {
		typedEvents <- event
	})
	cdp.On("Target.targetCreated", func(event any) {
		rawEvents <- event
	})

	payload := map[string]any{
		"targetInfo": map[string]any{
			"targetId": "target-1",
			"type":     "page",
			"url":      "https://example.com",
		},
	}
	for _, entry := range cdp.handlers["Target.targetCreated"] {
		entry.handler(payload)
	}

	typed := <-typedEvents
	if typed.TargetID() != "target-1" || typed.TargetInfo.URL != "https://example.com" {
		t.Fatalf("unexpected typed event: %#v", typed)
	}
	raw := <-rawEvents
	rawMap, ok := raw.(map[string]any)
	if !ok || rawMap["targetInfo"] == nil {
		t.Fatalf("unexpected raw event: %#v", raw)
	}
}
