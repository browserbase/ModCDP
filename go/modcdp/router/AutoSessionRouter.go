// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/router/AutoSessionRouter.ts
// - ./python/modcdp/router/AutoSessionRouter.py
package router

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/browserbase/modcdp/go/modcdp/translate"
	"github.com/browserbase/modcdp/go/modcdp/transport"
	"github.com/browserbase/modcdp/go/modcdp/types"
)

var targetAutoAttachParams = map[string]any{"autoAttach": true, "waitForDebuggerOnStart": false, "flatten": true}
var browserLevelDomains = map[string]bool{"Browser": true, "Target": true, "SystemInfo": true}

type ProtocolTypes interface {
	NativeCommandSchema(method string) map[string]any
}

type AutoSessionRouter struct {
	Config                    types.ModCDPRouterConfig
	upstream                  *transport.UpstreamTransport
	types                     ProtocolTypes
	SessionId_from_targetId   map[string]string
	TargetId_from_sessionId   map[string]string
	Targets                   map[string]map[string]any
	Contexts                  map[string]map[string]any
	execution_context_waiters map[string][]executionContextWaiter
	subscription_cleanups     []func()
	started                   bool
	mu                        sync.Mutex
}

type executionContextResult struct {
	contextID int
	context   map[string]any
	err       error
}

type executionContextWaiter struct {
	done    chan executionContextResult
	matches func(map[string]any) bool
}

func NewAutoSessionRouter(upstream *transport.UpstreamTransport, protocolTypes ProtocolTypes, config types.ModCDPRouterConfig) *AutoSessionRouter {
	if config.RouterRoutes == nil {
		config.RouterRoutes = translate.DefaultClientRoutes()
	} else {
		merged := translate.DefaultClientRoutes()
		for key, value := range config.RouterRoutes {
			merged[key] = value
		}
		config.RouterRoutes = merged
	}
	if config.LoopbackExecutionContextTimeoutMS == 0 {
		config.LoopbackExecutionContextTimeoutMS = 10_000
	}
	return &AutoSessionRouter{
		Config:                    config,
		upstream:                  upstream,
		types:                     protocolTypes,
		SessionId_from_targetId:   map[string]string{},
		TargetId_from_sessionId:   map[string]string{},
		Targets:                   map[string]map[string]any{},
		Contexts:                  map[string]map[string]any{},
		execution_context_waiters: map[string][]executionContextWaiter{},
		subscription_cleanups:     []func(){},
	}
}

func (r *AutoSessionRouter) Start() error {
	r.mu.Lock()
	if r.started {
		r.mu.Unlock()
		return nil
	}
	r.subscription_cleanups = r.listen()
	r.started = true
	r.mu.Unlock()
	if _, err := r.upstream.Send("Target.setAutoAttach", targetAutoAttachParams, ""); err != nil {
		r.Stop()
		return err
	}
	if _, err := r.upstream.Send("Target.setDiscoverTargets", map[string]any{"discover": true}, ""); err != nil {
		r.Stop()
		return err
	}
	return nil
}

func (r *AutoSessionRouter) Stop() {
	r.mu.Lock()
	cleanups := r.subscription_cleanups
	r.subscription_cleanups = []func(){}
	r.started = false
	r.mu.Unlock()
	for _, cleanup := range cleanups {
		cleanup()
	}
}

func (r *AutoSessionRouter) ToJSON() map[string]any {
	r.mu.Lock()
	sessions := len(r.SessionId_from_targetId)
	targets := len(r.Targets)
	contexts := len(r.Contexts)
	waiters := len(r.execution_context_waiters)
	started := r.started
	routerRoutes := cloneStringMap(r.Config.RouterRoutes)
	timeoutMS := r.Config.LoopbackExecutionContextTimeoutMS
	r.mu.Unlock()
	return types.ModCDPToJSON(r, types.ModCDPJSONConfig{
		Config: map[string]any{
			"router_routes":                         routerRoutes,
			"loopback_execution_context_timeout_ms": timeoutMS,
		},
		State: map[string]any{
			"started":                   started,
			"sessions":                  sessions,
			"targets":                   targets,
			"contexts":                  contexts,
			"execution_context_waiters": waiters,
		},
	})
}

func (r *AutoSessionRouter) Send(method string, params map[string]any, requestedSessionID string) (map[string]any, error) {
	if r.types == nil || r.types.NativeCommandSchema(method) == nil {
		return nil, fmt.Errorf("AutoSessionRouter cannot route unknown CDP command %s.", method)
	}
	domain := method
	for index, char := range method {
		if char == '.' {
			domain = method[:index]
			break
		}
	}
	if requestedSessionID != "" {
		targetID := r.TargetId_from_sessionId[requestedSessionID]
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
		return r.upstream.Send(method, routedParams, requestedSessionID)
	}
	if browserLevelDomains[domain] {
		return r.upstream.Send(method, params, "")
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
	return r.upstream.Send(method, routedParams, sessionID)
}

func (r *AutoSessionRouter) AttachToTarget(targetID string) (string, error) {
	r.mu.Lock()
	sessionID := r.SessionId_from_targetId[targetID]
	r.mu.Unlock()
	if sessionID != "" {
		return sessionID, nil
	}
	attachedSessionID, err := r.upstream.AttachToTarget(targetID)
	if err != nil {
		return "", err
	}
	if attachedSessionID != "" {
		r.mu.Lock()
		r.recordTargetSession(targetID, attachedSessionID, r.Targets[targetID])
		r.mu.Unlock()
	}
	return attachedSessionID, nil
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
		sessionID := r.SessionId_from_targetId[resolvedTargetID]
		if sessionID != "" {
			return resolvedTargetID, sessionID, nil
		}
		target := r.Targets[resolvedTargetID]
		if target != nil {
			if _, hasSessionID := target["sessionId"]; hasSessionID && target["sessionId"] == nil {
				return resolvedTargetID, "", nil
			}
		}
	}
	if resolvedTargetID == "" {
		resolvedTargetID, err = r.upstream.CreateTarget("about:blank#modcdp")
		if err != nil {
			return "", "", err
		}
	}
	sessionID, err := r.AttachToTarget(resolvedTargetID)
	if err != nil {
		return "", "", err
	}
	if sessionID == "" {
		r.recordTargetSessionlessAttachment(resolvedTargetID)
		return resolvedTargetID, "", nil
	}
	return resolvedTargetID, sessionID, nil
}

func (r *AutoSessionRouter) listen() []func() {
	return []func(){
		r.upstream.On("Target.attachedToTarget", func(event map[string]any, targetID string, sessionID string) {
			r.recordProtocolEvent("Target.attachedToTarget", event, targetID, sessionID)
		}),
		r.upstream.On("Target.detachedFromTarget", func(event map[string]any, targetID string, sessionID string) {
			r.recordProtocolEvent("Target.detachedFromTarget", event, targetID, sessionID)
		}),
		r.upstream.On("Target.targetInfoChanged", func(event map[string]any, targetID string, sessionID string) {
			r.recordProtocolEvent("Target.targetInfoChanged", event, targetID, sessionID)
		}),
		r.upstream.On("Target.targetDestroyed", func(event map[string]any, targetID string, sessionID string) {
			r.recordProtocolEvent("Target.targetDestroyed", event, targetID, sessionID)
		}),
		r.upstream.On("Runtime.executionContextCreated", func(event map[string]any, targetID string, sessionID string) {
			r.recordProtocolEvent("Runtime.executionContextCreated", event, targetID, sessionID)
		}),
		r.upstream.On("Runtime.executionContextDestroyed", func(event map[string]any, targetID string, sessionID string) {
			r.recordProtocolEvent("Runtime.executionContextDestroyed", event, targetID, sessionID)
		}),
		r.upstream.On("Runtime.executionContextsCleared", func(event map[string]any, targetID string, sessionID string) {
			r.recordProtocolEvent("Runtime.executionContextsCleared", event, targetID, sessionID)
		}),
		r.upstream.On("Page.frameNavigated", func(event map[string]any, targetID string, sessionID string) {
			r.recordProtocolEvent("Page.frameNavigated", event, targetID, sessionID)
		}),
		r.upstream.On("Page.frameDetached", func(event map[string]any, targetID string, sessionID string) {
			r.recordProtocolEvent("Page.frameDetached", event, targetID, sessionID)
		}),
	}
}

func (r *AutoSessionRouter) recordProtocolEvent(method string, data any, eventTargetID string, sessionID string) {
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
		if (sessionID != "" || eventTargetID != "") && ok {
			r.recordExecutionContext(eventTargetID, sessionID, context)
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
			targetID := eventTargetID
			if targetID == "" {
				targetID = r.TargetId_from_sessionId[sessionID]
			}
			r.mu.Unlock()
			r.forgetExecutionContextsForFrame(sessionID, targetID, frameID)
		}
	case "Page.frameDetached":
		frameID, _ := eventData["frameId"].(string)
		if frameID != "" {
			r.mu.Lock()
			targetID := eventTargetID
			if targetID == "" {
				targetID = r.TargetId_from_sessionId[sessionID]
			}
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
	if _, err := r.upstream.Send("Runtime.enable", map[string]any{}, sessionID); err != nil {
		return nil, err
	}
	if selector["world"] == "isolated" || selector["world"] == "piercer" {
		params := map[string]any{"frameId": frameID, "grantUniveralAccess": true}
		if selector["world"] == "piercer" {
			params["worldName"] = "__modcdp_piercer__"
		} else if selector["worldName"] != "" {
			params["worldName"] = selector["worldName"]
		}
		created, err := r.upstream.Send("Page.createIsolatedWorld", params, sessionID)
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
		r.Contexts[contextKey(routeTargetID, sessionID, executionContextID, "")] = context
		return context, nil
	}
	return r.waitForExecutionContextMatching(func(context map[string]any) bool {
		return context["targetId"] == routeTargetID && context["sessionId"] == sessionID && context["frameId"] == frameID && context["world"] == selector["world"]
	}, firstNonEmptyString(sessionID, routeTargetID), 0)
}

func (r *AutoSessionRouter) GetTopology(params map[string]any) (map[string]any, error) {
	if params == nil {
		params = map[string]any{}
	}
	objectGroup := fmt.Sprintf("modcdp-topology-%d-%s", time.Now().UnixMilli(), randomHexSuffix(8))
	targetResult, err := r.upstream.Send("Target.getTargets", map[string]any{}, "")
	if err != nil {
		return nil, err
	}
	rawTargetInfos, _ := targetResult["targetInfos"].([]any)
	targetInfos := []map[string]any{}
	for _, rawTargetInfo := range rawTargetInfos {
		targetInfo, _ := rawTargetInfo.(map[string]any)
		if targetInfo == nil {
			continue
		}
		targetInfos = append(targetInfos, targetInfo)
		r.recordTarget(targetInfo)
	}
	rootTarget := r.resolveRootTarget(params, targetInfos)
	if rootTarget == nil {
		return nil, fmt.Errorf("Mod.getTopology could not resolve a page target.")
	}
	frames := map[string]map[string]any{}
	rootTargetID, _ := rootTarget["targetId"].(string)
	_, rootSessionID, err := r.enableTarget(rootTargetID)
	if err != nil {
		return nil, err
	}
	rootTreeResult, err := r.upstream.Send("Page.getFrameTree", map[string]any{}, rootSessionID)
	if err != nil {
		return nil, err
	}
	rootTree, _ := rootTreeResult["frameTree"].(map[string]any)
	if rootTree == nil {
		return nil, fmt.Errorf("Page.getFrameTree returned no frameTree.")
	}
	rootFrameID, err := r.recordFrameTree(rootTree, rootTargetID, "", frames)
	if err != nil {
		return nil, err
	}

	for _, target := range targetInfos {
		parentFrameID, _ := target["parentFrameId"].(string)
		targetID, _ := target["targetId"].(string)
		if target["type"] != "iframe" || parentFrameID == "" || frames[targetID] != nil {
			continue
		}
		_, sessionID, err := r.enableTarget(targetID)
		if err != nil {
			return nil, err
		}
		frameTreeResult, err := r.upstream.Send("Page.getFrameTree", map[string]any{}, sessionID)
		if err != nil {
			return nil, err
		}
		frameTree, _ := frameTreeResult["frameTree"].(map[string]any)
		if frameTree != nil {
			if _, err := r.recordFrameTree(frameTree, targetID, parentFrameID, frames); err != nil {
				return nil, err
			}
		}
	}

	for frameID, frame := range frames {
		parentFrameID, _ := frame["parentFrameId"].(string)
		if parentFrameID == "" {
			continue
		}
		parent := frames[parentFrameID]
		if parent == nil {
			continue
		}
		parentTargetID, _ := parent["targetId"].(string)
		_, parentSessionID, err := r.EnsureRouteForTarget(parentTargetID)
		if err != nil {
			return nil, err
		}
		owner, err := r.upstream.Send("DOM.getFrameOwner", map[string]any{"frameId": frameID}, parentSessionID)
		if err != nil {
			return nil, err
		}
		if backendNodeID, ok := intFromAny(owner["backendNodeId"]); ok {
			frame["outerBackendNodeId"] = backendNodeID
		}
	}

	contexts := map[string]map[string]any{}
	roots := map[string]map[string]any{}
	for frameID, frame := range frames {
		frameTargetID, _ := frame["targetId"].(string)
		context, err := r.EnsureExecutionContext(map[string]string{"frameId": frameID, "targetId": frameTargetID}, map[string]string{"world": "piercer"})
		if err != nil {
			return nil, err
		}
		contextTargetID, _ := context["targetId"].(string)
		contextSessionID, _ := context["sessionId"].(string)
		contextID, _ := intFromAny(context["id"])
		contextUniqueID, _ := context["uniqueId"].(string)
		contexts[contextKey(contextTargetID, contextSessionID, contextID, contextUniqueID)] = context
		evaluateParams := map[string]any{"expression": "document.documentElement", "objectGroup": objectGroup}
		if contextUniqueID != "" {
			evaluateParams["uniqueContextId"] = contextUniqueID
		} else {
			evaluateParams["contextId"] = contextID
		}
		rootObject, err := r.upstream.Send("Runtime.evaluate", evaluateParams, contextSessionID)
		if err != nil {
			return nil, err
		}
		result, _ := rootObject["result"].(map[string]any)
		objectID, _ := result["objectId"].(string)
		if objectID == "" {
			return nil, fmt.Errorf("Mod.getTopology could not resolve document root for frameId=%s.", frameID)
		}
		described, err := r.upstream.Send("DOM.describeNode", map[string]any{"objectId": objectID}, contextSessionID)
		if err != nil {
			return nil, err
		}
		node, _ := described["node"].(map[string]any)
		root := map[string]any{
			"kind":               "document",
			"frameId":            frameID,
			"outerBackendNodeId": frame["outerBackendNodeId"],
			"innerBackendNodeId": nil,
			"executionContextId": contextID,
		}
		if node != nil {
			if backendNodeID, ok := intFromAny(node["backendNodeId"]); ok {
				root["innerBackendNodeId"] = backendNodeID
			}
		}
		if contextUniqueID != "" {
			root["uniqueContextId"] = contextUniqueID
		}
		roots[objectID] = root
	}

	targetIDs := map[string]bool{}
	for _, frame := range frames {
		targetID, _ := frame["targetId"].(string)
		if targetID != "" {
			targetIDs[targetID] = true
		}
	}
	for targetID := range targetIDs {
		_, sessionID, err := r.EnsureRouteForTarget(targetID)
		if err != nil {
			return nil, err
		}
		document, err := r.upstream.Send("DOM.getDocument", map[string]any{"depth": -1, "pierce": true}, sessionID)
		if err != nil {
			return nil, err
		}
		root, _ := document["root"].(map[string]any)
		if root != nil {
			if err := r.recordShadowRoots(root, frames, roots, objectGroup, "", nil); err != nil {
				return nil, err
			}
		}
	}

	for _, context := range r.Contexts {
		contextTargetID, _ := context["targetId"].(string)
		if !targetIDs[contextTargetID] {
			continue
		}
		contextSessionID, _ := context["sessionId"].(string)
		contextID, _ := intFromAny(context["id"])
		contextUniqueID, _ := context["uniqueId"].(string)
		contexts[contextKey(contextTargetID, contextSessionID, contextID, contextUniqueID)] = context
	}
	targets := map[string]map[string]any{}
	for targetID, target := range r.Targets {
		for _, targetInfo := range targetInfos {
			if targetInfo["targetId"] == targetID {
				targets[targetID] = target
				break
			}
		}
	}
	return map[string]any{
		"objectGroup": objectGroup,
		"rootFrameId": rootFrameID,
		"frames":      frames,
		"roots":       roots,
		"targets":     targets,
		"contexts":    contexts,
	}, nil
}

func (r *AutoSessionRouter) resolveRootTarget(params map[string]any, targetInfos []map[string]any) map[string]any {
	requestedTargetID, _ := params["rootTargetId"].(string)
	if requestedTargetID == "" {
		requestedTargetID, _ = params["targetId"].(string)
	}
	if requestedTargetID != "" {
		for _, target := range targetInfos {
			if target["targetId"] == requestedTargetID {
				return target
			}
		}
		return nil
	}
	for _, target := range targetInfos {
		targetURL, _ := target["url"].(string)
		if target["type"] == "page" && !strings.HasPrefix(targetURL, "devtools://") {
			return target
		}
	}
	return nil
}

func (r *AutoSessionRouter) enableTarget(targetID string) (string, string, error) {
	routeTargetID, sessionID, err := r.EnsureRouteForTarget(targetID)
	if err != nil {
		return "", "", err
	}
	for _, command := range []struct {
		method string
		params map[string]any
	}{
		{method: "Page.enable", params: map[string]any{}},
		{method: "DOM.enable", params: map[string]any{}},
		{method: "Runtime.enable", params: map[string]any{}},
		{method: "Target.setAutoAttach", params: targetAutoAttachParams},
	} {
		if _, err := r.upstream.Send(command.method, command.params, sessionID); err != nil && command.method != "Target.setAutoAttach" {
			return "", "", err
		}
	}
	return routeTargetID, sessionID, nil
}

func (r *AutoSessionRouter) recordFrameTree(tree map[string]any, targetID string, parentFrameID string, frames map[string]map[string]any) (string, error) {
	frame, _ := tree["frame"].(map[string]any)
	if frame == nil {
		return "", fmt.Errorf("frame tree entry is missing frame.")
	}
	frameID, _ := frame["id"].(string)
	if frameID == "" {
		return "", fmt.Errorf("frame tree entry is missing frame.id.")
	}
	childParentFrameID := parentFrameID
	if currentParentFrameID, _ := frame["parentId"].(string); currentParentFrameID != "" {
		childParentFrameID = currentParentFrameID
	}
	frames[frameID] = map[string]any{
		"targetId":      targetID,
		"url":           frame["url"],
		"parentFrameId": childParentFrameID,
	}
	childFrames, _ := tree["childFrames"].([]any)
	for _, rawChild := range childFrames {
		child, _ := rawChild.(map[string]any)
		if child == nil {
			continue
		}
		if _, err := r.recordFrameTree(child, targetID, frameID, frames); err != nil {
			return "", err
		}
	}
	return frameID, nil
}

func (r *AutoSessionRouter) recordShadowRoots(node map[string]any, frames map[string]map[string]any, roots map[string]map[string]any, objectGroup string, frameID string, outerBackendNodeID any) error {
	currentFrameID := frameID
	if nodeFrameID, _ := node["frameId"].(string); nodeFrameID != "" {
		currentFrameID = nodeFrameID
	}
	shadowRoots, _ := node["shadowRoots"].([]any)
	for _, rawShadowRoot := range shadowRoots {
		shadowRoot, _ := rawShadowRoot.(map[string]any)
		if shadowRoot == nil {
			continue
		}
		if currentFrameID != "" {
			frame := frames[currentFrameID]
			if frame != nil {
				frameTargetID, _ := frame["targetId"].(string)
				context := r.findExecutionContext(frameTargetID, "", currentFrameID, map[string]string{"world": "piercer"})
				backendNodeID, backendNodeIDOK := intFromAny(shadowRoot["backendNodeId"])
				if context != nil && backendNodeIDOK {
					contextSessionID, _ := context["sessionId"].(string)
					contextID, _ := intFromAny(context["id"])
					resolved, err := r.upstream.Send(
						"DOM.resolveNode",
						map[string]any{"backendNodeId": backendNodeID, "executionContextId": contextID, "objectGroup": objectGroup},
						contextSessionID,
					)
					if err != nil {
						return err
					}
					remoteObject, _ := resolved["object"].(map[string]any)
					objectID, _ := remoteObject["objectId"].(string)
					if objectID != "" {
						contextUniqueID, _ := context["uniqueId"].(string)
						rootOuterBackendNodeID := outerBackendNodeID
						if rootOuterBackendNodeID == nil {
							rootOuterBackendNodeID = node["backendNodeId"]
						}
						root := map[string]any{
							"kind":               "shadow",
							"frameId":            currentFrameID,
							"outerBackendNodeId": rootOuterBackendNodeID,
							"innerBackendNodeId": backendNodeID,
							"mode":               shadowRoot["shadowRootType"],
							"executionContextId": contextID,
						}
						if contextUniqueID != "" {
							root["uniqueContextId"] = contextUniqueID
						}
						roots[objectID] = root
					}
				}
			}
		}
		if err := r.recordShadowRoots(shadowRoot, frames, roots, objectGroup, currentFrameID, node["backendNodeId"]); err != nil {
			return err
		}
	}
	children, _ := node["children"].([]any)
	for _, rawChild := range children {
		child, _ := rawChild.(map[string]any)
		if child == nil {
			continue
		}
		if err := r.recordShadowRoots(child, frames, roots, objectGroup, currentFrameID, outerBackendNodeID); err != nil {
			return err
		}
	}
	contentDocument, _ := node["contentDocument"].(map[string]any)
	if contentDocument != nil {
		contentFrameID := currentFrameID
		if documentFrameID, _ := contentDocument["frameId"].(string); documentFrameID != "" {
			contentFrameID = documentFrameID
		}
		return r.recordShadowRoots(contentDocument, frames, roots, objectGroup, contentFrameID, outerBackendNodeID)
	}
	return nil
}

func (r *AutoSessionRouter) recordTarget(targetInfo map[string]any) {
	targetID, _ := targetInfo["targetId"].(string)
	if targetID == "" {
		return
	}
	sessionID := r.SessionId_from_targetId[targetID]
	existing := r.Targets[targetID]
	target := cloneMap(targetInfo)
	if sessionID != "" {
		target["sessionId"] = sessionID
	} else if existing != nil {
		if _, hasSessionID := existing["sessionId"]; hasSessionID && existing["sessionId"] == nil {
			target["sessionId"] = nil
		}
	}
	r.Targets[targetID] = target
}

func (r *AutoSessionRouter) recordTargetSession(targetID string, sessionID string, targetInfo map[string]any) {
	r.SessionId_from_targetId[targetID] = sessionID
	r.TargetId_from_sessionId[sessionID] = targetID
	target := cloneMap(targetInfo)
	if len(target) == 0 {
		target = cloneMap(r.Targets[targetID])
	}
	if len(target) == 0 {
		target = map[string]any{"targetId": targetID, "type": "page"}
	}
	target["targetId"] = targetID
	target["sessionId"] = sessionID
	r.Targets[targetID] = target
}

func (r *AutoSessionRouter) recordTargetSessionlessAttachment(targetID string) {
	existing := cloneMap(r.Targets[targetID])
	if len(existing) == 0 {
		existing = map[string]any{"targetId": targetID, "type": "page"}
	}
	existing["sessionId"] = nil
	r.Targets[targetID] = existing
}

func (r *AutoSessionRouter) recordExecutionContext(eventTargetID string, sessionID string, context map[string]any) {
	r.mu.Lock()
	targetID := eventTargetID
	if targetID == "" {
		targetID = r.TargetId_from_sessionId[sessionID]
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
	r.Contexts[contextKey(targetID, sessionID, contextID, uniqueID)] = topologyContext
	waiterKey := sessionID
	if waiterKey == "" {
		waiterKey = targetID
	}
	waiters := r.execution_context_waiters[waiterKey]
	matchedWaiters := []executionContextWaiter{}
	remainingWaiters := []executionContextWaiter{}
	for _, waiter := range waiters {
		if waiter.matches(topologyContext) {
			matchedWaiters = append(matchedWaiters, waiter)
		} else {
			remainingWaiters = append(remainingWaiters, waiter)
		}
	}
	if len(remainingWaiters) == 0 {
		delete(r.execution_context_waiters, waiterKey)
	} else {
		r.execution_context_waiters[waiterKey] = remainingWaiters
	}
	r.mu.Unlock()
	for _, waiter := range matchedWaiters {
		waiter.done <- executionContextResult{contextID: contextID, context: topologyContext}
	}
}

func (r *AutoSessionRouter) forgetTarget(targetID string) {
	r.mu.Lock()
	sessionID := r.SessionId_from_targetId[targetID]
	delete(r.Targets, targetID)
	r.mu.Unlock()
	if sessionID != "" {
		r.forgetSession(sessionID)
	}
	r.forgetExecutionContextsForRoute(targetID)
}

func (r *AutoSessionRouter) forgetSession(sessionID string) {
	r.mu.Lock()
	targetID := r.TargetId_from_sessionId[sessionID]
	delete(r.TargetId_from_sessionId, sessionID)
	if targetID != "" {
		delete(r.SessionId_from_targetId, targetID)
	}
	for contextKey, context := range r.Contexts {
		if context["sessionId"] == sessionID || context["targetId"] == sessionID {
			delete(r.Contexts, contextKey)
		}
	}
	waiters := r.execution_context_waiters[sessionID]
	delete(r.execution_context_waiters, sessionID)
	r.mu.Unlock()
	err := fmt.Errorf("Runtime execution context wait cancelled because session %s detached.", sessionID)
	for _, waiter := range waiters {
		waiter.done <- executionContextResult{err: err}
	}
}

func (r *AutoSessionRouter) forgetExecutionContextByID(routeKey string, contextID int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for contextKey, context := range r.Contexts {
		currentContextID, ok := intFromAny(context["id"])
		if !ok || currentContextID != contextID {
			continue
		}
		if context["sessionId"] == routeKey || context["targetId"] == routeKey {
			delete(r.Contexts, contextKey)
		}
	}
}

func (r *AutoSessionRouter) forgetExecutionContextsForRoute(routeKey string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for contextKey, context := range r.Contexts {
		if context["sessionId"] == routeKey || context["targetId"] == routeKey {
			delete(r.Contexts, contextKey)
		}
	}
}

func (r *AutoSessionRouter) forgetExecutionContextsForFrame(sessionID string, targetID string, frameID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for contextKey, context := range r.Contexts {
		if context["frameId"] != frameID {
			continue
		}
		if sessionID != "" && context["sessionId"] == sessionID {
			delete(r.Contexts, contextKey)
		} else if targetID != "" && context["targetId"] == targetID {
			delete(r.Contexts, contextKey)
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
	for _, context := range r.Contexts {
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
		timeoutMS = r.Config.LoopbackExecutionContextTimeoutMS
	}
	r.mu.Lock()
	for _, context := range r.Contexts {
		if matches(context) {
			r.mu.Unlock()
			return context, nil
		}
	}
	if waiterKey == "" {
		r.mu.Unlock()
		return nil, fmt.Errorf("cannot wait for a Runtime execution context without a route")
	}
	waiter := executionContextWaiter{done: make(chan executionContextResult, 1), matches: matches}
	r.execution_context_waiters[waiterKey] = append(r.execution_context_waiters[waiterKey], waiter)
	r.mu.Unlock()
	select {
	case result := <-waiter.done:
		return result.context, result.err
	case <-time.After(time.Duration(timeoutMS) * time.Millisecond):
		r.mu.Lock()
		waiters := r.execution_context_waiters[waiterKey]
		filtered := waiters[:0]
		for _, candidate := range waiters {
			if candidate.done != waiter.done {
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
	explicitTargetID := r.upstream.ResolveTargetID(params)
	if explicitTargetID != "" {
		return explicitTargetID, nil
	}
	targetInfos, err := r.upstream.GetTargets()
	if err != nil {
		return "", err
	}
	for _, targetInfo := range targetInfos {
		r.recordTarget(targetInfo)
	}
	for _, targetInfo := range targetInfos {
		if targetInfo["type"] != "page" {
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

func cloneStringMap(input map[string]string) map[string]string {
	output := map[string]string{}
	for key, value := range input {
		output[key] = value
	}
	return output
}

func randomHexSuffix(bytesLen int) string {
	buf := make([]byte, bytesLen)
	if _, err := rand.Read(buf); err == nil {
		return hex.EncodeToString(buf)
	}
	return fmt.Sprintf("%d", time.Now().UnixNano())
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
