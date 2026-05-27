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

type AutoSessionRouter struct {
	sessionId_from_targetId          map[string]string
	targetId_from_sessionId          map[string]string
	targets                          map[string]map[string]any
	contexts                         map[string]map[string]any
	send                             AutoSessionRouterSend
	defaultExecutionContextTimeoutMS func() int
	execution_context_waiters        map[string][]chan executionContextResult
	mu                               sync.Mutex
}

type executionContextResult struct {
	contextID int
	err       error
}

func NewAutoSessionRouter(send AutoSessionRouterSend, defaultExecutionContextTimeoutMS func() int) *AutoSessionRouter {
	return &AutoSessionRouter{
		sessionId_from_targetId:          map[string]string{},
		targetId_from_sessionId:          map[string]string{},
		targets:                          map[string]map[string]any{},
		contexts:                         map[string]map[string]any{},
		send:                             send,
		defaultExecutionContextTimeoutMS: defaultExecutionContextTimeoutMS,
		execution_context_waiters:        map[string][]chan executionContextResult{},
	}
}

func (r *AutoSessionRouter) AttachToTarget(targetID string) string {
	r.mu.Lock()
	sessionID := r.sessionId_from_targetId[targetID]
	r.mu.Unlock()
	if sessionID != "" {
		return sessionID
	}
	result, err := r.send("Target.attachToTarget", map[string]any{"targetId": targetID, "flatten": true}, "")
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
	if timeoutMS == 0 {
		timeoutMS = r.defaultExecutionContextTimeoutMS()
	}
	if sessionID == "" {
		return 0, fmt.Errorf("cannot wait for a Runtime execution context without a session")
	}
	r.mu.Lock()
	for _, context := range r.contexts {
		contextSessionID, _ := context["sessionId"].(string)
		if contextSessionID != sessionID {
			continue
		}
		if contextID, ok := intFromAny(context["id"]); ok {
			r.mu.Unlock()
			return contextID, nil
		}
	}
	waiter := make(chan executionContextResult, 1)
	r.execution_context_waiters[sessionID] = append(r.execution_context_waiters[sessionID], waiter)
	r.mu.Unlock()

	select {
	case result := <-waiter:
		return result.contextID, result.err
	case <-time.After(time.Duration(timeoutMS) * time.Millisecond):
		r.mu.Lock()
		waiters := r.execution_context_waiters[sessionID]
		filtered := waiters[:0]
		for _, candidate := range waiters {
			if candidate != waiter {
				filtered = append(filtered, candidate)
			}
		}
		if len(filtered) == 0 {
			delete(r.execution_context_waiters, sessionID)
		} else {
			r.execution_context_waiters[sessionID] = filtered
		}
		r.mu.Unlock()
		return 0, fmt.Errorf("timed out waiting for Runtime.executionContextCreated for session %s", sessionID)
	}
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
		waiter <- executionContextResult{contextID: contextID}
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

func contextKey(targetID string, sessionID string, contextID int, uniqueID string) string {
	if uniqueID != "" {
		return uniqueID
	}
	if sessionID != "" {
		return fmt.Sprintf("%s:%d", sessionID, contextID)
	}
	return fmt.Sprintf("%s:%d", targetID, contextID)
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
