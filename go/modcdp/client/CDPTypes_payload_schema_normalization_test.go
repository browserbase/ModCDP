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
		"downstream": map[string]any{
			"downstream_client_timeout_ms":           1234,
			"downstream_close_browser_on_disconnect": true,
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	clientConfig, ok := parsedConfig["client_config"].(map[string]any)
	if !ok || clientConfig["client_hydrate_aliases"] != false {
		t.Fatalf("client_config = %#v", parsedConfig["client_config"])
	}
	downstream, ok := parsedConfig["downstream"].(map[string]any)
	if !ok {
		t.Fatalf("downstream = %#v", parsedConfig["downstream"])
	}
	if downstream["downstream_client_timeout_ms"] != 1234 || downstream["downstream_close_browser_on_disconnect"] != true {
		t.Fatalf("downstream = %#v", downstream)
	}
	_, err = types.ParseCommandParams("Mod.configure", map[string]any{
		"downstream": map[string]any{
			"closeBrowser": "not allowed over the wire",
		},
	})
	if err == nil || !strings.Contains(err.Error(), "closeBrowser") {
		t.Fatalf("expected closeBrowser to be rejected, got %v", err)
	}
}
