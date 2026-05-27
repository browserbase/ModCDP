// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.CDPTypes_payload_schema_normalization.ts
// - ./python/tests/test_CDPTypes_payload_schema_normalization.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package client

import (
	"strings"
	"testing"

	abxjsonschema "github.com/ArchiveBox/abxbus/abxbus-go/v2/jsonschema"
)

func TestValidateZodSchemaAcceptsEmptyZodShapes(t *testing.T) {
	schema := cloneSchema(map[string]any{})
	if schema == nil {
		t.Fatal("expected empty schema object to normalize")
	}
	if err := abxjsonschema.Validate(schema, map[string]any{"value": 1}); err != nil {
		t.Fatalf("expected empty schema to accept payload: %v", err)
	}
}

func TestValidateZodSchemaRejectsUnsupportedSchemaSpecs(t *testing.T) {
	_, err := New(Config{}).Send("Mod.addCustomCommand", map[string]any{
		"name":          "Custom.bad",
		"params_schema": "not-a-schema",
	})
	if err == nil || !strings.Contains(err.Error(), "params_schema") {
		t.Fatalf("expected unsupported schema error, got %v", err)
	}
}

func TestValidateZodSchemaAcceptsNonEmptyZodShapes(t *testing.T) {
	schema := cloneSchema(map[string]any{
		"type":       "object",
		"required":   []any{"value"},
		"properties": map[string]any{"value": map[string]any{"type": "string"}},
	})
	if schema == nil {
		t.Fatal("expected schema object to normalize")
	}
	if err := abxjsonschema.Validate(schema, map[string]any{"value": "ok", "extra": true}); err != nil {
		t.Fatalf("expected valid payload: %v", err)
	}
	if err := abxjsonschema.Validate(schema, map[string]any{"value": 1}); err == nil {
		t.Fatal("expected invalid payload to fail validation")
	}
}

func TestCDPTypesSerializesBuiltinModCommandSchemasThroughTheSameWirePath(t *testing.T) {
	types := NewCDPTypes(nil, nil, nil)
	for _, name := range []string{"Mod.configure", "Mod.addCustomCommand", "Mod.addCustomEvent"} {
		registration := types.CustomCommandWireRegistration(name)
		if _, ok := registration["params_schema"].(map[string]any); !ok {
			t.Fatalf("%s params_schema = %T", name, registration["params_schema"])
		}
		if _, ok := registration["result_schema"].(map[string]any); !ok {
			t.Fatalf("%s result_schema = %T", name, registration["result_schema"])
		}
	}

	parsedConfig, err := types.ParseCommandParams("Mod.configure", map[string]any{
		"client_config": map[string]any{"client_hydrate_aliases": false},
		"upstream":      map[string]any{"upstream_mode": "ws", "upstream_ws_cdp_url": "ws://127.0.0.1:9222/devtools/browser/test"},
	})
	if err != nil {
		t.Fatal(err)
	}
	clientConfig, ok := parsedConfig["client_config"].(map[string]any)
	if !ok || clientConfig["client_hydrate_aliases"] != false {
		t.Fatalf("client_config = %#v", parsedConfig["client_config"])
	}
	upstream, ok := parsedConfig["upstream"].(map[string]any)
	if !ok {
		t.Fatalf("upstream = %#v", parsedConfig["upstream"])
	}
	if upstream["upstream_mode"] != "ws" || upstream["upstream_ws_cdp_url"] != "ws://127.0.0.1:9222/devtools/browser/test" {
		t.Fatalf("upstream = %#v", upstream)
	}
	_, err = types.ParseCommandParams("Mod.configure", map[string]any{
		"upstream": map[string]any{
			"upstream_mode": "nats",
		},
	})
	if err == nil || !strings.Contains(err.Error(), "enum") {
		t.Fatalf("expected unsupported upstream mode to be rejected, got %v", err)
	}
}
