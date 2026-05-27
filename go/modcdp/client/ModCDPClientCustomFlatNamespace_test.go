// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.ModCDPClientCustomFlatNamespace.ts
// - ./python/tests/test_ModCDPClientCustomFlatNamespace.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package client

import (
	"path/filepath"
	"testing"
	"time"

	abxjsonschema "github.com/ArchiveBox/abxbus/abxbus-go/v2/jsonschema"
)

func TestCustomCommandsInstallFlatNamespaceThroughRealServiceWorker(t *testing.T) {
	type ParamsSchema struct {
		ID string `json:"id"`
	}
	type ResultSchema struct {
		Success bool `json:"success"`
	}

	extensionPath, err := filepath.Abs(filepath.Join("..", "..", "..", "dist", "extension"))
	if err != nil {
		t.Fatal(err)
	}
	cdp := New(Config{
		Launcher: LauncherConfig{
			LauncherMode:          "local",
			LauncherLocalHeadless: boolPtr(true),
		},
		Upstream: UpstreamTransportConfig{UpstreamMode: "ws"},
		Injector: InjectorConfig{
			InjectorMode:                     "cli",
			InjectorCLIExtensionPath:         extensionPath,
			InjectorServiceWorkerURLSuffixes: []string{"/modcdp/service_worker.js"},
			InjectorTrustServiceWorkerTarget: true,
		},
		Router: RouterConfig{RouterRoutes: map[string]string{
			"Mod.*":    "service_worker",
			"Custom.*": "service_worker",
			"*.*":      "direct_cdp",
		}},
		ServerConfig: &ServerConfig{Router: RouterConfig{RouterRoutes: map[string]string{"*.*": "loopback_cdp"}}},
	})
	defer cdp.Close()

	if err := cdp.Connect(); err != nil {
		t.Fatal(err)
	}
	registered, err := cdp.Mod.AddCustomCommand(CustomCommand{
		Name:         "Custom.doSomething",
		ParamsSchema: abxjsonschema.SchemaFor[ParamsSchema](),
		ResultSchema: abxjsonschema.SchemaFor[ResultSchema](),
		Expression:   "async ({ id }) => ({ success: id === 'abc' })",
	})
	if err != nil {
		t.Fatal(err)
	}
	registration, ok := registered.(map[string]any)
	if !ok || registration["name"] != "Custom.doSomething" || registration["registered"] != true {
		t.Fatalf("unexpected custom command registration: %#v", registered)
	}
	result, err := cdp.Send("Custom.doSomething", map[string]any{"id": "abc"})
	if err != nil {
		t.Fatal(err)
	}
	resultMap, ok := result.(map[string]any)
	if !ok || resultMap["success"] != true {
		t.Fatalf("Custom.doSomething = %#v", result)
	}
	if _, err := cdp.Send("Custom.doSomething", map[string]any{"id": 123}); err == nil {
		t.Fatal("expected custom command params schema to reject non-string id")
	}
}

func TestCustomEventsValidateRawStringHandlersThroughRealServiceWorker(t *testing.T) {
	type EventSchema struct {
		Data string `json:"data"`
	}

	extensionPath, err := filepath.Abs(filepath.Join("..", "..", "..", "dist", "extension"))
	if err != nil {
		t.Fatal(err)
	}
	cdp := New(Config{
		Launcher: LauncherConfig{
			LauncherMode:          "local",
			LauncherLocalHeadless: boolPtr(true),
		},
		Upstream: UpstreamTransportConfig{UpstreamMode: "ws"},
		Injector: InjectorConfig{
			InjectorMode:                     "cli",
			InjectorCLIExtensionPath:         extensionPath,
			InjectorServiceWorkerURLSuffixes: []string{"/modcdp/service_worker.js"},
			InjectorTrustServiceWorkerTarget: true,
		},
		Router: RouterConfig{RouterRoutes: map[string]string{
			"Mod.*":    "service_worker",
			"Custom.*": "service_worker",
			"*.*":      "direct_cdp",
		}},
		ServerConfig: &ServerConfig{Router: RouterConfig{RouterRoutes: map[string]string{"*.*": "loopback_cdp"}}},
	})
	defer cdp.Close()

	if err := cdp.Connect(); err != nil {
		t.Fatal(err)
	}
	registered, err := cdp.Mod.AddCustomEvent(CustomEvent{
		Name:        "Custom.someEvent",
		EventSchema: abxjsonschema.SchemaFor[EventSchema](),
	})
	if err != nil {
		t.Fatal(err)
	}
	registration, ok := registered.(map[string]any)
	if !ok || registration["name"] != "Custom.someEvent" || registration["registered"] != true {
		t.Fatalf("unexpected custom event registration: %#v", registered)
	}
	seen := make(chan string, 1)
	cdp.On("Custom.someEvent", func(data any) {
		event, _ := data.(map[string]any)
		if event != nil {
			seen <- event["data"].(string)
		}
	})
	if _, err := cdp.Mod.Evaluate(map[string]any{
		"expression": "async () => globalThis.__ModCDP_custom_event__(JSON.stringify({ event: 'Custom.someEvent', data: { data: 'ok' }, cdpSessionId: null }))",
	}); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-seen:
		if got != "ok" {
			t.Fatalf("Custom.someEvent data = %q", got)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for Custom.someEvent")
	}
}

func TestSchemaOnlyAddCustomCommandRegistersWithoutConnection(t *testing.T) {
	cdp := New(Config{})
	result, err := cdp.Mod.AddCustomCommand(CustomCommand{
		Name: "Custom.echo",
		ParamsSchema: map[string]any{
			"type":                 "object",
			"required":             []any{"text"},
			"properties":           map[string]any{"text": map[string]any{"type": "string", "minLength": 1}},
			"additionalProperties": false,
		},
		ResultSchema: map[string]any{
			"type":                 "object",
			"required":             []any{"text"},
			"properties":           map[string]any{"text": map[string]any{"type": "string"}},
			"additionalProperties": false,
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	registration, ok := result.(map[string]any)
	if !ok || registration["name"] != "Custom.echo" || registration["registered"] != true {
		t.Fatalf("unexpected schema-only registration result: %#v", result)
	}
	if _, err := cdp.Types.ParseCommandParams("Custom.echo", map[string]any{"text": "ok"}); err != nil {
		t.Fatalf("expected registered schema to validate params, got %v", err)
	}
	if _, err := cdp.Types.ParseCommandParams("Custom.echo", map[string]any{"text": ""}); err == nil {
		t.Fatal("expected registered schema to reject wrong params")
	}
	if _, err := cdp.Types.ParseCommandParams("Custom.echo", map[string]any{"text": "ok", "extra": true}); err == nil {
		t.Fatal("expected registered schema to reject extra params")
	}
	if _, err := cdp.Types.ParseCommandResult("Custom.echo", map[string]any{"text": "ok"}); err != nil {
		t.Fatalf("expected registered schema to validate result, got %v", err)
	}
	if _, err := cdp.Types.ParseCommandResult("Custom.echo", map[string]any{"text": 123}); err == nil {
		t.Fatal("expected registered schema to reject wrong result")
	}
}

func TestConstructorCustomCommandAndEventSchemasValidateNestedPayloads(t *testing.T) {
	cdp := New(Config{
		Launcher:     LauncherConfig{LauncherMode: "none"},
		Upstream:     UpstreamTransportConfig{UpstreamMode: "ws"},
		Injector:     InjectorConfig{InjectorMode: "none"},
		ServerConfig: ServerConfigNone,
		Types: &CDPTypesConfig{
			CustomCommands: []CustomCommand{{
				Name: "Custom.collect",
				ParamsSchema: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"items": map[string]any{
							"type":     "array",
							"minItems": 1,
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"id":    map[string]any{"type": "string"},
									"count": map[string]any{"type": "integer", "minimum": 1},
								},
								"required":             []any{"id", "count"},
								"additionalProperties": false,
							},
						},
					},
					"required":             []any{"items"},
					"additionalProperties": false,
				},
			}},
			CustomEvents: []CustomEvent{
				{
					Name: "Custom.ready",
					EventSchema: map[string]any{
						"type": "object",
						"properties": map[string]any{
							"url":   map[string]any{"type": "string", "pattern": "^https://"},
							"ready": map[string]any{"type": "boolean"},
						},
						"required":             []any{"url", "ready"},
						"additionalProperties": false,
					},
				},
				{Name: "Custom.count", EventSchema: map[string]any{"type": "integer", "minimum": 1}},
			},
		},
	})

	validParams := map[string]any{"items": []any{map[string]any{"id": "a", "count": 1}}}
	if _, err := cdp.Types.ParseCommandParams("Custom.collect", validParams); err != nil {
		t.Fatalf("expected Custom.collect params to validate: %v", err)
	}
	if _, err := cdp.Types.ParseCommandParams("Custom.collect", map[string]any{"items": []any{map[string]any{"id": "a", "count": 0}}}); err == nil {
		t.Fatal("expected Custom.collect params to reject count below minimum")
	}
	if _, err := cdp.Types.ParseCommandParams("Custom.collect", map[string]any{"items": []any{}}); err == nil {
		t.Fatal("expected Custom.collect params to reject empty items")
	}
	if _, ok := cdp.Types.ParseEventPayload("Custom.ready", map[string]any{"url": "https://example.com", "ready": true}); !ok {
		t.Fatal("expected Custom.ready event to validate")
	}
	expectPanic(t, func() {
		cdp.Types.ParseEventPayload("Custom.ready", map[string]any{"url": "http://example.com", "ready": true})
	})
	if _, ok := cdp.Types.ParseEventPayload("Custom.count", map[string]any{"value": 3}); !ok {
		t.Fatal("expected Custom.count event to validate")
	}
	expectPanic(t, func() { cdp.Types.ParseEventPayload("Custom.count", map[string]any{"value": 0}) })
}

func TestAssignedTypeRegistryUpdatesRuntimeValidationAndAliases(t *testing.T) {
	cdp := New(Config{
		Launcher:     LauncherConfig{LauncherMode: "none"},
		Upstream:     UpstreamTransportConfig{UpstreamMode: "ws"},
		Injector:     InjectorConfig{InjectorMode: "none"},
		ServerConfig: ServerConfigNone,
	})

	cdp.Types = cdp.Types.Update(CDPTypesConfig{
		CustomCommands: []CustomCommand{{
			Name: "Custom.later",
			ParamsSchema: map[string]any{
				"type":                 "object",
				"properties":           map[string]any{"value": map[string]any{"type": "number"}},
				"required":             []any{"value"},
				"additionalProperties": false,
			},
			ResultSchema: map[string]any{
				"type":                 "object",
				"properties":           map[string]any{"ok": map[string]any{"type": "boolean"}},
				"required":             []any{"ok"},
				"additionalProperties": false,
			},
		}},
		CustomEvents: []CustomEvent{{
			Name: "Custom.laterReady",
			EventSchema: map[string]any{
				"type":                 "object",
				"properties":           map[string]any{"value": map[string]any{"type": "string"}},
				"required":             []any{"value"},
				"additionalProperties": false,
			},
		}},
	})

	if _, ok := cdp.Types.CustomCommands["Custom.later"]; !ok {
		t.Fatal("expected Custom.later registry entry")
	}
	if _, err := cdp.Types.ParseCommandParams("Custom.later", map[string]any{"value": 1}); err != nil {
		t.Fatalf("expected Custom.later params to validate: %v", err)
	}
	if _, err := cdp.Types.ParseCommandResult("Custom.later", map[string]any{"ok": true}); err != nil {
		t.Fatalf("expected Custom.later result to validate: %v", err)
	}
	if _, ok := cdp.Types.ParseEventPayload("Custom.laterReady", map[string]any{"value": "ok"}); !ok {
		t.Fatal("expected Custom.laterReady event to validate")
	}
}

func expectPanic(t *testing.T, fn func()) {
	t.Helper()
	defer func() {
		if recover() == nil {
			t.Fatal("expected panic")
		}
	}()
	fn()
}
