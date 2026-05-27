// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/types/toJSON.ts
// - ./python/modcdp/types/toJSON.py
package types

import (
	"reflect"
	"strings"
)

type ModCDPJSONChild interface {
	ToJSON() map[string]any
}

type ModCDPJSONConfig struct {
	Config   any
	State    map[string]any
	Children map[string]ModCDPJSONChild
}

func ModCDPToJSON(instance any, config ModCDPJSONConfig) map[string]any {
	children := map[string]any{}
	for key, child := range config.Children {
		if child != nil {
			children[key] = child.ToJSON()
		}
	}
	jsonConfig := config.Config
	if jsonConfig == nil {
		value := reflect.Indirect(reflect.ValueOf(instance))
		if value.IsValid() && value.Kind() == reflect.Struct {
			field := value.FieldByName("Config")
			if field.IsValid() && field.CanInterface() {
				jsonConfig = field.Interface()
			}
		}
	}
	result := map[string]any{
		"type":   reflect.Indirect(reflect.ValueOf(instance)).Type().Name(),
		"config": jsonConfig,
		"state":  mergeSimpleState(simpleState(instance), simpleState(config.State)),
	}
	if result["config"] == nil {
		result["config"] = map[string]any{}
	}
	if len(children) > 0 {
		result["children"] = children
	}
	return result
}

func simpleState(input any) map[string]any {
	state := map[string]any{}
	if input == nil {
		return state
	}
	value := reflect.Indirect(reflect.ValueOf(input))
	if value.Kind() == reflect.Map {
		for _, key := range value.MapKeys() {
			if key.Kind() != reflect.String {
				continue
			}
			addSimpleStateValue(state, key.String(), value.MapIndex(key).Interface())
		}
		return state
	}
	if value.Kind() != reflect.Struct {
		return state
	}
	valueType := value.Type()
	for index := 0; index < value.NumField(); index++ {
		field := valueType.Field(index)
		if !field.IsExported() || field.Name == "Config" {
			continue
		}
		addSimpleStateValue(state, field.Name, value.Field(index).Interface())
	}
	return state
}

func addSimpleStateValue(state map[string]any, key string, value any) {
	normalizedKey := strings.ToLower(key)
	if key == "Config" || key == "config" || strings.Contains(normalizedKey, "token") || strings.Contains(normalizedKey, "secret") || strings.Contains(normalizedKey, "api_key") || strings.Contains(normalizedKey, "apikey") {
		return
	}
	switch typed := value.(type) {
	case string:
		state[key] = typed
	case int:
		state[key] = typed
	case int64:
		state[key] = typed
	case float64:
		state[key] = typed
	case bool:
		state[key] = typed
	}
}

func mergeSimpleState(left map[string]any, right map[string]any) map[string]any {
	merged := map[string]any{}
	for key, value := range left {
		merged[key] = value
	}
	for key, value := range right {
		merged[key] = value
	}
	return merged
}
