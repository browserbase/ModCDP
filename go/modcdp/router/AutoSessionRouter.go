// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/router/AutoSessionRouter.ts
// - ./python/modcdp/router/AutoSessionRouter.py
package router

import (
	"fmt"
	"sync"
	"time"
)

type AutoSessionRouterSend func(method string, params map[string]any, sessionID string) (map[string]any, error)

var targetAutoAttachParams = map[string]any{"autoAttach": true, "waitForDebuggerOnStart": false, "flatten": true}
var browserLevelDomains = map[string]bool{"Browser": true, "Target": true, "SystemInfo": true}

type AutoSessionRouter struct {
	sessionId_from_targetId          map[string]string
	targetId_from_sessionId          map[string]string
	targets                          map[string]map[string]any
	contexts                         map[string]map[string]any
	sendRaw                          AutoSessionRouterSend
	defaultExecutionContextTimeoutMS func() int
	execution_context_waiters        map[string][]chan executionContextResult
	mu                               sync.Mutex
}

type executionContextResult struct {
	contextID int
	context   map[string]any
	err       error
}

func NewAutoSessionRouter(send AutoSessionRouterSend, defaultExecutionContextTimeoutMS func() int) *AutoSessionRouter {
	return &AutoSessionRouter{
		sessionId_from_targetId:          map[string]string{},
		targetId_from_sessionId:          map[string]string{},
		targets:                          map[string]map[string]any{},
		contexts:                         map[string]map[string]any{},
		sendRaw:                          send,
		defaultExecutionContextTimeoutMS: defaultExecutionContextTimeoutMS,
		execution_context_waiters:        map[string][]chan executionContextResult{},
	}
}

func (r *AutoSessionRouter) Start() error {
	if _, err := r.sendRaw("Target.setAutoAttach", targetAutoAttachParams, ""); err != nil {
		return err
	}
	_, err := r.sendRaw("Target.setDiscoverTargets", map[string]any{"discover": true}, "")
	return err
}

func (r *AutoSessionRouter) Stop() {}

func (r *AutoSessionRouter) Send(method string, params map[string]any, requestedSessionID string) (map[string]any, error) {
	domain := method
	for index, char := range method {
		if char == '.' {
			domain = method[:index]
			break
		}
	}
	if requestedSessionID != "" {
		targetID := r.targetId_from_sessionId[requestedSessionID]
		if targetID == "" {
			return nil, fmt.Errorf("No target is recorded for sessionId=%s.", requestedSessionID)
		}
		routedParams := cloneMap(params)
		if method == "Runtime.callFunctionOn" {
			var err error
			routedParams, err = r.callFunctionOnParamsForRoute(params, targetID, requestedSessionID)
			if err != nil {
				return nil, err
			}
		}
		return r.sendRaw(method, routedParams, requestedSessionID)
	}
	if browserLevelDomains[domain] {
		return r.sendRaw(method, params, "")
	}
	targetID, err := r.resolveTargetID(params)
	if err != nil {
		return nil, err
	}
	routeTargetID, sessionID, err := r.EnsureRouteForTarget(targetID)
	if err != nil {
		return nil, err
	}
	routedParams := cloneMap(params)
	if method == "Runtime.callFunctionOn" {
		routedParams, err = r.callFunctionOnParamsForRoute(params, routeTargetID, sessionID)
		if err != nil {
			return nil, err
		}
	}
	return r.sendRaw(method, routedParams, sessionID)
}

func (r *AutoSessionRouter) AttachToTarget(targetID string) string {
	r.mu.Lock()
	sessionID := r.sessionId_from_targetId[targetID]
	r.mu.Unlock()
	if sessionID != "" {
		return sessionID
	}
	result, err := r.sendRaw("Target.attachToTarget", map[string]any{"targetId": targetID, "flatten": true}, "")
	if err != nil {
		return ""
	}
	attachedSessionID, _ := result["sessionId"].(string)
	if attachedSessionID != "" {
		r.mu.Lock()
		r.recordTargetSession(targetID, attachedSessionID, r.targets[targetID])
		r.mu.Unlock()
	}
	return attachedSessionID
}

func (r *AutoSessionRouter) EnsureSessionForTarget(targetID string) (string, error) {
	_, sessionID, err := r.EnsureRouteForTarget(targetID)
	if err != nil {
		return "", err
	}
	if sessionID == "" {
		return "", fmt.Errorf("Upstream attached targetId=%s without a CDP session id.", targetID)
	}
	return sessionID, nil
}

func (r *AutoSessionRouter) EnsureRouteForTarget(targetID string) (string, string, error) {
	resolvedTargetID := targetID
	var err error
	if resolvedTargetID == "" {
		resolvedTargetID, err = r.resolveTargetID(map[string]any{})
		if err != nil {
			return "", "", err
		}
	}
	if resolvedTargetID != "" {
		sessionID := r.sessionId_from_targetId[resolvedTargetID]
		if sessionID != "" {
			return resolvedTargetID, sessionID, nil
		}
		target := r.targets[resolvedTargetID]
		if target != nil {
			if _, hasSessionID := target["sessionId"]; hasSessionID && target["sessionId"] == nil {
				return resolvedTargetID, "", nil
			}
		}
	}
	if resolvedTargetID == "" {
		created, err := r.sendRaw("Target.createTarget", map[string]any{"url": "about:blank#modcdp"}, "")
		if err != nil {
			return "", "", err
		}
		createdTargetID, _ := created["targetId"].(string)
		if createdTargetID == "" {
			return "", "", fmt.Errorf("Target.createTarget returned no targetId")
		}
		resolvedTargetID = createdTargetID
	}
	sessionID := r.AttachToTarget(resolvedTargetID)
	if sessionID == "" {
		r.recordTargetSessionlessAttachment(resolvedTargetID)
		return resolvedTargetID, "", nil
	}
	return resolvedTargetID, sessionID, nil
}

func (r *AutoSessionRouter) RecordProtocolEvent(method string, data any, sessionID string) {
	eventData, _ := data.(map[string]any)
	if eventData == nil {
		eventData = map[string]any{}
	}
	switch method {
	case "Target.attachedToTarget":
		attachedSessionID, _ := eventData["sessionId"].(string)
		if attachedSessionID == "" {
			attachedSessionID = sessionID
		}
		targetInfo, _ := eventData["targetInfo"].(map[string]any)
		targetID, _ := targetInfo["targetId"].(string)
		if attachedSessionID != "" && targetID != "" {
			r.mu.Lock()
			r.recordTargetSession(targetID, attachedSessionID, targetInfo)
			r.mu.Unlock()
		}
	case "Target.targetInfoChanged":
		targetInfo, _ := eventData["targetInfo"].(map[string]any)
		if targetInfo != nil {
			r.mu.Lock()
			r.recordTarget(targetInfo)
			r.mu.Unlock()
		}
	case "Target.targetDestroyed":
		targetID, _ := eventData["targetId"].(string)
		if targetID != "" {
			r.forgetTarget(targetID)
		}
	case "Runtime.executionContextCreated":
		context, _ := eventData["context"].(map[string]any)
		_, ok := intFromAny(context["id"])
		if sessionID != "" && ok {
			r.recordExecutionContext("", sessionID, context)
		}
	case "Runtime.executionContextDestroyed":
		contextID, ok := intFromAny(eventData["executionContextId"])
		if sessionID != "" && ok {
			r.forgetExecutionContextByID(sessionID, contextID)
		}
	case "Runtime.executionContextsCleared":
		if sessionID != "" {
			r.forgetExecutionContextsForRoute(sessionID)
		}
	case "Page.frameNavigated":
		frame, _ := eventData["frame"].(map[string]any)
		frameID, _ := frame["id"].(string)
		if frameID != "" {
			r.mu.Lock()
			targetID := r.targetId_from_sessionId[sessionID]
			r.mu.Unlock()
			r.forgetExecutionContextsForFrame(sessionID, targetID, frameID)
		}
	case "Page.frameDetached":
		frameID, _ := eventData["frameId"].(string)
		if frameID != "" {
			r.mu.Lock()
			targetID := r.targetId_from_sessionId[sessionID]
			r.mu.Unlock()
			r.forgetExecutionContextsForFrame(sessionID, targetID, frameID)
		}
	case "Target.detachedFromTarget":
		detachedSessionID, _ := eventData["sessionId"].(string)
		if detachedSessionID == "" {
			detachedSessionID = sessionID
		}
		if detachedSessionID != "" {
			r.forgetSession(detachedSessionID)
		}
	}
}

func (r *AutoSessionRouter) WaitForExecutionContext(sessionID string, timeoutMS int) (int, error) {
	if sessionID == "" {
		return 0, fmt.Errorf("cannot wait for a Runtime execution context without a session")
	}
	context, err := r.waitForExecutionContextMatching(func(context map[string]any) bool {
		contextSessionID, _ := context["sessionId"].(string)
		return contextSessionID == sessionID
	}, sessionID, timeoutMS)
	if err != nil {
		return 0, err
	}
	contextID, _ := intFromAny(context["id"])
	return contextID, nil
}

func (r *AutoSessionRouter) EnsureExecutionContext(frame map[string]string, selector map[string]string) (map[string]any, error) {
	if selector == nil {
		selector = map[string]string{"world": "main"}
	}
	if selector["world"] == "" {
		selector["world"] = "main"
	}
	frameID := frame["frameId"]
	targetID := frame["targetId"]
	routeTargetID, sessionID, err := r.EnsureRouteForTarget(targetID)
	if err != nil {
		return nil, err
	}
	existing := r.findExecutionContext(routeTargetID, sessionID, frameID, selector)
	if existing != nil {
		return existing, nil
	}
	if _, err := r.sendRaw("Runtime.enable", map[string]any{}, sessionID); err != nil {
		return nil, err
	}
	if selector["world"] == "isolated" || selector["world"] == "piercer" {
		params := map[string]any{"frameId": frameID, "grantUniveralAccess": true}
		if selector["world"] == "piercer" {
			params["worldName"] = "__modcdp_piercer__"
		} else if selector["worldName"] != "" {
			params["worldName"] = selector["worldName"]
		}
		created, err := r.sendRaw("Page.createIsolatedWorld", params, sessionID)
		if err != nil {
			return nil, err
		}
		executionContextID, _ := intFromAny(created["executionContextId"])
		createdContext := r.findExecutionContext(routeTargetID, sessionID, frameID, selector)
		if createdContext != nil {
			createdContextID, _ := intFromAny(createdContext["id"])
			if createdContextID == executionContextID {
				return createdContext, nil
			}
		}
		world := "isolated"
		if selector["world"] == "piercer" {
			world = "piercer"
		} else if selector["worldName"] != "" {
			world = selector["worldName"]
		}
		context := map[string]any{"id": executionContextID, "sessionId": sessionID, "targetId": routeTargetID, "frameId": frameID, "world": world}
		if selector["worldName"] != "" {
			context["name"] = selector["worldName"]
		}
		r.contexts[contextKey(routeTargetID, sessionID, executionContextID, "")] = context
		return context, nil
	}
	return r.waitForExecutionContextMatching(func(context map[string]any) bool {
		return context["targetId"] == routeTargetID && context["sessionId"] == sessionID && context["frameId"] == frameID && context["world"] == selector["world"]
	}, firstNonEmptyString(sessionID, routeTargetID), 0)
}

func (r *AutoSessionRouter) recordTarget(targetInfo map[string]any) {
	targetID, _ := targetInfo["targetId"].(string)
	if targetID == "" {
		return
	}
	sessionID := r.sessionId_from_targetId[targetID]
	existing := r.targets[targetID]
	target := cloneMap(targetInfo)
	if sessionID != "" {
		target["sessionId"] = sessionID
	} else if existing != nil {
		if _, hasSessionID := existing["sessionId"]; hasSessionID && existing["sessionId"] == nil {
			target["sessionId"] = nil
		}
	}
	r.targets[targetID] = target
}

func (r *AutoSessionRouter) recordTargetSession(targetID string, sessionID string, targetInfo map[string]any) {
	r.sessionId_from_targetId[targetID] = sessionID
	r.targetId_from_sessionId[sessionID] = targetID
	target := cloneMap(targetInfo)
	if len(target) == 0 {
		target = cloneMap(r.targets[targetID])
	}
	if len(target) == 0 {
		target = map[string]any{"targetId": targetID, "type": "page"}
	}
	target["targetId"] = targetID
	target["sessionId"] = sessionID
	r.targets[targetID] = target
}

func (r *AutoSessionRouter) recordTargetSessionlessAttachment(targetID string) {
	existing := cloneMap(r.targets[targetID])
	if len(existing) == 0 {
		existing = map[string]any{"targetId": targetID, "type": "page"}
	}
	existing["sessionId"] = nil
	r.targets[targetID] = existing
}

func (r *AutoSessionRouter) recordExecutionContext(eventTargetID string, sessionID string, context map[string]any) {
	r.mu.Lock()
	targetID := eventTargetID
	if targetID == "" {
		targetID = r.targetId_from_sessionId[sessionID]
	}
	if targetID == "" {
		r.mu.Unlock()
		return
	}
	contextID, _ := intFromAny(context["id"])
	auxData, _ := context["auxData"].(map[string]any)
	frameID, _ := auxData["frameId"].(string)
	contextName, _ := context["name"].(string)
	auxType, _ := auxData["type"].(string)
	world := ""
	if contextName == "__modcdp_piercer__" {
		world = "piercer"
	} else if auxType == "default" {
		world = "main"
	} else if contextName != "" {
		world = contextName
	} else if auxType != "" {
		world = auxType
	} else {
		world = "isolated"
	}
	topologyContext := cloneMap(context)
	topologyContext["id"] = contextID
	topologyContext["sessionId"] = sessionID
	topologyContext["targetId"] = targetID
	topologyContext["frameId"] = frameID
	topologyContext["world"] = world
	uniqueID, _ := context["uniqueId"].(string)
	r.contexts[contextKey(targetID, sessionID, contextID, uniqueID)] = topologyContext
	waiterKey := sessionID
	if waiterKey == "" {
		waiterKey = targetID
	}
	waiters := r.execution_context_waiters[waiterKey]
	delete(r.execution_context_waiters, waiterKey)
	r.mu.Unlock()
	for _, waiter := range waiters {
		waiter <- executionContextResult{contextID: contextID, context: topologyContext}
	}
}

func (r *AutoSessionRouter) forgetTarget(targetID string) {
	r.mu.Lock()
	sessionID := r.sessionId_from_targetId[targetID]
	delete(r.targets, targetID)
	r.mu.Unlock()
	if sessionID != "" {
		r.forgetSession(sessionID)
	}
	r.forgetExecutionContextsForRoute(targetID)
}

func (r *AutoSessionRouter) forgetSession(sessionID string) {
	r.mu.Lock()
	targetID := r.targetId_from_sessionId[sessionID]
	delete(r.targetId_from_sessionId, sessionID)
	if targetID != "" {
		delete(r.sessionId_from_targetId, targetID)
	}
	for contextKey, context := range r.contexts {
		if context["sessionId"] == sessionID || context["targetId"] == sessionID {
			delete(r.contexts, contextKey)
		}
	}
	waiters := r.execution_context_waiters[sessionID]
	delete(r.execution_context_waiters, sessionID)
	r.mu.Unlock()
	err := fmt.Errorf("Runtime execution context wait cancelled because session %s detached", sessionID)
	for _, waiter := range waiters {
		waiter <- executionContextResult{err: err}
	}
}

func (r *AutoSessionRouter) forgetExecutionContextByID(routeKey string, contextID int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for contextKey, context := range r.contexts {
		currentContextID, ok := intFromAny(context["id"])
		if !ok || currentContextID != contextID {
			continue
		}
		if context["sessionId"] == routeKey || context["targetId"] == routeKey {
			delete(r.contexts, contextKey)
		}
	}
}

func (r *AutoSessionRouter) forgetExecutionContextsForRoute(routeKey string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for contextKey, context := range r.contexts {
		if context["sessionId"] == routeKey || context["targetId"] == routeKey {
			delete(r.contexts, contextKey)
		}
	}
}

func (r *AutoSessionRouter) forgetExecutionContextsForFrame(sessionID string, targetID string, frameID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for contextKey, context := range r.contexts {
		if context["frameId"] != frameID {
			continue
		}
		if sessionID != "" && context["sessionId"] == sessionID {
			delete(r.contexts, contextKey)
		} else if targetID != "" && context["targetId"] == targetID {
			delete(r.contexts, contextKey)
		}
	}
}

func (r *AutoSessionRouter) callFunctionOnParamsForRoute(params map[string]any, targetID string, sessionID string) (map[string]any, error) {
	callParams := cloneMap(params)
	if callParams["executionContextId"] != nil || callParams["uniqueContextId"] != nil || callParams["objectId"] != nil {
		return callParams, nil
	}
	context, err := r.waitForExecutionContextMatching(func(currentContext map[string]any) bool {
		return currentContext["targetId"] == targetID && (sessionID == "" || currentContext["sessionId"] == sessionID)
	}, firstNonEmptyString(sessionID, targetID), 0)
	if err != nil {
		return nil, err
	}
	callParams["executionContextId"] = context["id"]
	return callParams, nil
}

func (r *AutoSessionRouter) findExecutionContext(targetID string, sessionID string, frameID string, selector map[string]string) map[string]any {
	for _, context := range r.contexts {
		if context["targetId"] != targetID || context["frameId"] != frameID {
			continue
		}
		if sessionID != "" && context["sessionId"] != sessionID {
			continue
		}
		if selector["world"] == "piercer" && context["world"] == "piercer" {
			return context
		}
		if selector["world"] == "isolated" && context["name"] == selector["worldName"] {
			return context
		}
		if selector["world"] == "main" && context["world"] == "main" {
			return context
		}
		if context["world"] == selector["world"] {
			return context
		}
	}
	return nil
}

func (r *AutoSessionRouter) waitForExecutionContextMatching(matches func(map[string]any) bool, waiterKey string, timeoutMS int) (map[string]any, error) {
	if timeoutMS == 0 {
		timeoutMS = r.defaultExecutionContextTimeoutMS()
	}
	r.mu.Lock()
	for _, context := range r.contexts {
		if matches(context) {
			r.mu.Unlock()
			return context, nil
		}
	}
	if waiterKey == "" {
		r.mu.Unlock()
		return nil, fmt.Errorf("cannot wait for a Runtime execution context without a route")
	}
	waiter := make(chan executionContextResult, 1)
	r.execution_context_waiters[waiterKey] = append(r.execution_context_waiters[waiterKey], waiter)
	r.mu.Unlock()
	select {
	case result := <-waiter:
		return result.context, result.err
	case <-time.After(time.Duration(timeoutMS) * time.Millisecond):
		r.mu.Lock()
		waiters := r.execution_context_waiters[waiterKey]
		filtered := waiters[:0]
		for _, candidate := range waiters {
			if candidate != waiter {
				filtered = append(filtered, candidate)
			}
		}
		if len(filtered) == 0 {
			delete(r.execution_context_waiters, waiterKey)
		} else {
			r.execution_context_waiters[waiterKey] = filtered
		}
		r.mu.Unlock()
		return nil, fmt.Errorf("timed out waiting for Runtime.executionContextCreated for route %s", waiterKey)
	}
}

func (r *AutoSessionRouter) resolveTargetID(params map[string]any) (string, error) {
	explicitTargetID, _ := params["targetId"].(string)
	if explicitTargetID != "" {
		return explicitTargetID, nil
	}
	result, err := r.sendRaw("Target.getTargets", map[string]any{}, "")
	if err != nil {
		return "", err
	}
	targetInfos, _ := result["targetInfos"].([]any)
	for _, rawTargetInfo := range targetInfos {
		targetInfo, _ := rawTargetInfo.(map[string]any)
		if targetInfo != nil {
			r.recordTarget(targetInfo)
		}
	}
	for _, rawTargetInfo := range targetInfos {
		targetInfo, _ := rawTargetInfo.(map[string]any)
		if targetInfo == nil || targetInfo["type"] != "page" {
			continue
		}
		targetURL, _ := targetInfo["url"].(string)
		if len(targetURL) >= len("devtools://") && targetURL[:len("devtools://")] == "devtools://" {
			continue
		}
		targetID, _ := targetInfo["targetId"].(string)
		return targetID, nil
	}
	return "", nil
}

func contextKey(targetID string, sessionID string, contextID int, uniqueID string) string {
	if uniqueID != "" {
		return uniqueID
	}
	if sessionID != "" {
		return fmt.Sprintf("%s:%d", sessionID, contextID)
	}
	return fmt.Sprintf("%s:%d", targetID, contextID)
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func cloneMap(input map[string]any) map[string]any {
	output := map[string]any{}
	for key, value := range input {
		output[key] = value
	}
	return output
}

func intFromAny(value any) (int, bool) {
	switch typed := value.(type) {
	case int:
		return typed, true
	case int64:
		return int(typed), true
	case float64:
		return int(typed), true
	default:
		return 0, false
	}
}
