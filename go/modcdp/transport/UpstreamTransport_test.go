// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.UpstreamTransport.ts
// - ./python/tests/test_UpstreamTransport.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package transport_test

import (
	. "github.com/browserbase/modcdp/go/modcdp/transport"
	"strings"
	"testing"
)

type testUpstreamTransport struct {
	UpstreamTransport
}

func (t *testUpstreamTransport) emit(message map[string]any) {
	t.EmitRecv(message)
}

func TestUpstreamTransportSharedConfigAndRecvCallbacks(t *testing.T) {
	transport := &UpstreamTransport{}
	received := []map[string]any{}
	stop := transport.OnRecv(func(message map[string]any) { received = append(received, message) })

	transport.Update(nil)
	if len(transport.ConfigForLauncher().LauncherLocalExtraArgs) != 0 {
		t.Fatal("expected empty launcher config")
	}
	if transport.ConfigForInjector().InjectorServiceWorkerExtensionID != "" {
		t.Fatal("expected empty injector config")
	}
	if len(transport.ConfigForServer()) != 0 {
		t.Fatal("expected empty server config")
	}

	testTransport := &testUpstreamTransport{}
	parsed := []map[string]any{}
	testTransport.OnRecv(func(message map[string]any) { parsed = append(parsed, message) })
	testTransport.emit(map[string]any{"id": 1, "result": map[string]any{"ok": true}})
	testTransport.emit(map[string]any{"method": "Runtime.executionContextCreated", "params": map[string]any{}})
	if len(parsed) != 2 {
		t.Fatalf("parsed = %#v", parsed)
	}

	transport.EmitRecv(map[string]any{"method": "before.stop"})
	if len(received) != 1 {
		t.Fatalf("received = %#v", received)
	}
	stop()
	stop()
	transport.EmitRecv(map[string]any{"method": "after.stop"})
	if len(received) != 1 {
		t.Fatalf("received after stop = %#v", received)
	}
	closed := 0
	stopClose := transport.OnClose(func(error) { closed++ })
	stopClose()
	stopClose()
	transport.EmitClose(nil)
	if closed != 0 {
		t.Fatalf("closed after stop = %d", closed)
	}
	if err := transport.Connect(); err == nil || !strings.Contains(err.Error(), "Connect is not implemented") {
		t.Fatalf("connect error = %v", err)
	}
	if err := transport.Send(map[string]any{"id": 1, "method": "Browser.getVersion", "params": map[string]any{}}); err == nil || !strings.Contains(err.Error(), "Send is not implemented") {
		t.Fatalf("send error = %v", err)
	}
}
