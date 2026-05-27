// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.UpstreamTransport.ts
// - ./python/tests/test_UpstreamTransport.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package transport

import (
	"reflect"
	"strings"
	"testing"

	"github.com/browserbase/modcdp/go/modcdp/types"
)

type testUpstreamTransport struct {
	UpstreamTransport
}

func (t *testUpstreamTransport) emit(message string) error {
	return t.parseAndEmitRecv([]byte(message))
}

func TestOwnsSharedTransportConfigAndRecvCallbacks(t *testing.T) {
	transport := NewUpstreamTransport(UpstreamTransportConfig{})
	received := []map[string]any{}
	stop := transport.OnRecv(func(message map[string]any) { received = append(received, message) })

	parsedHostPort, err := ParseHostPort("127.0.0.1:29292", "0.0.0.0", 80)
	if err != nil {
		t.Fatal(err)
	}
	if parsedHostPort.Host != "127.0.0.1" || parsedHostPort.Port != 29292 {
		t.Fatalf("ParseHostPort = %#v", parsedHostPort)
	}
	transport.Update(nil)
	if len(transport.ConfigForLauncher().LauncherLocalExtraArgs) != 0 {
		t.Fatal("expected empty launcher config")
	}

	testTransport := &testUpstreamTransport{UpstreamTransport: NewUpstreamTransport(UpstreamTransportConfig{})}
	parsed := []map[string]any{}
	testTransport.OnRecv(func(message map[string]any) { parsed = append(parsed, message) })
	for _, message := range []string{
		`{"id":1,"result":{"ok":true}}`,
		`{"id":2,"result":true}`,
		`{"id":3,"result":0}`,
		`{"method":"Runtime.executionContextCreated","params":{}}`,
	} {
		if err := testTransport.emit(message); err != nil {
			t.Fatal(err)
		}
	}
	expected := []map[string]any{
		{"id": float64(1), "result": map[string]any{"ok": true}},
		{"id": float64(2), "result": true},
		{"id": float64(3), "result": float64(0)},
		{"method": "Runtime.executionContextCreated", "params": map[string]any{}},
	}
	if !reflect.DeepEqual(parsed, expected) {
		t.Fatalf("parsed = %#v", parsed)
	}

	stop()
	if len(received) != 0 {
		t.Fatalf("received = %#v", received)
	}
	if err := transport.Connect(); err == nil || !strings.Contains(err.Error(), "Connect is not implemented") {
		t.Fatalf("connect error = %v", err)
	}
	if _, err := transport.Send(types.CdpCommandMessage{ID: 1, Method: "Browser.getVersion", Params: map[string]any{}}, nil, ""); err == nil || !strings.Contains(err.Error(), "send is not implemented") {
		t.Fatalf("send error = %v", err)
	}
}
