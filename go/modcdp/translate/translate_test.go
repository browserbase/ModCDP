// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.translate.ts
// - ./python/tests/test_translate.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package translate

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/browserbase/modcdp/go/modcdp/types"
)

func TestTranslateRoutesWrapsAndUnwrapsModCDPProtocolMessagesDeterministically(t *testing.T) {
	if RouteFor("Browser.getVersion", map[string]string{"Browser.*": "direct_cdp", "*.*": "service_worker"}) != "direct_cdp" {
		t.Fatal("Browser.getVersion route mismatch")
	}
	if RouteFor("Target.getTargets", map[string]string{"Browser.*": "direct_cdp", "*.*": "service_worker"}) != "service_worker" {
		t.Fatal("Target.getTargets route mismatch")
	}
	if RouteFor("Browser.getVersion", nil) != "direct_cdp" {
		t.Fatal("Browser.getVersion default route mismatch")
	}

	direct, err := WrapCommandIfNeeded("Browser.getVersion", map[string]any{}, map[string]string{"*.*": "direct_cdp"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if direct.Target != "direct_cdp" || len(direct.Steps) != 1 || direct.Steps[0].Method != "Browser.getVersion" {
		t.Fatalf("direct = %#v", direct)
	}

	wrapped, err := WrapCommandIfNeeded(
		"Mod.evaluate",
		map[string]any{"expression": "({ ok: true })", "params": map[string]any{"value": 1}},
		DefaultClientRoutes(),
		"session-1",
	)
	if err != nil {
		t.Fatal(err)
	}
	if wrapped.Target != "service_worker" {
		t.Fatalf("wrapped.Target = %q", wrapped.Target)
	}
	if wrapped.Steps[0].Method != "Runtime.callFunctionOn" {
		t.Fatalf("wrapped step = %#v", wrapped.Steps[0])
	}
	if !strings.Contains(stringValue(wrapped.Steps[0].Params["functionDeclaration"]), "globalThis.ModCDP.handleCommand") {
		t.Fatalf("functionDeclaration = %s", wrapped.Steps[0].Params["functionDeclaration"])
	}
	wrappedArguments := wrapped.Steps[0].Params["arguments"].([]map[string]any)
	var wrappedPayload map[string]any
	if err := json.Unmarshal([]byte(wrappedArguments[1]["value"].(string)), &wrappedPayload); err != nil {
		t.Fatal(err)
	}
	if wrappedPayload["expression"] != "({ ok: true })" || wrappedPayload["params"].(map[string]any)["value"].(float64) != 1 {
		t.Fatalf("wrapped payload = %#v", wrappedPayload)
	}
	if wrappedArguments[2]["value"] != "session-1" {
		t.Fatalf("session argument = %#v", wrappedArguments[2])
	}
	if wrapped.Steps[0].Unwrap != "runtime_json" {
		t.Fatalf("unwrap = %q", wrapped.Steps[0].Unwrap)
	}

	configured, err := WrapCommandIfNeeded("Mod.configure", map[string]any{"router": map[string]any{"router_routes": map[string]any{"*.*": "loopback_cdp"}}}, DefaultClientRoutes(), "session-1")
	if err != nil {
		t.Fatal(err)
	}
	if configured.Steps[0].Unwrap != "runtime_json" {
		t.Fatalf("configure unwrap = %q", configured.Steps[0].Unwrap)
	}

	ping, err := WrapCommandIfNeeded("Mod.ping", map[string]any{}, DefaultClientRoutes(), "")
	if err != nil {
		t.Fatal(err)
	}
	pingArguments := ping.Steps[0].Params["arguments"].([]map[string]any)
	var pingPayload map[string]any
	if err := json.Unmarshal([]byte(pingArguments[1]["value"].(string)), &pingPayload); err != nil {
		t.Fatal(err)
	}
	if len(pingPayload) != 0 {
		t.Fatalf("ping params = %#v", pingPayload)
	}

	custom, err := WrapCommandIfNeeded(
		"Custom.echo",
		map[string]any{"secret": strings.Repeat("x", 100), "nested": map[string]any{"ok": true}},
		DefaultClientRoutes(),
		"session-1",
	)
	if err != nil {
		t.Fatal(err)
	}
	customParams := custom.Steps[0].Params
	if !strings.Contains(stringValue(customParams["functionDeclaration"]), "JSON.parse(paramsJson)") {
		t.Fatalf("functionDeclaration = %s", customParams["functionDeclaration"])
	}
	if strings.Contains(stringValue(customParams["functionDeclaration"]), "xxxxxxxxxx") {
		t.Fatalf("functionDeclaration includes custom params: %s", customParams["functionDeclaration"])
	}
	customArguments := customParams["arguments"].([]map[string]any)
	if customArguments[0]["value"] != "Custom.echo" {
		t.Fatalf("method argument = %#v", customArguments[0])
	}
	var customPayload map[string]any
	if err := json.Unmarshal([]byte(customArguments[1]["value"].(string)), &customPayload); err != nil {
		t.Fatal(err)
	}
	if customPayload["secret"] != strings.Repeat("x", 100) || customPayload["nested"].(map[string]any)["ok"] != true {
		t.Fatalf("params argument = %#v", customPayload)
	}
	if customArguments[2]["value"] != "session-1" {
		t.Fatalf("session argument = %#v", customArguments[2])
	}

	customWithSession, err := WrapCommandIfNeeded(
		"Custom.echo",
		map[string]any{"secret": "targeted"},
		DefaultClientRoutes(),
		"target-session-1",
	)
	if err != nil {
		t.Fatal(err)
	}
	customWithSessionArguments := customWithSession.Steps[0].Params["arguments"].([]map[string]any)
	if customWithSessionArguments[2]["value"] != "target-session-1" {
		t.Fatalf("target session argument = %#v", customWithSessionArguments[2])
	}

	unwrapped, err := UnwrapResponseIfNeeded(map[string]any{"result": map[string]any{"type": "object", "value": map[string]any{"ok": true}}}, "runtime")
	if err != nil {
		t.Fatal(err)
	}
	if unwrapped.(map[string]any)["ok"] != true {
		t.Fatalf("unwrapped = %#v", unwrapped)
	}
	raw, err := UnwrapResponseIfNeeded(map[string]any{"product": "Chrome/1"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if raw.(map[string]any)["product"] != "Chrome/1" {
		t.Fatalf("raw = %#v", raw)
	}

	payloadSessionID := "session-2"
	payload, err := EncodeBindingPayload(types.ModCDPBindingPayload{
		Event:        "Custom.ready",
		Data:         map[string]any{"ready": true},
		CDPSessionID: &payloadSessionID,
	})
	if err != nil {
		t.Fatal(err)
	}
	unwrappedEvent, ok := UnwrapEventIfNeeded(
		"Runtime.bindingCalled",
		map[string]any{"name": CustomEventBindingName, "payload": payload},
		"session-1",
		"session-1",
	)
	if !ok || unwrappedEvent.Event != "Custom.ready" || unwrappedEvent.Data.(map[string]any)["ready"] != true || unwrappedEvent.SessionID == nil || *unwrappedEvent.SessionID != "session-2" {
		t.Fatalf("unwrappedEvent=%#v ok=%v", unwrappedEvent, ok)
	}
	if _, ok := UnwrapEventIfNeeded("Runtime.consoleAPICalled", map[string]any{"name": CustomEventBindingName, "payload": payload}, "", ""); ok {
		t.Fatal("expected console event to ignore binding payload")
	}
}
