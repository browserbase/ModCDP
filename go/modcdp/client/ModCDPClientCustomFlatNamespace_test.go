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

func TestCustomCommandsInstallFlatNamespaceMethodsThroughARealServiceWorker(t *testing.T) {
	type ParamsSchema struct {
		ID     string `json:"id"`
		Suffix string `json:"suffix,omitempty"`
	}
	type ResultSchema struct {
		Success bool `json:"success"`
	}
	type BadResultParamsSchema struct {
		ID string `json:"id"`
	}

	extensionPath, err := filepath.Abs(filepath.Join("..", "..", "..", "dist", "extension"))
	if err != nil {
		t.Fatal(err)
	}
	cdp := New(Config{
		Launcher: LauncherConfig{
			LauncherMode:                "local",
			LauncherLocalHeadless:       boolPtr(true),
			LauncherLocalExecutablePath: reverseWSTestBrowserPath(t),
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
		Types: &CDPTypesConfig{
			CustomCommands: []CustomCommand{
				{
					Name:         "Custom.doSomething",
					ParamsSchema: abxjsonschema.SchemaFor[ParamsSchema](),
					ResultSchema: abxjsonschema.SchemaFor[ResultSchema](),
					Expression:   "async ({ id, suffix = '' }) => ({ success: `${id}${suffix}` === 'abcmiddleware' })",
				},
				{
					Name:         "Custom.badResult",
					ParamsSchema: abxjsonschema.SchemaFor[BadResultParamsSchema](),
					ResultSchema: abxjsonschema.SchemaFor[ResultSchema](),
					Expression:   "async () => ({ success: 'yes' })",
				},
			},
			CustomMiddlewares: []CustomMiddleware{
				{
					Name:       "Custom.doSomething",
					Phase:      "request",
					Expression: "async (payload, next) => next({ ...payload, suffix: 'middleware' })",
				},
			},
		},
	})
	defer cdp.Close()

	if err := cdp.Connect(); err != nil {
		t.Fatal(err)
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
	if _, err := cdp.Send("Custom.badResult", map[string]any{"id": "abc"}); err == nil {
		t.Fatal("expected Custom.badResult result validation error")
	}
}

func TestCustomEventsValidateRawStringHandlersThroughARealServiceWorker(t *testing.T) {
	type EventSchema struct {
		Data string `json:"data"`
	}

	extensionPath, err := filepath.Abs(filepath.Join("..", "..", "..", "dist", "extension"))
	if err != nil {
		t.Fatal(err)
	}
	cdp := New(Config{
		Launcher: LauncherConfig{
			LauncherMode:                "local",
			LauncherLocalHeadless:       boolPtr(true),
			LauncherLocalExecutablePath: reverseWSTestBrowserPath(t),
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

func TestDynamicCustomCommandEventAndMiddlewareRegistrationValidatesThroughARealServiceWorker(t *testing.T) {
	extensionPath, err := filepath.Abs(filepath.Join("..", "..", "..", "dist", "extension"))
	if err != nil {
		t.Fatal(err)
	}
	cdp := New(Config{
		Launcher: LauncherConfig{
			LauncherMode:                "local",
			LauncherLocalHeadless:       boolPtr(true),
			LauncherLocalExecutablePath: reverseWSTestBrowserPath(t),
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
	if result, err := cdp.Mod.AddCustomCommand(CustomCommand{
		Name: "Custom.dynamic",
		ParamsSchema: map[string]any{
			"type":                 "object",
			"properties":           map[string]any{"text": map[string]any{"type": "string", "minLength": 1}},
			"required":             []any{"text"},
			"additionalProperties": false,
		},
		ResultSchema: map[string]any{
			"type":                 "object",
			"properties":           map[string]any{"ok": map[string]any{"type": "boolean"}},
			"required":             []any{"ok"},
			"additionalProperties": false,
		},
		Expression: "async ({ text }) => ({ ok: text === 'live-dynamic' })",
	}); err != nil {
		t.Fatal(err)
	} else {
		assertRegistration(t, result, "Custom.dynamic", "registered")
	}
	if result, err := cdp.Mod.AddCustomCommand(CustomCommand{
		Name: "Custom.dynamicBadResult",
		ParamsSchema: map[string]any{
			"type":                 "object",
			"properties":           map[string]any{"text": map[string]any{"type": "string"}},
			"required":             []any{"text"},
			"additionalProperties": false,
		},
		ResultSchema: map[string]any{
			"type":                 "object",
			"properties":           map[string]any{"ok": map[string]any{"type": "boolean"}},
			"required":             []any{"ok"},
			"additionalProperties": false,
		},
		Expression: "async () => ({ ok: 'yes' })",
	}); err != nil {
		t.Fatal(err)
	} else {
		assertRegistration(t, result, "Custom.dynamicBadResult", "registered")
	}
	if result, err := cdp.Mod.AddCustomEvent(CustomEvent{
		Name: "Custom.dynamicReady",
		EventSchema: map[string]any{
			"type":                 "object",
			"properties":           map[string]any{"id": map[string]any{"type": "string", "format": "uuid"}},
			"required":             []any{"id"},
			"additionalProperties": false,
		},
	}); err != nil {
		t.Fatal(err)
	} else {
		assertRegistration(t, result, "Custom.dynamicReady", "registered")
	}
	if result, err := cdp.Mod.AddMiddleware(CustomMiddleware{
		Name:       "Custom.dynamic",
		Phase:      "request",
		Expression: "async (payload, next) => next({ ...payload, text: `${payload.text}-dynamic` })",
	}); err != nil {
		t.Fatal(err)
	} else {
		assertRegistration(t, result, "Custom.dynamic", "request")
	}

	result, err := cdp.Send("Custom.dynamic", map[string]any{"text": "live"})
	if err != nil {
		t.Fatal(err)
	}
	resultMap, ok := result.(map[string]any)
	if !ok || resultMap["ok"] != true {
		t.Fatalf("Custom.dynamic = %#v", result)
	}
	if _, err := cdp.Send("Custom.dynamic", map[string]any{"text": ""}); err == nil {
		t.Fatal("expected Custom.dynamic empty text validation error")
	}
	if _, err := cdp.Send("Custom.dynamicBadResult", map[string]any{"text": "live"}); err == nil {
		t.Fatal("expected Custom.dynamicBadResult result validation error")
	}
	if _, err := cdp.Mod.AddMiddleware(CustomMiddleware{Name: "Custom.dynamic", Phase: "after", Expression: "async (payload, next) => next(payload)"}); err == nil {
		t.Fatal("expected invalid middleware phase validation error")
	}

	seen := make(chan string, 1)
	cdp.On("Custom.dynamicReady", func(any) { seen <- "ready" })
	if _, err := cdp.Mod.Evaluate(map[string]any{
		"expression": "async () => globalThis.__ModCDP_custom_event__(JSON.stringify({ event: 'Custom.dynamicReady', data: { id: '550e8400-e29b-41d4-a716-446655440000' }, cdpSessionId: null }))",
	}); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-seen:
		if got != "ready" {
			t.Fatalf("Custom.dynamicReady = %q", got)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for Custom.dynamicReady")
	}
}

func TestAssignedTypeRegistryValidatesUpdatedCustomCommandEventAndMiddlewareSchemasThroughARealServiceWorker(t *testing.T) {
	extensionPath, err := filepath.Abs(filepath.Join("..", "..", "..", "dist", "extension"))
	if err != nil {
		t.Fatal(err)
	}
	cdp := New(Config{
		Launcher: LauncherConfig{
			LauncherMode:                "local",
			LauncherLocalHeadless:       boolPtr(true),
			LauncherLocalExecutablePath: reverseWSTestBrowserPath(t),
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
	cdp.Types = cdp.Types.Update(CDPTypesConfig{
		CustomCommands: []CustomCommand{
			{
				Name: "Custom.updated",
				ParamsSchema: map[string]any{
					"type":                 "object",
					"properties":           map[string]any{"count": map[string]any{"type": "integer", "minimum": 0}},
					"required":             []any{"count"},
					"additionalProperties": false,
				},
				ResultSchema: map[string]any{
					"type":                 "object",
					"properties":           map[string]any{"done": map[string]any{"type": "boolean"}},
					"required":             []any{"done"},
					"additionalProperties": false,
				},
				Expression: "async ({ count }) => ({ done: count === 2 })",
			},
			{
				Name: "Custom.updatedBadResult",
				ParamsSchema: map[string]any{
					"type":                 "object",
					"properties":           map[string]any{"count": map[string]any{"type": "number"}},
					"required":             []any{"count"},
					"additionalProperties": false,
				},
				ResultSchema: map[string]any{
					"type":                 "object",
					"properties":           map[string]any{"done": map[string]any{"type": "boolean"}},
					"required":             []any{"done"},
					"additionalProperties": false,
				},
				Expression: "async () => ({ done: 'yes' })",
			},
		},
		CustomEvents: []CustomEvent{{
			Name: "Custom.updatedReady",
			EventSchema: map[string]any{
				"type":                 "object",
				"properties":           map[string]any{"ready": map[string]any{"type": "boolean"}},
				"required":             []any{"ready"},
				"additionalProperties": false,
			},
		}},
		CustomMiddlewares: []CustomMiddleware{{
			Name:       "Custom.updated",
			Phase:      "request",
			Expression: "async (payload, next) => next({ ...payload, count: payload.count + 1 })",
		}},
	})
	defer cdp.Close()

	if err := cdp.Connect(); err != nil {
		t.Fatal(err)
	}
	result, err := cdp.Send("Custom.updated", map[string]any{"count": 1})
	if err != nil {
		t.Fatal(err)
	}
	resultMap, ok := result.(map[string]any)
	if !ok || resultMap["done"] != true {
		t.Fatalf("Custom.updated = %#v", result)
	}
	if _, err := cdp.Send("Custom.updated", map[string]any{"count": -1}); err == nil {
		t.Fatal("expected Custom.updated count validation error")
	}
	if _, err := cdp.Send("Custom.updatedBadResult", map[string]any{"count": 1}); err == nil {
		t.Fatal("expected Custom.updatedBadResult result validation error")
	}

	seen := make(chan bool, 1)
	cdp.On("Custom.updatedReady", func(any) { seen <- true })
	if _, err := cdp.Mod.Evaluate(map[string]any{
		"expression": "async () => globalThis.__ModCDP_custom_event__(JSON.stringify({ event: 'Custom.updatedReady', data: { ready: true }, cdpSessionId: null }))",
	}); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-seen:
		if !got {
			t.Fatal("Custom.updatedReady got false")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for Custom.updatedReady")
	}
}

func TestServiceWorkerServerValidatesRegisteredCustomCommandAndEventSchemas(t *testing.T) {
	extensionPath, err := filepath.Abs(filepath.Join("..", "..", "..", "dist", "extension"))
	if err != nil {
		t.Fatal(err)
	}
	cdp := New(Config{
		Launcher: LauncherConfig{
			LauncherMode:                "local",
			LauncherLocalHeadless:       boolPtr(true),
			LauncherLocalExecutablePath: reverseWSTestBrowserPath(t),
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
	if result, err := cdp.Mod.AddCustomCommand(CustomCommand{
		Name: "Custom.double",
		ParamsSchema: map[string]any{
			"type":                 "object",
			"properties":           map[string]any{"value": map[string]any{"type": "number"}},
			"required":             []any{"value"},
			"additionalProperties": false,
		},
		ResultSchema: map[string]any{
			"type":                 "object",
			"properties":           map[string]any{"value": map[string]any{"type": "number"}},
			"required":             []any{"value"},
			"additionalProperties": false,
		},
		Expression: "async (params) => ({ value: params.value * 2 })",
	}); err != nil {
		t.Fatal(err)
	} else {
		assertRegistration(t, result, "Custom.double", "registered")
	}
	if _, err := cdp.Types.ParseCommandParams("Custom.double", map[string]any{"value": 2}); err != nil {
		t.Fatalf("expected Custom.double params to validate: %v", err)
	}
	if _, err := cdp.Types.ParseCommandResult("Custom.double", map[string]any{"value": 4}); err != nil {
		t.Fatalf("expected Custom.double result to validate: %v", err)
	}
	result, err := cdp.Send("Custom.double", map[string]any{"value": 2})
	if err != nil {
		t.Fatal(err)
	}
	resultMap, ok := result.(map[string]any)
	if !ok || resultMap["value"] != float64(4) {
		t.Fatalf("Custom.double = %#v", result)
	}

	if result, err := cdp.Mod.AddCustomCommand(CustomCommand{
		Name: "Custom.badResult",
		ResultSchema: map[string]any{
			"type":                 "object",
			"properties":           map[string]any{"ok": map[string]any{"type": "boolean"}},
			"required":             []any{"ok"},
			"additionalProperties": false,
		},
		Expression: `async () => ({ ok: "yes" })`,
	}); err != nil {
		t.Fatal(err)
	} else {
		assertRegistration(t, result, "Custom.badResult", "registered")
	}
	if _, err := cdp.Send("Custom.badResult", map[string]any{}); err == nil {
		t.Fatal("expected Custom.badResult result validation error")
	}

	if result, err := cdp.Mod.AddCustomEvent(CustomEvent{
		Name: "Custom.ready",
		EventSchema: map[string]any{
			"type":                 "object",
			"properties":           map[string]any{"ok": map[string]any{"type": "boolean"}},
			"required":             []any{"ok"},
			"additionalProperties": false,
		},
	}); err != nil {
		t.Fatal(err)
	} else {
		assertRegistration(t, result, "Custom.ready", "registered")
	}
	if _, err := cdp.Types.ParseEventPayload("Custom.ready", map[string]any{"ok": true}); err != nil {
		t.Fatalf("expected Custom.ready event to validate: %v", err)
	}
	if _, err := cdp.Types.ParseEventPayload("Custom.ready", map[string]any{"ok": "yes"}); err == nil {
		t.Fatal("expected Custom.ready event validation to reject string ok")
	}

	seen := make(chan bool, 1)
	cdp.On("Custom.ready", func(data any) {
		event, _ := data.(map[string]any)
		if event != nil {
			seen <- event["ok"] == true
		}
	})
	if _, err := cdp.Mod.Evaluate(map[string]any{
		"expression": "async () => globalThis.__ModCDP_custom_event__(JSON.stringify({ event: 'Custom.ready', data: { ok: true }, cdpSessionId: null }))",
	}); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-seen:
		if !got {
			t.Fatal("Custom.ready got false")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for Custom.ready")
	}
}

func TestSchemaOnlyCustomCommandsRegisterWithoutAWebsocket(t *testing.T) {
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
	if _, err := cdp.Types.ParseEventPayload("Custom.ready", map[string]any{"url": "https://example.com", "ready": true}); err != nil {
		t.Fatalf("expected Custom.ready event to validate: %v", err)
	}
	if _, err := cdp.Types.ParseEventPayload("Custom.ready", map[string]any{"url": "http://example.com", "ready": true}); err == nil {
		t.Fatal("expected Custom.ready event validation to reject http url")
	}
	if _, err := cdp.Types.ParseEventPayload("Custom.count", map[string]any{"value": 3}); err != nil {
		t.Fatalf("expected Custom.count event to validate: %v", err)
	}
	if _, err := cdp.Types.ParseEventPayload("Custom.count", map[string]any{"value": 0}); err == nil {
		t.Fatal("expected Custom.count event validation to reject zero value")
	}
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
	if _, err := cdp.Types.ParseEventPayload("Custom.laterReady", map[string]any{"value": "ok"}); err != nil {
		t.Fatalf("expected Custom.laterReady event to validate: %v", err)
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

func assertRegistration(t *testing.T, result any, name string, phase string) {
	t.Helper()
	registration, ok := result.(map[string]any)
	if !ok || registration["name"] != name || registration["registered"] != true {
		t.Fatalf("unexpected registration result: %#v", result)
	}
	if phase != "registered" && registration["phase"] != phase {
		t.Fatalf("unexpected registration phase: %#v", result)
	}
}
