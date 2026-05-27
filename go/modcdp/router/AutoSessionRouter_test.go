// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.AutoSessionRouter.ts
// - ./python/tests/test_AutoSessionRouter.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package router

import (
	"strings"
	"testing"
	"time"

	"github.com/browserbase/modcdp/go/modcdp/launcher"
	"github.com/browserbase/modcdp/go/modcdp/transport"
	"github.com/browserbase/modcdp/go/modcdp/types"
)

func TestAutoSessionRouterTracksRealTargetSessionsAndExecutionContexts(t *testing.T) {
	headless := true
	chrome, err := launcher.NewLocalBrowserLauncher(launcher.LauncherConfig{
		LauncherLocalHeadless: &headless,
	}).Launch(launcher.LauncherConfig{})
	if err != nil {
		t.Fatal(err)
	}
	defer chrome.Close()
	upstream := transport.NewWSUpstreamTransport(types.UpstreamTransportConfig{
		UpstreamMode:             "ws",
		UpstreamWSCDPURL:         chrome.CDPURL,
		UpstreamCDPSendTimeoutMS: 10000,
	})
	if err := upstream.Connect(); err != nil {
		t.Fatal(err)
	}
	defer upstream.Close()

	router := NewAutoSessionRouter(&upstream.UpstreamTransport, types.ModCDPRouterConfig{LoopbackExecutionContextTimeoutMS: 30000})
	if err := router.Start(); err != nil {
		t.Fatal(err)
	}
	defer router.Stop()

	send := func(method string, params map[string]any, sessionID string) (map[string]any, error) {
		return upstream.Send(method, params, sessionID)
	}

	var targetID string
	var pendingTargetID string
	defer func() {
		if targetID != "" {
			_, _ = send("Target.closeTarget", map[string]any{"targetId": targetID}, "")
		}
		if pendingTargetID != "" {
			_, _ = send("Target.closeTarget", map[string]any{"targetId": pendingTargetID}, "")
		}
	}()

	created, err := send("Target.createTarget", map[string]any{"url": "about:blank#modcdp-auto-session-router"}, "")
	if err != nil {
		t.Fatal(err)
	}
	targetID, _ = created["targetId"].(string)
	sessionID := waitForString(t, func() string { return router.sessionId_from_targetId[targetID] })
	contextResult := make(chan int, 1)
	contextError := make(chan error, 1)
	go func() {
		contextID, err := router.WaitForExecutionContext(sessionID, 30000)
		if err != nil {
			contextError <- err
			return
		}
		contextResult <- contextID
	}()
	if _, err := send("Runtime.enable", map[string]any{}, sessionID); err != nil {
		t.Fatal(err)
	}
	select {
	case contextID := <-contextResult:
		if contextID == 0 {
			t.Fatal("context id was zero")
		}
	case err := <-contextError:
		t.Fatal(err)
	case <-time.After(35 * time.Second):
		t.Fatal("timed out waiting for execution context")
	}
	if _, err := send("Target.detachFromTarget", map[string]any{"sessionId": sessionID}, ""); err != nil {
		t.Fatal(err)
	}
	waitForString(t, func() string {
		if router.sessionId_from_targetId[targetID] == "" {
			return "detached"
		}
		return ""
	})
	for _, context := range router.contexts {
		if context["sessionId"] == sessionID {
			t.Fatal("execution context remained after detach")
		}
	}
	if _, err := send("Target.closeTarget", map[string]any{"targetId": targetID}, ""); err != nil {
		t.Fatal(err)
	}
	targetID = ""

	pendingCreated, err := send("Target.createTarget", map[string]any{"url": "about:blank#modcdp-auto-session-router-pending-context"}, "")
	if err != nil {
		t.Fatal(err)
	}
	pendingTargetID, _ = pendingCreated["targetId"].(string)
	pendingSessionID := waitForString(t, func() string { return router.sessionId_from_targetId[pendingTargetID] })
	pendingContextError := make(chan error, 1)
	go func() {
		_, err := router.WaitForExecutionContext(pendingSessionID, 30000)
		pendingContextError <- err
	}()
	if _, err := send("Target.detachFromTarget", map[string]any{"sessionId": pendingSessionID}, ""); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-pendingContextError:
		if err == nil || !strings.Contains(err.Error(), "Runtime execution context wait cancelled because session "+pendingSessionID+" detached") {
			t.Fatalf("wait error = %v", err)
		}
	case <-time.After(35 * time.Second):
		t.Fatal("timed out waiting for detach error")
	}
	waitForString(t, func() string {
		if router.sessionId_from_targetId[pendingTargetID] == "" {
			return "detached"
		}
		return ""
	})
	for _, context := range router.contexts {
		if context["sessionId"] == pendingSessionID {
			t.Fatal("execution context was recorded for detached pending session")
		}
	}
	if _, err := send("Target.closeTarget", map[string]any{"targetId": pendingTargetID}, ""); err != nil {
		t.Fatal(err)
	}
	pendingTargetID = ""
}

func waitForString(t *testing.T, fn func() string) string {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		value := fn()
		if value != "" {
			return value
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("timed out waiting for string")
	return ""
}
