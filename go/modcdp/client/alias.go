package client

import (
	"encoding/json"
	"fmt"
	"strings"
)

type AliasSticky = map[string]any
type AliasJSONObject = map[string]any

type ModCDPAliasObject struct {
	Client *ModCDPClient
	Sticky AliasSticky
}

func NewModCDPAliasObject(client *ModCDPClient, sticky AliasSticky) ModCDPAliasObject {
	return ModCDPAliasObject{Client: client, Sticky: cloneAliasMap(sticky)}
}

func SendAliasCommand[T any](client *ModCDPClient, method string, params any, sticky AliasSticky, stickyParam string, stickyFields []string, unwrap string) (T, error) {
	stickyParams := []string{}
	if stickyParam != "" {
		stickyParams = []string{stickyParam}
	}
	return SendAliasCommandWithStickyParams[T](client, method, params, sticky, stickyParam, stickyParams, stickyFields, unwrap)
}

func SendAliasCommandWithStickyParams[T any](client *ModCDPClient, method string, params any, sticky AliasSticky, stickyParam string, stickyParams []string, stickyFields []string, unwrap string) (T, error) {
	var typed T
	if client == nil {
		return typed, fmt.Errorf("alias command %s requires a ModCDPClient", method)
	}
	rawParams, err := cdpParamsMap(params)
	if err != nil {
		return typed, err
	}
	mergeAliasStickyParams(rawParams, sticky, stickyParam, stickyParams, stickyFields)
	result, err := client.Send(method, rawParams)
	if err != nil {
		return typed, err
	}
	unwrapped, err := UnwrapAliasResult(result, unwrap)
	if err != nil {
		return typed, err
	}
	body, err := json.Marshal(unwrapped)
	if err != nil {
		return typed, err
	}
	if err := json.Unmarshal(body, &typed); err != nil {
		return typed, fmt.Errorf("%s result did not match typed alias result shape: %w", method, err)
	}
	return typed, nil
}

func OptionalAliasParams[T any](method string, params []T) (T, error) {
	var typed T
	if len(params) > 1 {
		return typed, fmt.Errorf("%s accepts at most one params object", method)
	}
	if len(params) == 1 {
		return params[0], nil
	}
	return typed, nil
}

func mergeAliasStickyParams(params map[string]any, sticky map[string]any, primaryStickyParam string, stickyParams []string, stickyFields []string) {
	if len(stickyParams) == 0 {
		mergeAliasSticky(params, sticky, primaryStickyParam, stickyFields)
		return
	}
	seen := map[string]bool{}
	for _, stickyParam := range stickyParams {
		if stickyParam == "" || seen[stickyParam] {
			continue
		}
		seen[stickyParam] = true
		if stickyParam != primaryStickyParam {
			if _, exists := params[stickyParam]; !exists {
				continue
			}
		}
		mergeAliasSticky(params, sticky, stickyParam, stickyFields)
	}
}

func AliasStickyFromResult(result any, unwrap string, stickyFields []string) (AliasSticky, error) {
	unwrapped, err := UnwrapAliasResult(result, unwrap)
	if err != nil {
		return nil, err
	}
	sticky, ok := unwrapped.(map[string]any)
	if !ok {
		body, err := json.Marshal(unwrapped)
		if err != nil {
			return nil, err
		}
		if err := json.Unmarshal(body, &sticky); err != nil {
			return nil, fmt.Errorf("alias sticky result did not decode to object: %w", err)
		}
	}
	if len(stickyFields) == 0 {
		return cloneAliasMap(sticky), nil
	}
	filtered := map[string]any{}
	for _, field := range stickyFields {
		if value, ok := sticky[field]; ok {
			filtered[field] = value
		}
	}
	return filtered, nil
}

func AliasArrayFromResult(result any, unwrap string) ([]any, error) {
	unwrapped, err := UnwrapAliasResult(result, unwrap)
	if err != nil {
		return nil, err
	}
	items, ok := unwrapped.([]any)
	if ok {
		return items, nil
	}
	body, err := json.Marshal(unwrapped)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(body, &items); err != nil {
		return nil, fmt.Errorf("alias result did not decode to array: %w", err)
	}
	return items, nil
}

func UnwrapAliasResult(result any, unwrap string) (any, error) {
	if unwrap == "" {
		return result, nil
	}
	current := result
	for _, part := range strings.Split(unwrap, ".") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		object, ok := current.(map[string]any)
		if !ok {
			body, err := json.Marshal(current)
			if err != nil {
				return nil, err
			}
			object = map[string]any{}
			if err := json.Unmarshal(body, &object); err != nil {
				return nil, fmt.Errorf("alias unwrap %q expected object at %q: %w", unwrap, part, err)
			}
		}
		value, ok := object[part]
		if !ok {
			return nil, fmt.Errorf("alias unwrap %q missing %q", unwrap, part)
		}
		current = value
	}
	return current, nil
}

func mergeAliasSticky(params map[string]any, sticky map[string]any, stickyParam string, stickyFields []string) {
	if params == nil || sticky == nil || len(sticky) == 0 {
		return
	}
	target := params
	if stickyParam != "" {
		existing, ok := params[stickyParam].(map[string]any)
		if !ok {
			existing = map[string]any{}
			if raw, exists := params[stickyParam]; exists && raw != nil {
				body, err := json.Marshal(raw)
				if err == nil {
					_ = json.Unmarshal(body, &existing)
				}
			}
			params[stickyParam] = existing
		}
		target = existing
	}
	fields := stickyFields
	if len(fields) == 0 {
		for key := range sticky {
			fields = append(fields, key)
		}
	}
	for _, field := range fields {
		if _, exists := target[field]; exists {
			continue
		}
		if value, ok := sticky[field]; ok {
			target[field] = value
		}
	}
}

func cloneAliasMap(source AliasSticky) AliasSticky {
	if source == nil {
		return AliasSticky{}
	}
	cloned := make(AliasSticky, len(source))
	for key, value := range source {
		cloned[key] = value
	}
	return cloned
}
