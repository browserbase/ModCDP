// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/types/CDPTypes.ts
// - ./python/modcdp/types/CDPTypes.py
package client

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	abxjsonschema "github.com/ArchiveBox/abxbus/abxbus-go/v2/jsonschema"
	modtypes "github.com/browserbase/modcdp/go/modcdp/types"
)

type CommandPreparation struct {
	Params            map[string]any
	LocalResult       map[string]any
	CustomCommandName string
}

type CDPCommandSchema struct {
	Params map[string]any
	Result map[string]any
}

type CDPTypes struct {
	CustomCommands       map[string]CustomCommand
	CustomEvents         map[string]CustomEvent
	CustomMiddlewares    []CustomMiddleware
	commandSchemas       map[string]CDPCommandSchema
	commandParamsSchemas map[string]map[string]any
	commandResultSchemas map[string]map[string]any
	nativeCommands       map[string]bool
	eventSchemas         map[string]map[string]any
	mu                   sync.RWMutex
}

var jsonSchemaObject = map[string]any{"type": "object"}

var modAddCustomCommandParamsSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"name":          map[string]any{"type": "string"},
		"expression":    map[string]any{"type": []any{"string", "null"}},
		"params_schema": map[string]any{"type": []any{"object", "null"}},
		"result_schema": map[string]any{"type": []any{"object", "null"}},
	},
	"required":             []any{"name"},
	"additionalProperties": false,
}

var modAddCustomEventParamsSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"name":         map[string]any{"type": "string"},
		"event_schema": map[string]any{"type": []any{"object", "null"}},
	},
	"required":             []any{"name"},
	"additionalProperties": false,
}

var modAddMiddlewareParamsSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"name":       map[string]any{"type": []any{"string", "null"}},
		"phase":      map[string]any{"enum": []any{"request", "response", "event"}},
		"expression": map[string]any{"type": "string"},
	},
	"required":             []any{"phase", "expression"},
	"additionalProperties": false,
}

var modCommandRegistrationSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"name":          map[string]any{"type": "string"},
		"expression":    map[string]any{"type": []any{"string", "null"}},
		"params_schema": map[string]any{"type": []any{"object", "null"}},
		"result_schema": map[string]any{"type": []any{"object", "null"}},
	},
	"required":             []any{"name"},
	"additionalProperties": false,
}

var modEventRegistrationSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"name":         map[string]any{"type": "string"},
		"event_schema": map[string]any{"type": []any{"object", "null"}},
	},
	"required":             []any{"name"},
	"additionalProperties": false,
}

var modMiddlewareRegistrationSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"name":       map[string]any{"type": []any{"string", "null"}},
		"phase":      map[string]any{"enum": []any{"request", "response", "event"}},
		"expression": map[string]any{"type": "string"},
	},
	"required":             []any{"phase", "expression"},
	"additionalProperties": false,
}

var modConfigureParamsSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"upstream": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"upstream_mode":       map[string]any{"enum": []any{"ws"}},
				"upstream_ws_cdp_url": map[string]any{"type": "string"},
				"upstream_ws_connect_error_settle_timeout_ms": map[string]any{"type": "number"},
				"upstream_cdp_send_timeout_ms":                map[string]any{"type": "number"},
			},
			"additionalProperties": false,
		},
		"router": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"router_routes":                         map[string]any{"type": "object", "additionalProperties": map[string]any{"type": "string"}},
				"loopback_execution_context_timeout_ms": map[string]any{"type": "number"},
			},
			"additionalProperties": false,
		},
		"client_config": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"client_hydrate_aliases":        map[string]any{"type": "boolean"},
				"client_mirror_upstream_events": map[string]any{"type": "boolean"},
				"client_cdp_send_timeout_ms":    map[string]any{"type": "number"},
				"client_event_wait_timeout_ms":  map[string]any{"type": "number"},
				"client_heartbeat_interval_ms":  map[string]any{"type": "number"},
			},
			"additionalProperties": false,
		},
		"downstream": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"downstream_client_timeout_ms":           map[string]any{"type": "number"},
				"downstream_close_browser_on_disconnect": map[string]any{"type": "boolean"},
			},
			"additionalProperties": false,
		},
		"server_browser_token": map[string]any{"type": "string"},
		"custom_commands":      map[string]any{"type": "array", "items": modCommandRegistrationSchema},
		"custom_events":        map[string]any{"type": "array", "items": modEventRegistrationSchema},
		"custom_middlewares":   map[string]any{"type": "array", "items": modMiddlewareRegistrationSchema},
	},
	"additionalProperties": false,
}

var modTopologyParamsSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"rootTargetId": map[string]any{"type": []any{"string", "null"}},
		"targetId":     map[string]any{"type": []any{"string", "null"}},
		"active":       map[string]any{"type": []any{"boolean", "null"}},
	},
	"additionalProperties": false,
}

var modTopologyFrameSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"targetId":           map[string]any{"type": "string"},
		"url":                map[string]any{"type": []any{"string", "null"}},
		"parentFrameId":      map[string]any{"type": []any{"string", "null"}},
		"outerBackendNodeId": map[string]any{"type": []any{"integer", "null"}},
	},
	"required":             []any{"targetId"},
	"additionalProperties": false,
}

var modTopologyDomRootSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"kind":               map[string]any{"enum": []any{"document", "shadow"}},
		"frameId":            map[string]any{"type": "string"},
		"outerBackendNodeId": map[string]any{"type": []any{"integer", "null"}},
		"innerBackendNodeId": map[string]any{"type": []any{"integer", "null"}},
		"mode":               map[string]any{"enum": []any{"open", "closed", "user-agent", nil}},
		"executionContextId": map[string]any{"type": []any{"integer", "null"}},
		"uniqueContextId":    map[string]any{"type": []any{"string", "null"}},
	},
	"required":             []any{"kind", "frameId"},
	"additionalProperties": false,
}

var modTopologyTargetSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"targetId":      map[string]any{"type": "string"},
		"type":          map[string]any{"type": "string"},
		"title":         map[string]any{"type": []any{"string", "null"}},
		"url":           map[string]any{"type": []any{"string", "null"}},
		"attached":      map[string]any{"type": []any{"boolean", "null"}},
		"parentId":      map[string]any{"type": []any{"string", "null"}},
		"parentFrameId": map[string]any{"type": []any{"string", "null"}},
		"sessionId":     map[string]any{"type": []any{"string", "null"}},
	},
	"required": []any{"targetId", "type"},
}

var modTopologyExecutionContextSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"id":        map[string]any{"type": "integer"},
		"origin":    map[string]any{"type": []any{"string", "null"}},
		"name":      map[string]any{"type": []any{"string", "null"}},
		"uniqueId":  map[string]any{"type": []any{"string", "null"}},
		"auxData":   map[string]any{"type": []any{"object", "null"}},
		"sessionId": map[string]any{"type": []any{"string", "null"}},
		"targetId":  map[string]any{"type": "string"},
		"frameId":   map[string]any{"type": []any{"string", "null"}},
		"world":     map[string]any{"type": "string"},
	},
	"required":             []any{"id", "sessionId", "targetId", "world"},
	"additionalProperties": false,
}

var modTopologyResponseSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"objectGroup": map[string]any{"type": "string"},
		"rootFrameId": map[string]any{"type": "string"},
		"frames":      map[string]any{"type": "object", "additionalProperties": modTopologyFrameSchema},
		"roots":       map[string]any{"type": "object", "additionalProperties": modTopologyDomRootSchema},
		"targets":     map[string]any{"type": "object", "additionalProperties": modTopologyTargetSchema},
		"contexts":    map[string]any{"type": "object", "additionalProperties": modTopologyExecutionContextSchema},
	},
	"required":             []any{"objectGroup", "rootFrameId", "frames", "roots", "targets", "contexts"},
	"additionalProperties": false,
}

var defaultBuiltinCommands = []CustomCommand{
	{
		Name:         "Mod.ping",
		ParamsSchema: map[string]any{"type": "object", "properties": map[string]any{"sent_at": map[string]any{"type": "number"}}, "additionalProperties": false},
		ResultSchema: map[string]any{"type": "object", "properties": map[string]any{"ok": map[string]any{"type": "boolean"}}, "required": []any{"ok"}, "additionalProperties": false},
		Expression: `
      async (params) => {
        const received_at = Date.now();
        const message = {
          method: "Mod.pong",
          params: {
            sent_at:
              typeof params.sent_at === "number"
                ? params.sent_at
                : received_at,
            received_at,
            from: "extension-service-worker",
          },
        };
        if (cdpSessionId) message.sessionId = cdpSessionId;
        downstream.sendEvent(message);
        return { ok: true };
      }
      `,
	},
	{
		Name:         "Mod.configure",
		ParamsSchema: modConfigureParamsSchema,
		ResultSchema: jsonSchemaObject,
		Expression:   "async (params) => { await ModCDP.configure(params); return params; }",
	},
	{
		Name: "Mod.evaluate",
		ParamsSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"expression":   map[string]any{"type": "string"},
				"params":       map[string]any{"type": []any{"object", "null"}},
				"cdpSessionId": map[string]any{"type": []any{"string", "null"}},
			},
			"required":             []any{"expression"},
			"additionalProperties": false,
		},
		ResultSchema: nil,
		Expression: `
      async ({ expression, params = {}, cdpSessionId = null }) =>
        ModCDP.evaluateInServiceWorker({ expression, params, cdpSessionId })
      `,
	},
	{
		Name:         "Mod.getTopology",
		ParamsSchema: modTopologyParamsSchema,
		ResultSchema: modTopologyResponseSchema,
		Expression:   "async (params) => ModCDP.client.router.getTopology(params)",
	},
	{
		Name:         "Mod.addCustomCommand",
		ParamsSchema: modAddCustomCommandParamsSchema,
		ResultSchema: map[string]any{"type": "object", "properties": map[string]any{"name": map[string]any{"type": "string"}, "registered": map[string]any{"type": "boolean"}}, "required": []any{"name", "registered"}, "additionalProperties": false},
		Expression:   "async (params) => ModCDP.addCustomCommand(params)",
	},
	{
		Name:         "Mod.addCustomEvent",
		ParamsSchema: modAddCustomEventParamsSchema,
		ResultSchema: map[string]any{"type": "object", "properties": map[string]any{"name": map[string]any{"type": "string"}, "registered": map[string]any{"type": "boolean"}}, "required": []any{"name", "registered"}, "additionalProperties": false},
		Expression:   "async (params) => ModCDP.addCustomEvent(params)",
	},
	{
		Name:         "Mod.addMiddleware",
		ParamsSchema: modAddMiddlewareParamsSchema,
		ResultSchema: map[string]any{"type": "object", "properties": map[string]any{"name": map[string]any{"type": "string"}, "phase": map[string]any{"enum": []any{"request", "response", "event"}}, "registered": map[string]any{"type": "boolean"}}, "required": []any{"name", "phase", "registered"}, "additionalProperties": false},
		Expression:   "async (params) => ModCDP.addMiddleware(params)",
	},
}

var defaultBuiltinEvents = []CustomEvent{
	{
		Name: "Mod.pong",
		EventSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"sent_at":     map[string]any{"type": "number"},
				"received_at": map[string]any{"type": "number"},
				"from":        map[string]any{"type": "string"},
			},
			"required":             []any{"sent_at", "received_at", "from"},
			"additionalProperties": false,
		},
	},
}

func NewCDPTypes(customCommands []CustomCommand, customEvents []CustomEvent, customMiddlewares []CustomMiddleware) *CDPTypes {
	types := &CDPTypes{
		CustomCommands:       map[string]CustomCommand{},
		CustomEvents:         map[string]CustomEvent{},
		CustomMiddlewares:    []CustomMiddleware{},
		commandSchemas:       map[string]CDPCommandSchema{},
		commandParamsSchemas: map[string]map[string]any{},
		commandResultSchemas: map[string]map[string]any{},
		nativeCommands:       map[string]bool{},
		eventSchemas:         map[string]map[string]any{},
	}
	types.hydrateNativeProtocolSchemas()
	types.mu.Lock()
	for method, schema := range types.commandSchemas {
		types.nativeCommands[method] = true
		if schema.Params != nil {
			types.commandParamsSchemas[method] = schema.Params
		}
		if schema.Result != nil {
			types.commandResultSchemas[method] = schema.Result
		}
	}
	types.mu.Unlock()
	for _, command := range defaultBuiltinCommands {
		if _, _, err := types.AddCustomCommand(command); err != nil {
			panic(err)
		}
	}
	for _, event := range defaultBuiltinEvents {
		if _, err := types.AddCustomEvent(event); err != nil {
			panic(err)
		}
	}
	for _, command := range customCommands {
		if _, _, err := types.AddCustomCommand(command); err != nil {
			panic(err)
		}
	}
	for _, event := range customEvents {
		if _, err := types.AddCustomEvent(event); err != nil {
			panic(err)
		}
	}
	for _, middleware := range customMiddlewares {
		if _, err := types.AddCustomMiddleware(middleware); err != nil {
			panic(err)
		}
	}
	return types
}

func (types *CDPTypes) Update(config CDPTypesConfig) *CDPTypes {
	types.mu.RLock()
	customCommands := make([]CustomCommand, 0, len(types.CustomCommands)+len(config.CustomCommands))
	for _, command := range types.CustomCommands {
		customCommands = append(customCommands, command)
	}
	customEvents := make([]CustomEvent, 0, len(types.CustomEvents)+len(config.CustomEvents))
	for _, event := range types.CustomEvents {
		customEvents = append(customEvents, event)
	}
	customMiddlewares := append([]CustomMiddleware{}, types.CustomMiddlewares...)
	types.mu.RUnlock()
	customCommands = append(customCommands, config.CustomCommands...)
	customEvents = append(customEvents, config.CustomEvents...)
	customMiddlewares = append(customMiddlewares, config.CustomMiddlewares...)
	return NewCDPTypes(customCommands, customEvents, customMiddlewares)
}

func (types *CDPTypes) ToJSON() map[string]any {
	customCommands := []map[string]any{}
	for _, command := range types.CustomCommandWireRegistrations(false) {
		delete(command, "expression")
		customCommands = append(customCommands, command)
	}
	customMiddlewares := []map[string]any{}
	for _, middleware := range types.CustomMiddlewareWireRegistrations() {
		registration := map[string]any{"phase": middleware.Phase}
		if middleware.Name != "" {
			registration["name"] = middleware.Name
		}
		customMiddlewares = append(customMiddlewares, registration)
	}
	types.mu.RLock()
	state := map[string]any{
		"custom_commands":        len(types.CustomCommands),
		"custom_events":          len(types.CustomEvents),
		"custom_middlewares":     len(types.CustomMiddlewares),
		"command_params_schemas": len(types.commandParamsSchemas),
		"command_result_schemas": len(types.commandResultSchemas),
		"event_schemas":          len(types.eventSchemas),
	}
	types.mu.RUnlock()
	return modtypes.ModCDPToJSON(types, modtypes.ModCDPJSONConfig{
		Config: map[string]any{
			"custom_commands":    customCommands,
			"custom_events":      types.CustomEventWireRegistrations(),
			"custom_middlewares": customMiddlewares,
		},
		State: state,
	})
}

func (types *CDPTypes) PrepareCommand(method string, params map[string]any, canRegisterLocally bool) (CommandPreparation, error) {
	commandParams, err := types.ParseCommandParams(method, params)
	if err != nil {
		return CommandPreparation{}, err
	}
	if method == "Mod.addCustomCommand" {
		if schema, exists := commandParams["params_schema"]; exists && schema != nil {
			if _, ok := schema.(map[string]any); !ok {
				return CommandPreparation{}, fmt.Errorf("params_schema must be a JSON Schema object")
			}
		}
		if schema, exists := commandParams["result_schema"]; exists && schema != nil {
			if _, ok := schema.(map[string]any); !ok {
				return CommandPreparation{}, fmt.Errorf("result_schema must be a JSON Schema object")
			}
		}
		name, hasExpression, err := types.AddCustomCommand(CustomCommandFromParams(commandParams))
		if err != nil {
			return CommandPreparation{}, err
		}
		if !hasExpression && canRegisterLocally {
			return CommandPreparation{Params: commandParams, LocalResult: map[string]any{"name": name, "registered": true}, CustomCommandName: name}, nil
		}
		return CommandPreparation{Params: types.CustomCommandWireRegistration(name), CustomCommandName: name}, nil
	}
	if method == "Mod.addCustomEvent" {
		if schema, exists := commandParams["event_schema"]; exists && schema != nil {
			if _, ok := schema.(map[string]any); !ok {
				return CommandPreparation{}, fmt.Errorf("event_schema must be a JSON Schema object")
			}
		}
		name, err := types.AddCustomEvent(CustomEventFromParams(commandParams))
		if err != nil {
			return CommandPreparation{}, err
		}
		if canRegisterLocally {
			return CommandPreparation{Params: commandParams, LocalResult: map[string]any{"name": name, "registered": true}}, nil
		}
		return CommandPreparation{Params: types.CustomEventWireRegistration(name)}, nil
	}
	if method == "Mod.addMiddleware" {
		middleware := CustomMiddlewareFromParams(commandParams)
		name, err := types.AddCustomMiddleware(middleware)
		if err != nil {
			return CommandPreparation{}, err
		}
		if canRegisterLocally {
			return CommandPreparation{Params: commandParams, LocalResult: map[string]any{"name": name, "phase": middleware.Phase, "registered": true}}, nil
		}
	}
	return CommandPreparation{Params: commandParams}, nil
}

func (types *CDPTypes) ParseCommandParams(method string, params map[string]any) (map[string]any, error) {
	schema, ok := types.CommandParamsSchema(method)
	if !ok {
		return params, nil
	}
	if err := abxjsonschema.Validate(schema, params); err != nil {
		return nil, fmt.Errorf("%s params did not match params_schema: %w", method, err)
	}
	return params, nil
}

func (types *CDPTypes) NativeCommandSchema(method string) map[string]any {
	types.mu.RLock()
	defer types.mu.RUnlock()
	if !types.nativeCommands[method] {
		return nil
	}
	params := types.commandParamsSchemas[method]
	result := types.commandResultSchemas[method]
	if params == nil && result == nil {
		return nil
	}
	return map[string]any{"params": params, "result": result}
}

func (types *CDPTypes) CommandParamsSchema(method string) (map[string]any, bool) {
	types.mu.RLock()
	defer types.mu.RUnlock()
	schema, ok := types.commandParamsSchemas[method]
	if !ok || schema == nil {
		return nil, false
	}
	return schema, true
}

func (types *CDPTypes) CommandResultSchema(method string) (map[string]any, bool) {
	types.mu.RLock()
	defer types.mu.RUnlock()
	schema, ok := types.commandResultSchemas[method]
	if !ok || schema == nil {
		return nil, false
	}
	return schema, true
}

func (types *CDPTypes) EventPayloadSchema(event string) (map[string]any, bool) {
	types.mu.RLock()
	defer types.mu.RUnlock()
	schema, ok := types.eventSchemas[event]
	if !ok || schema == nil {
		return nil, false
	}
	return schema, true
}

func (types *CDPTypes) ParseCommandResult(method string, result any) (any, error) {
	schema, ok := types.CommandResultSchema(method)
	if !ok {
		return result, nil
	}
	if err := abxjsonschema.Validate(schema, result); err != nil {
		return nil, fmt.Errorf("%s result did not match result_schema: %w", method, err)
	}
	return result, nil
}

func (types *CDPTypes) ParseEventPayload(event string, payload any) (any, error) {
	schema, ok := types.EventPayloadSchema(event)
	if !ok {
		return payload, nil
	}
	if err := abxjsonschema.Validate(schema, payload); err != nil {
		if payloadMap, ok := payload.(map[string]any); ok && len(payloadMap) == 1 {
			if value, exists := payloadMap["value"]; exists {
				if valueErr := abxjsonschema.Validate(schema, value); valueErr == nil {
					return payload, nil
				}
			}
		}
		return nil, fmt.Errorf("%s event did not match event_schema: %w", event, err)
	}
	return payload, nil
}

func (types *CDPTypes) AddCustomCommand(command CustomCommand) (string, bool, error) {
	name, err := normalizeModCDPName(command.Name)
	if err != nil {
		return "", false, err
	}
	types.mu.Lock()
	defer types.mu.Unlock()
	if command.ParamsSchema != nil {
		if schema := cloneSchema(command.ParamsSchema); schema != nil {
			types.commandParamsSchemas[name] = schema
		}
	}
	if command.ResultSchema != nil {
		if schema := cloneSchema(command.ResultSchema); schema != nil {
			types.commandResultSchemas[name] = schema
		}
	}
	command.Name = name
	if command.ParamsSchema != nil {
		command.ParamsSchema = cloneSchema(command.ParamsSchema)
	}
	if command.ResultSchema != nil {
		command.ResultSchema = cloneSchema(command.ResultSchema)
	}
	types.CustomCommands[name] = command
	return name, command.Expression != "", nil
}

func (types *CDPTypes) CustomCommandWireRegistration(name string) map[string]any {
	for _, registration := range types.CustomCommandWireRegistrations(false) {
		if registrationName, _ := registration["name"].(string); registrationName == name {
			return registration
		}
	}
	return map[string]any{"name": name}
}

func (types *CDPTypes) CustomCommandWireRegistrations(expressionRequired bool) []map[string]any {
	types.mu.RLock()
	commands := make([]CustomCommand, 0, len(types.CustomCommands))
	for _, command := range types.CustomCommands {
		commands = append(commands, command)
	}
	types.mu.RUnlock()
	registrations := make([]map[string]any, 0, len(commands))
	for _, command := range commands {
		if expressionRequired && command.Expression == "" {
			continue
		}
		registration := map[string]any{"name": command.Name}
		if command.Expression != "" {
			registration["expression"] = command.Expression
		}
		if command.ParamsSchema != nil {
			registration["params_schema"] = cloneSchema(command.ParamsSchema)
		}
		if command.ResultSchema != nil {
			registration["result_schema"] = cloneSchema(command.ResultSchema)
		}
		registrations = append(registrations, registration)
	}
	return registrations
}

func (types *CDPTypes) AddCustomEvent(event CustomEvent) (string, error) {
	name, err := normalizeModCDPName(event.Name)
	if err != nil {
		return "", err
	}
	types.mu.Lock()
	defer types.mu.Unlock()
	if event.EventSchema != nil {
		if schema := cloneSchema(event.EventSchema); schema != nil {
			types.eventSchemas[name] = schema
			event.EventSchema = schema
		}
	}
	event.Name = name
	types.CustomEvents[name] = event
	return name, nil
}

func (types *CDPTypes) CustomEventWireRegistration(name string) map[string]any {
	types.mu.RLock()
	event, ok := types.CustomEvents[name]
	types.mu.RUnlock()
	if !ok {
		return map[string]any{"name": name}
	}
	registration := map[string]any{"name": name}
	if event.EventSchema != nil {
		registration["event_schema"] = cloneSchema(event.EventSchema)
	}
	return registration
}

func (types *CDPTypes) CustomEventWireRegistrations() []map[string]any {
	types.mu.RLock()
	names := make([]string, 0, len(types.CustomEvents))
	for name := range types.CustomEvents {
		names = append(names, name)
	}
	types.mu.RUnlock()
	registrations := make([]map[string]any, 0, len(names))
	for _, name := range names {
		registrations = append(registrations, types.CustomEventWireRegistration(name))
	}
	return registrations
}

func (types *CDPTypes) AddCustomMiddleware(middleware CustomMiddleware) (string, error) {
	name := middleware.Name
	if name == "" || name == "*" {
		name = "*"
	} else {
		normalized, err := normalizeModCDPName(name)
		if err != nil {
			return "", err
		}
		name = normalized
	}
	if name != "*" && !strings.Contains(name, ".") {
		return "", fmt.Errorf("name must be '*' or Domain.name form")
	}
	if middleware.Phase != "request" && middleware.Phase != "response" && middleware.Phase != "event" {
		return "", fmt.Errorf("phase must be request, response, or event")
	}
	middleware.Name = name
	types.CustomMiddlewares = append(types.CustomMiddlewares, middleware)
	return name, nil
}

func (types *CDPTypes) CustomMiddlewareWireRegistrations() []CustomMiddleware {
	return append([]CustomMiddleware{}, types.CustomMiddlewares...)
}

func (types *CDPTypes) CustomMiddlewareRegistrations(phase string, name string) []CustomMiddleware {
	middlewares := []CustomMiddleware{}
	for _, middleware := range types.CustomMiddlewares {
		middlewareName := middleware.Name
		if middlewareName == "" {
			middlewareName = "*"
		}
		if middleware.Phase == phase && (middlewareName == "*" || middlewareName == name) {
			middlewares = append(middlewares, middleware)
		}
	}
	return middlewares
}

func (types *CDPTypes) ServiceWorkerCommandStep(method string, params map[string]any, cdpSessionID string, executionContextID int) (modtypes.TranslatedStep, error) {
	if params == nil {
		params = map[string]any{}
	}
	types.mu.RLock()
	command, hasCommand := types.CustomCommands[method]
	types.mu.RUnlock()
	if hasCommand && command.Expression != "" {
		commandExpression := command.Expression
		if method == "Mod.evaluate" {
			expression, _ := params["expression"].(string)
			commandExpression = fmt.Sprintf(`
        async ({ params = {}, cdpSessionId = null }) => {
          const value = (%s);
          return typeof value === "function" ? await value(params) : value;
        }
      `, expression)
		}
		runtimeParams := map[string]any{
			"expression":    types.serviceWorkerRuntimeExpression(method, params, cdpSessionID, commandExpression),
			"awaitPromise":  true,
			"returnByValue": true,
		}
		if executionContextID != 0 {
			runtimeParams["contextId"] = executionContextID
		}
		return modtypes.TranslatedStep{Method: "Runtime.evaluate", Params: runtimeParams, Unwrap: "runtime"}, nil
	}
	paramsJSON, err := json.Marshal(params)
	if err != nil {
		return modtypes.TranslatedStep{}, err
	}
	runtimeParams := map[string]any{
		"functionDeclaration": `async function(method, paramsJson, cdpSessionId) { return JSON.stringify(await globalThis.ModCDP.handleCommand(method, JSON.parse(paramsJson), cdpSessionId)); }`,
		"arguments":           []map[string]any{{"value": method}, {"value": string(paramsJSON)}, {"value": nil}},
		"awaitPromise":        true,
		"returnByValue":       true,
	}
	if cdpSessionID != "" {
		runtimeParams["arguments"] = []map[string]any{{"value": method}, {"value": string(paramsJSON)}, {"value": cdpSessionID}}
	}
	if executionContextID != 0 {
		runtimeParams["executionContextId"] = executionContextID
	}
	return modtypes.TranslatedStep{Method: "Runtime.callFunctionOn", Params: runtimeParams, Unwrap: "runtime_json"}, nil
}

func (types *CDPTypes) serviceWorkerRuntimeExpression(method string, params map[string]any, cdpSessionID string, commandExpression string) string {
	methodJSON := jsonLiteral(method)
	paramsJSON := jsonLiteral(params)
	cdpSessionIDJSON := "null"
	if cdpSessionID != "" {
		cdpSessionIDJSON = jsonLiteral(cdpSessionID)
	}
	requestMiddlewares := strings.Join(types.serviceWorkerMiddlewareExpressions("request", method), ",")
	responseMiddlewares := strings.Join(types.serviceWorkerMiddlewareExpressions("response", method), ",")
	return fmt.Sprintf(`
      (async () => {
        const method = %s;
        let commandParams = %s;
        const cdpSessionId = %s;
        const upstream = globalThis.ModCDP.client;
        const downstream = globalThis.ModCDP.downstream;
        const ModCDP = globalThis.ModCDP;
        const cdp = {
          upstream,
          client: upstream,
          downstream,
          send: (method, params = {}, targetCdpSessionId = cdpSessionId) =>
            ModCDP.handleCommand(method, params, targetCdpSessionId),
        };
        const chrome = globalThis.chrome;
        const runMiddlewares = async (middlewares, payload, context = {}) => {
          const dispatch = async (index, value) => {
            const middleware = middlewares[index];
            if (!middleware) return value;
            let nextCalled = false;
            const next = async (nextValue = value) => {
              if (nextCalled) throw new Error("Middleware called next() more than once.");
              nextCalled = true;
              return await dispatch(index + 1, nextValue);
            };
            const result = await middleware(value, next, context);
            if (result && result.__ModCDP_middleware_next__ === true) {
              const nextResult = await next(result.value);
              const { __ModCDP_middleware_next__, value: _value, ...overrides } = result;
              if (Object.keys(overrides).length === 0) return nextResult;
              return nextResult && typeof nextResult === "object" && !Array.isArray(nextResult)
                ? { ...nextResult, ...overrides }
                : overrides;
            }
            return result;
          };
          return await dispatch(0, payload);
        };
        const requestMiddlewares = [%s];
        const responseMiddlewares = [%s];
        const request = { method, params: commandParams, cdpSessionId };
        commandParams = await runMiddlewares(requestMiddlewares, commandParams, {
          cdpSessionId,
          request,
          name: method,
          phase: "request",
        });
        if (commandParams == null) throw new Error("Request middleware returned no params.");
        commandParams = ModCDP.types.parseCommandParams(method, commandParams);
        const handler = (%s);
        let result = await handler(commandParams || {}, method);
        result = await runMiddlewares(responseMiddlewares, result, {
          cdpSessionId,
          request: { ...request, params: commandParams },
          response: { result },
          name: method,
          phase: "response",
        });
        return ModCDP.types.parseCommandResult(method, result);
      })()
    `, methodJSON, paramsJSON, cdpSessionIDJSON, requestMiddlewares, responseMiddlewares, commandExpression)
}

func (types *CDPTypes) serviceWorkerMiddlewareExpressions(phase string, method string) []string {
	expressions := []string{}
	for _, middleware := range types.CustomMiddlewareRegistrations(phase, method) {
		expressions = append(expressions, fmt.Sprintf(`
        async (payload, next, context = {}) => {
          const middleware = (%s);
          return await middleware(payload, next, context);
        }
      `, middleware.Expression))
	}
	return expressions
}

func jsonLiteral(value any) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}

func CustomCommandFromParams(params map[string]any) CustomCommand {
	command := CustomCommand{}
	command.Name, _ = params["name"].(string)
	command.Expression, _ = params["expression"].(string)
	if schema, ok := params["params_schema"].(map[string]any); ok {
		command.ParamsSchema = schema
	}
	if schema, ok := params["result_schema"].(map[string]any); ok {
		command.ResultSchema = schema
	}
	return command
}

func CustomEventFromParams(params map[string]any) CustomEvent {
	event := CustomEvent{}
	event.Name, _ = params["name"].(string)
	if schema, ok := params["event_schema"].(map[string]any); ok {
		event.EventSchema = schema
	}
	return event
}

func CustomMiddlewareFromParams(params map[string]any) CustomMiddleware {
	middleware := CustomMiddleware{}
	middleware.Name, _ = params["name"].(string)
	middleware.Phase, _ = params["phase"].(string)
	middleware.Expression, _ = params["expression"].(string)
	return middleware
}

func customMiddlewaresToMaps(middlewares []CustomMiddleware) []map[string]any {
	values := make([]map[string]any, 0, len(middlewares))
	for _, middleware := range middlewares {
		item := map[string]any{
			"phase":      middleware.Phase,
			"expression": middleware.Expression,
		}
		if middleware.Name != "" {
			item["name"] = middleware.Name
		}
		values = append(values, item)
	}
	return values
}
