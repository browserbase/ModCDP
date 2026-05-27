// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/ModCDPClient_protocol_validation.test.ts
// - ./python/tests/test_ModCDPClient_protocol_validation.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package client

import (
	"testing"

	abxjsonschema "github.com/ArchiveBox/abxbus/abxbus-go/v2/jsonschema"
)

type protocolValidationSumParams struct {
	Left  int `json:"left"`
	Right int `json:"right"`
}

type protocolValidationSumResult struct {
	Value int `json:"value"`
}

type protocolValidationFinishedEvent struct {
	Total int    `json:"total"`
	Label string `json:"label"`
}

type protocolValidationDynamicResult struct {
	OK bool `json:"ok"`
}

type protocolValidationUpdatedResult struct {
	Done bool `json:"done"`
}

type protocolValidationUpdatedReadyEvent struct {
	Ready bool `json:"ready"`
}

func TestNativeCDPSchemasValidateMethodParamsReturnValuesAndEventPayloadsStaticallyAndAtRuntime(t *testing.T) {
	types := NewCDPTypes(nil, nil, nil)
	cdp := New(Config{
		Launcher:     LauncherConfig{LauncherMode: "none"},
		Upstream:     UpstreamTransportConfig{UpstreamMode: "ws"},
		Injector:     InjectorConfig{InjectorMode: "none"},
		ServerConfig: ServerConfigNone,
	})
	runtimeParams := RuntimeEvaluateParams{Expression: "1 + 1", ReturnByValue: Bool(true)}
	runtimeResult := RuntimeEvaluateResult{Result: RuntimeRemoteObject{Type: "number", Value: 2, Description: String("2")}}
	targetEvent := TargetTargetCreatedEvent{
		TargetInfo: TargetTargetInfo{
			TargetID:        TargetTargetID("target-1"),
			Type:            "page",
			Title:           "Example",
			URL:             "https://example.com",
			Attached:        false,
			CanAccessOpener: false,
		},
	}

	_ = cdp.Runtime
	if _, err := types.ParseCommandParams("Runtime.evaluate", mustParamsMap(t, runtimeParams)); err != nil {
		t.Fatalf("Runtime.evaluate params should validate: %v", err)
	}
	if _, err := types.ParseCommandResult("Runtime.evaluate", runtimeResult); err != nil {
		t.Fatalf("Runtime.evaluate result should validate: %v", err)
	}
	if _, err := types.ParseEventPayload("Target.targetCreated", targetEvent); err != nil {
		t.Fatalf("Target.targetCreated event should validate: %v", err)
	}
	if _, err := types.ParseCommandParams("Runtime.evaluate", map[string]any{"returnByValue": true}); err == nil {
		t.Fatal("expected Runtime.evaluate params validation to reject missing expression")
	}
	if _, err := types.ParseCommandResult("Runtime.evaluate", map[string]any{}); err == nil {
		t.Fatal("expected Runtime.evaluate result validation to reject missing result")
	}
	if _, err := types.ParseEventPayload("Target.targetCreated", map[string]any{
		"targetInfo": map[string]any{
			"targetId":        1,
			"type":            "page",
			"title":           "Example",
			"url":             "https://example.com",
			"attached":        false,
			"canAccessOpener": false,
		},
	}); err == nil {
		t.Fatal("expected Target.targetCreated event validation to reject numeric targetId")
	}
}

func TestModSchemasValidateMethodParamsReturnValuesEventPayloadsAndMiddlewareRegistrationsStaticallyAndAtRuntime(t *testing.T) {
	types := NewCDPTypes(nil, nil, nil)
	pingParams := map[string]any{"sent_at": 123}
	pingResult := map[string]any{"ok": true}
	pongEvent := map[string]any{"sent_at": 123, "received_at": 124, "from": "extension-service-worker"}
	middlewareParams := map[string]any{
		"name":       "Target.getTargets",
		"phase":      "response",
		"expression": "async (payload, next) => next(payload)",
	}
	middlewareResult := map[string]any{"name": "Target.getTargets", "phase": "response", "registered": true}

	if parsed, err := types.ParseCommandParams("Mod.ping", pingParams); err != nil || parsed["sent_at"] != 123 {
		t.Fatalf("Mod.ping params = %#v, %v", parsed, err)
	}
	if parsed, err := types.ParseCommandResult("Mod.ping", pingResult); err != nil {
		t.Fatalf("Mod.ping result should validate: %#v, %v", parsed, err)
	}
	if parsed, err := types.ParseEventPayload("Mod.pong", pongEvent); err != nil || parsed == nil {
		t.Fatalf("Mod.pong event = %#v, %v", parsed, err)
	}
	if parsed, err := types.ParseCommandParams("Mod.addMiddleware", middlewareParams); err != nil || parsed["phase"] != "response" {
		t.Fatalf("Mod.addMiddleware params = %#v, %v", parsed, err)
	}
	if parsed, err := types.ParseCommandResult("Mod.addMiddleware", middlewareResult); err != nil {
		t.Fatalf("Mod.addMiddleware result should validate: %#v, %v", parsed, err)
	}
	if _, err := types.ParseCommandParams("Mod.ping", map[string]any{"sent_at": "123"}); err == nil {
		t.Fatal("expected Mod.ping params validation to reject string sent_at")
	}
	if _, err := types.ParseCommandResult("Mod.ping", map[string]any{"ok": "true"}); err == nil {
		t.Fatal("expected Mod.ping result validation to reject string ok")
	}
	if _, err := types.ParseEventPayload("Mod.pong", map[string]any{"sent_at": 123, "from": "extension-service-worker"}); err == nil {
		t.Fatal("expected Mod.pong event validation to reject missing received_at")
	}
	if _, err := types.ParseCommandParams("Mod.addMiddleware", map[string]any{"name": "Custom.any", "phase": "after", "expression": "async (payload, next) => next(payload)"}); err == nil {
		t.Fatal("expected Mod.addMiddleware params validation to reject invalid phase")
	}
	if _, err := types.ParseCommandResult("Mod.addMiddleware", map[string]any{"name": "Custom.any", "phase": "after", "registered": true}); err == nil {
		t.Fatal("expected Mod.addMiddleware result validation to reject invalid phase")
	}
}

func TestConstructorCustomSchemasValidateCommandParamsReturnValuesEventsAndMiddlewareRegistrationsStaticallyAndAtRuntime(t *testing.T) {
	cdp := New(Config{
		Launcher:     LauncherConfig{LauncherMode: "none"},
		Upstream:     UpstreamTransportConfig{UpstreamMode: "ws"},
		Injector:     InjectorConfig{InjectorMode: "none"},
		ServerConfig: ServerConfigNone,
		Types: &CDPTypesConfig{
			CustomCommands: []CustomCommand{{
				Name:         "Custom.sum",
				ParamsSchema: abxjsonschema.SchemaFor[protocolValidationSumParams](),
				ResultSchema: abxjsonschema.SchemaFor[protocolValidationSumResult](),
				Expression:   "async ({ left, right }) => ({ value: left + right })",
			}},
			CustomEvents: []CustomEvent{{
				Name:        "Custom.finished",
				EventSchema: abxjsonschema.SchemaFor[protocolValidationFinishedEvent](),
			}},
			CustomMiddlewares: []CustomMiddleware{{
				Name:       "Custom.sum",
				Phase:      "response",
				Expression: "async (payload, next) => next(payload)",
			}},
		},
	})

	if _, err := cdp.Types.ParseCommandParams("Custom.sum", map[string]any{"left": 1, "right": 2}); err != nil {
		t.Fatalf("Custom.sum params should validate: %v", err)
	}
	if _, err := cdp.Types.ParseCommandResult("Custom.sum", map[string]any{"value": 3}); err != nil {
		t.Fatalf("Custom.sum result should validate: %v", err)
	}
	if _, err := cdp.Types.ParseEventPayload("Custom.finished", map[string]any{"total": 3, "label": "ok"}); err != nil {
		t.Fatalf("Custom.finished event should validate: %v", err)
	}
	if _, err := cdp.Types.ParseCommandParams("Custom.sum", map[string]any{"left": "1", "right": 2}); err == nil {
		t.Fatal("expected Custom.sum params validation to reject string left")
	}
	if _, err := cdp.Types.ParseCommandResult("Custom.sum", map[string]any{"value": "3"}); err == nil {
		t.Fatal("expected Custom.sum result validation to reject string value")
	}
	if _, err := cdp.Types.ParseEventPayload("Custom.finished", map[string]any{"total": "3", "label": "ok"}); err == nil {
		t.Fatal("expected Custom.finished event validation to reject string total")
	}
	middlewares := cdp.Types.CustomMiddlewareWireRegistrations()
	if len(middlewares) != 1 || middlewares[0].Name != "Custom.sum" || middlewares[0].Phase != "response" || middlewares[0].Expression != "async (payload, next) => next(payload)" {
		t.Fatalf("custom middlewares = %#v", middlewares)
	}
	expectPanic(t, func() {
		NewCDPTypes(nil, nil, []CustomMiddleware{{Name: "Custom.sum", Phase: "after", Expression: "async (payload, next) => next(payload)"}})
	})
}

func TestDynamicModRegistrationUpdatesCustomCommandEventAndMiddlewareValidation(t *testing.T) {
	cdp := New(Config{
		Launcher:     LauncherConfig{LauncherMode: "none"},
		Upstream:     UpstreamTransportConfig{UpstreamMode: "ws"},
		Injector:     InjectorConfig{InjectorMode: "none"},
		ServerConfig: ServerConfigNone,
	})

	registered, err := cdp.Mod.AddCustomCommand(CustomCommand{
		Name: "Custom.dynamic",
		ParamsSchema: map[string]any{
			"type":                 "object",
			"properties":           map[string]any{"text": map[string]any{"type": "string", "minLength": 1}},
			"required":             []any{"text"},
			"additionalProperties": false,
		},
		ResultSchema: abxjsonschema.SchemaFor[protocolValidationDynamicResult](),
	})
	if err != nil {
		t.Fatal(err)
	}
	if registration, ok := registered.(map[string]any); !ok || registration["name"] != "Custom.dynamic" || registration["registered"] != true {
		t.Fatalf("Custom.dynamic registration = %#v", registered)
	}
	registered, err = cdp.Mod.AddCustomEvent(CustomEvent{
		Name: "Custom.dynamicReady",
		EventSchema: map[string]any{
			"type":                 "object",
			"properties":           map[string]any{"id": map[string]any{"type": "string", "pattern": "^[0-9a-f-]{36}$"}},
			"required":             []any{"id"},
			"additionalProperties": false,
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if registration, ok := registered.(map[string]any); !ok || registration["name"] != "Custom.dynamicReady" || registration["registered"] != true {
		t.Fatalf("Custom.dynamicReady registration = %#v", registered)
	}
	registered, err = cdp.Mod.AddMiddleware(CustomMiddleware{
		Name:       "Custom.dynamic",
		Phase:      "response",
		Expression: "async (payload, next) => next(payload)",
	})
	if err != nil {
		t.Fatal(err)
	}
	if registration, ok := registered.(map[string]any); !ok || registration["name"] != "Custom.dynamic" || registration["phase"] != "response" || registration["registered"] != true {
		t.Fatalf("Custom.dynamic middleware registration = %#v", registered)
	}

	if _, ok := cdp.Types.CustomCommands["Custom.dynamic"]; !ok {
		t.Fatal("expected Custom.dynamic registry entry")
	}
	if _, err := cdp.Types.ParseCommandParams("Custom.dynamic", map[string]any{"text": "ok"}); err != nil {
		t.Fatalf("Custom.dynamic params should validate: %v", err)
	}
	if _, err := cdp.Types.ParseCommandResult("Custom.dynamic", map[string]any{"ok": true}); err != nil {
		t.Fatalf("Custom.dynamic result should validate: %v", err)
	}
	if _, err := cdp.Types.ParseEventPayload("Custom.dynamicReady", map[string]any{"id": "550e8400-e29b-41d4-a716-446655440000"}); err != nil {
		t.Fatalf("Custom.dynamicReady event should validate: %v", err)
	}
	middlewares := cdp.Types.CustomMiddlewareWireRegistrations()
	if len(middlewares) != 1 || middlewares[0].Name != "Custom.dynamic" || middlewares[0].Phase != "response" {
		t.Fatalf("custom middlewares = %#v", middlewares)
	}
	if _, err := cdp.Types.ParseCommandParams("Custom.dynamic", map[string]any{"text": ""}); err == nil {
		t.Fatal("expected Custom.dynamic params validation to reject empty text")
	}
	if _, err := cdp.Types.ParseCommandResult("Custom.dynamic", map[string]any{"ok": "yes"}); err == nil {
		t.Fatal("expected Custom.dynamic result validation to reject string ok")
	}
	if _, err := cdp.Types.ParseEventPayload("Custom.dynamicReady", map[string]any{"id": "nope"}); err == nil {
		t.Fatal("expected Custom.dynamicReady event validation to reject invalid uuid")
	}
	if _, err := cdp.Mod.AddMiddleware(CustomMiddleware{Name: "Custom.dynamic", Phase: "after", Expression: "async (payload, next) => next(payload)"}); err == nil {
		t.Fatal("expected invalid middleware phase to fail")
	}
}

func TestClientTypesUpdateReplacesTheRegistryWithExtendedRuntimeValidationAndPreservesStaticCustomAliasesOnTypedClients(t *testing.T) {
	cdp := New(Config{
		Launcher:     LauncherConfig{LauncherMode: "none"},
		Upstream:     UpstreamTransportConfig{UpstreamMode: "ws"},
		Injector:     InjectorConfig{InjectorMode: "none"},
		ServerConfig: ServerConfigNone,
	})
	updatedTypes := cdp.Types.Update(CDPTypesConfig{
		CustomCommands: []CustomCommand{{
			Name: "Custom.updated",
			ParamsSchema: map[string]any{
				"type":                 "object",
				"properties":           map[string]any{"count": map[string]any{"type": "integer", "minimum": 1}},
				"required":             []any{"count"},
				"additionalProperties": false,
			},
			ResultSchema: abxjsonschema.SchemaFor[protocolValidationUpdatedResult](),
		}},
		CustomEvents: []CustomEvent{{
			Name:        "Custom.updatedReady",
			EventSchema: abxjsonschema.SchemaFor[protocolValidationUpdatedReadyEvent](),
		}},
		CustomMiddlewares: []CustomMiddleware{{
			Name:       "Custom.updated",
			Phase:      "request",
			Expression: "async (payload, next) => next(payload)",
		}},
	})
	typedClient := New(Config{
		Launcher:     LauncherConfig{LauncherMode: "none"},
		Upstream:     UpstreamTransportConfig{UpstreamMode: "ws"},
		Injector:     InjectorConfig{InjectorMode: "none"},
		ServerConfig: ServerConfigNone,
	})
	typedClient.Types = updatedTypes
	cdp.Types = updatedTypes

	if _, ok := typedClient.Types.CustomCommands["Custom.updated"]; !ok {
		t.Fatal("expected typed client Custom.updated registry entry")
	}
	if _, ok := cdp.Types.CustomCommands["Custom.updated"]; !ok {
		t.Fatal("expected client Custom.updated registry entry")
	}
	if _, err := cdp.Types.ParseCommandParams("Custom.updated", map[string]any{"count": 1}); err != nil {
		t.Fatalf("Custom.updated params should validate: %v", err)
	}
	if _, err := cdp.Types.ParseCommandResult("Custom.updated", map[string]any{"done": true}); err != nil {
		t.Fatalf("Custom.updated result should validate: %v", err)
	}
	if _, err := cdp.Types.ParseEventPayload("Custom.updatedReady", map[string]any{"ready": true}); err != nil {
		t.Fatalf("Custom.updatedReady event should validate: %v", err)
	}
	middlewares := cdp.Types.CustomMiddlewareWireRegistrations()
	if len(middlewares) != 1 || middlewares[0].Name != "Custom.updated" || middlewares[0].Phase != "request" {
		t.Fatalf("custom middlewares = %#v", middlewares)
	}
	if _, err := cdp.Types.ParseCommandParams("Custom.updated", map[string]any{"count": 0}); err == nil {
		t.Fatal("expected Custom.updated params validation to reject zero count")
	}
	if _, err := cdp.Types.ParseCommandResult("Custom.updated", map[string]any{"done": "true"}); err == nil {
		t.Fatal("expected Custom.updated result validation to reject string done")
	}
	if _, err := cdp.Types.ParseEventPayload("Custom.updatedReady", map[string]any{"ready": "true"}); err == nil {
		t.Fatal("expected Custom.updatedReady event validation to reject string ready")
	}
}

func mustParamsMap(t *testing.T, value any) map[string]any {
	t.Helper()
	params, err := cdpParamsMap(value)
	if err != nil {
		t.Fatal(err)
	}
	return params
}
