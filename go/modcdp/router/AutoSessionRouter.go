package router

import (
	"fmt"
	"sync"
	"time"
)

type AutoSessionRouterSend func(method string, params map[string]any, sessionID string) (map[string]any, error)

type AutoSessionRouter struct {
	SessionId_from_targetId          map[string]string
	TargetId_from_sessionId          map[string]string
	Execution_contexts               map[string]int
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
		SessionId_from_targetId:          map[string]string{},
		TargetId_from_sessionId:          map[string]string{},
		Execution_contexts:               map[string]int{},
		send:                             send,
		defaultExecutionContextTimeoutMS: defaultExecutionContextTimeoutMS,
		execution_context_waiters:        map[string][]chan executionContextResult{},
	}
}

func (r *AutoSessionRouter) AttachToTarget(targetID string) string {
	r.mu.Lock()
	sessionID := r.SessionId_from_targetId[targetID]
	r.mu.Unlock()
	if sessionID != "" {
		return sessionID
	}
	result, err := r.send("Target.attachToTarget", map[string]any{"targetId": targetID, "flatten": true}, "")
	if err != nil {
		return ""
	}
	attachedSessionID, _ := result["sessionId"].(string)
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
			r.SessionId_from_targetId[targetID] = attachedSessionID
			r.TargetId_from_sessionId[attachedSessionID] = targetID
			r.mu.Unlock()
		}
	case "Runtime.executionContextCreated":
		context, _ := eventData["context"].(map[string]any)
		contextID, ok := intFromAny(context["id"])
		if sessionID != "" && ok {
			r.recordExecutionContext(sessionID, contextID)
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
	if contextID, ok := r.Execution_contexts[sessionID]; ok {
		r.mu.Unlock()
		return contextID, nil
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

func (r *AutoSessionRouter) recordExecutionContext(sessionID string, contextID int) {
	r.mu.Lock()
	if _, ok := r.TargetId_from_sessionId[sessionID]; !ok {
		r.mu.Unlock()
		return
	}
	r.Execution_contexts[sessionID] = contextID
	waiters := r.execution_context_waiters[sessionID]
	delete(r.execution_context_waiters, sessionID)
	r.mu.Unlock()
	for _, waiter := range waiters {
		waiter <- executionContextResult{contextID: contextID}
	}
}

func (r *AutoSessionRouter) forgetSession(sessionID string) {
	r.mu.Lock()
	targetID := r.TargetId_from_sessionId[sessionID]
	delete(r.TargetId_from_sessionId, sessionID)
	if targetID != "" {
		delete(r.SessionId_from_targetId, targetID)
	}
	delete(r.Execution_contexts, sessionID)
	waiters := r.execution_context_waiters[sessionID]
	delete(r.execution_context_waiters, sessionID)
	r.mu.Unlock()
	err := fmt.Errorf("Runtime execution context wait cancelled because session %s detached", sessionID)
	for _, waiter := range waiters {
		waiter <- executionContextResult{err: err}
	}
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
