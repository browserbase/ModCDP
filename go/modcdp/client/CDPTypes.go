// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/types/CDPTypes.ts
// - ./python/modcdp/types/CDPTypes.py
package client

import (
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

type CDPTypes struct {
	CustomCommands       map[string]CustomCommand
	CustomEvents         map[string]CustomEvent
	CustomMiddlewares    []CustomMiddleware
	commandParamsSchemas map[string]map[string]any
	commandResultSchemas map[string]map[string]any
	eventSchemas         map[string]map[string]any
	mu                   sync.RWMutex
}

func NewCDPTypes(customCommands []CustomCommand, customEvents []CustomEvent, customMiddlewares []CustomMiddleware) *CDPTypes {
	types := &CDPTypes{
		CustomCommands:       map[string]CustomCommand{},
		CustomEvents:         map[string]CustomEvent{},
		CustomMiddlewares:    []CustomMiddleware{},
		commandParamsSchemas: map[string]map[string]any{},
		commandResultSchemas: map[string]map[string]any{},
		eventSchemas:         map[string]map[string]any{},
	}
	types.hydrateNativeProtocolSchemas()
	for _, command := range []CustomCommand{
		{Name: "Mod.ping"},
		{Name: "Mod.configure"},
		{Name: "Mod.evaluate"},
		{Name: "Mod.getTopology"},
		{Name: "Mod.addCustomCommand"},
		{Name: "Mod.addCustomEvent"},
		{Name: "Mod.addMiddleware"},
	} {
		_, _, _ = types.AddCustomCommand(command)
	}
	_, _ = types.AddCustomEvent(CustomEvent{Name: "Mod.pong"})
	for _, command := range customCommands {
		_, _, _ = types.AddCustomCommand(command)
	}
	for _, event := range customEvents {
		_, _ = types.AddCustomEvent(event)
	}
	for _, middleware := range customMiddlewares {
		_, _ = types.AddCustomMiddleware(middleware)
	}
	return types
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
	types.mu.RLock()
	schema := types.commandParamsSchemas[method]
	types.mu.RUnlock()
	if schema == nil {
		return params, nil
	}
	if err := abxjsonschema.Validate(schema, params); err != nil {
		return nil, fmt.Errorf("%s params did not match params_schema: %w", method, err)
	}
	return params, nil
}

func (types *CDPTypes) ParseCommandResult(method string, result any) (any, error) {
	types.mu.RLock()
	schema := types.commandResultSchemas[method]
	types.mu.RUnlock()
	if schema == nil {
		return result, nil
	}
	if err := abxjsonschema.Validate(schema, result); err != nil {
		return nil, fmt.Errorf("%s result did not match result_schema: %w", method, err)
	}
	return result, nil
}

func (types *CDPTypes) ParseEventPayload(event string, payload any) (any, bool) {
	types.mu.RLock()
	schema := types.eventSchemas[event]
	types.mu.RUnlock()
	if schema == nil {
		return payload, true
	}
	if err := abxjsonschema.Validate(schema, payload); err != nil {
		panic(fmt.Errorf("%s event did not match event_schema: %w", event, err))
	}
	return payload, true
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
