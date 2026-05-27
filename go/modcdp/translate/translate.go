// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/translate/translate.ts
// - ./python/modcdp/translate/translate.py
package translate

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/browserbase/modcdp/go/modcdp/types"
)

const UpstreamEventBindingName = "__ModCDP_event_from_upstream__"
const CustomEventBindingName = "__ModCDP_custom_event__"

func DefaultClientRoutes() map[string]string {
	return map[string]string{
		"Mod.*":    "service_worker",
		"Custom.*": "service_worker",
		"*.*":      "service_worker",
	}
}

func RouteFor(method string, routes map[string]string) string {
	if route, ok := routes[method]; ok {
		return route
	}
	bestPrefixLen := -1
	bestRoute := ""
	for pattern, route := range routes {
		if pattern == "*.*" || !strings.HasSuffix(pattern, ".*") {
			continue
		}
		prefix := pattern[:len(pattern)-1]
		if strings.HasPrefix(method, prefix) && len(prefix) > bestPrefixLen {
			bestPrefixLen = len(prefix)
			bestRoute = route
		}
	}
	if bestPrefixLen >= 0 {
		return bestRoute
	}
	if route, ok := routes["*.*"]; ok {
		return route
	}
	return "direct_cdp"
}

func stringValue(value any) string {
	if typed, ok := value.(string); ok {
		return typed
	}
	return ""
}

func callFunctionParams(functionDeclaration string) map[string]any {
	return map[string]any{
		"functionDeclaration": functionDeclaration,
		"awaitPromise":        true,
		"returnByValue":       true,
	}
}

func wrapCustomCommand(method string, params map[string]any, sessionID any) map[string]any {
	p, _ := json.Marshal(params)
	runtimeParams := callFunctionParams(`async function(method, paramsJson, cdpSessionId) { return JSON.stringify(await globalThis.ModCDP.handleCommand(method, JSON.parse(paramsJson), cdpSessionId)); }`)
	runtimeParams["arguments"] = []map[string]any{{"value": method}, {"value": string(p)}, {"value": sessionID}}
	return runtimeParams
}

func wrapServiceWorkerCommand(method string, params map[string]any, sessionID string) []types.TranslatedStep {
	if params == nil {
		params = map[string]any{}
	}
	var cdpSessionID any
	if paramsSessionID, _ := params["cdpSessionId"].(string); paramsSessionID != "" {
		cdpSessionID = paramsSessionID
	} else if sessionID != "" {
		cdpSessionID = sessionID
	}
	return []types.TranslatedStep{{Method: "Runtime.callFunctionOn", Params: wrapCustomCommand(method, params, cdpSessionID), Unwrap: "runtime_json"}}
}

func WrapCommandIfNeeded(method string, params map[string]any, routes map[string]string, sessionID string) (types.TranslatedCommand, error) {
	route := RouteFor(method, routes)
	if route == "direct_cdp" {
		return types.TranslatedCommand{Route: route, Target: "direct_cdp", Steps: []types.TranslatedStep{{Method: method, Params: params, SessionID: sessionID}}}, nil
	}
	if route == "service_worker" {
		return types.TranslatedCommand{Route: route, Target: "service_worker", Steps: wrapServiceWorkerCommand(method, params, sessionID)}, nil
	}
	return types.TranslatedCommand{}, fmt.Errorf("unsupported client route %q for %s", route, method)
}

func UnwrapResponseIfNeeded(result map[string]any, unwrap string) (any, error) {
	if unwrap != "runtime" && unwrap != "runtime_json" {
		return result, nil
	}
	if ex, ok := result["exceptionDetails"].(map[string]any); ok {
		msg := ""
		if e, ok := ex["exception"].(map[string]any); ok {
			if d, ok := e["description"].(string); ok {
				msg = d
			}
		}
		if msg == "" {
			if t, ok := ex["text"].(string); ok {
				msg = t
			}
		}
		if msg == "" {
			msg = "Runtime.evaluate failed"
		}
		return nil, fmt.Errorf("%s", msg)
	}
	inner, _ := result["result"].(map[string]any)
	value := inner["value"]
	if unwrap == "runtime_json" {
		if raw, ok := value.(string); ok {
			var decoded any
			if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
				return nil, err
			}
			return decoded, nil
		}
	}
	return value, nil
}

func UnwrapEventIfNeeded(method string, params map[string]any, sessionID string, ourSessionID string) (*types.UnwrappedModCDPEvent, bool) {
	if method != "Runtime.bindingCalled" {
		return nil, false
	}
	name, _ := params["name"].(string)
	payloadStr, _ := params["payload"].(string)
	var payload map[string]any
	if err := json.Unmarshal([]byte(payloadStr), &payload); err != nil || payload == nil {
		return nil, false
	}
	isUpstreamEventBinding := name == UpstreamEventBindingName
	isCustomEventBinding := name == CustomEventBindingName
	if !isUpstreamEventBinding && !isCustomEventBinding {
		return nil, false
	}
	payloadEvent, _ := payload["event"].(string)
	if payloadEvent == "" {
		return nil, false
	}
	resolvedEvent := payloadEvent
	if resolvedEvent == UpstreamEventBindingName || resolvedEvent == CustomEventBindingName {
		return nil, false
	}
	sourceSessionID := sessionID
	if payloadSessionID, ok := payload["cdpSessionId"].(string); ok {
		sourceSessionID = payloadSessionID
	}
	var sourceSessionIDPtr *string
	if sourceSessionID != "" {
		sourceSessionIDPtr = &sourceSessionID
	}
	if data, ok := payload["data"]; ok {
		return &types.UnwrappedModCDPEvent{Event: resolvedEvent, Data: data, SessionID: sourceSessionIDPtr}, true
	}
	return &types.UnwrappedModCDPEvent{Event: resolvedEvent, Data: payload, SessionID: sourceSessionIDPtr}, true
}

func EncodeBindingPayload(payload types.ModCDPBindingPayload) (string, error) {
	encoded, err := json.Marshal(struct {
		Event        string  `json:"event"`
		Data         any     `json:"data"`
		CDPSessionID *string `json:"cdpSessionId"`
	}{
		Event:        payload.Event,
		Data:         payload.Data,
		CDPSessionID: payload.CDPSessionID,
	})
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}
