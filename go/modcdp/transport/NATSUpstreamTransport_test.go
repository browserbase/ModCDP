package transport_test

import (
	"context"
	"encoding/json"
	"fmt"
	. "github.com/browserbase/modcdp/go/modcdp/transport"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/gobwas/ws"
)

func TestNATSUpstreamTransportConfigOwnsURLUpstreamNATSSubjectPrefixWaitTimeoutAndInjectorOptions(t *testing.T) {
	encoded, err := json.Marshal(UpstreamTransportOptions{
		UpstreamNATSURL:           "ws://127.0.0.1:4223",
		UpstreamNATSSubjectPrefix: "modcdp.one",
		UpstreamNATSRole:          "client",
		UpstreamNATSWaitTimeoutMS: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	if raw := string(encoded); raw != `{"upstream_nats_url":"ws://127.0.0.1:4223","upstream_nats_subject_prefix":"modcdp.one","upstream_nats_role":"client","upstream_nats_wait_timeout_ms":10}` {
		t.Fatalf("UpstreamTransportOptions JSON = %s", raw)
	}

	transport := NewNATSUpstreamTransport(UpstreamTransportOptions{
		UpstreamNATSURL:           "ws://127.0.0.1:4223",
		UpstreamNATSSubjectPrefix: "modcdp.one",
	})
	if transport.URL != "ws://127.0.0.1:4223/" {
		t.Fatalf("URL = %q", transport.URL)
	}
	if transport.UpstreamNATSSubjectPrefix != "modcdp.one" {
		t.Fatalf("UpstreamNATSSubjectPrefix = %q", transport.UpstreamNATSSubjectPrefix)
	}
	if injectorConfig := transport.ConfigForInjector(); !reflect.DeepEqual(injectorConfig, InjectorOptions{}) {
		t.Fatalf("injector config = %#v", injectorConfig)
	}
	transport.Update(map[string]any{
		"upstream_nats_url":             "nats://127.0.0.1:4222",
		"upstream_nats_subject_prefix":  "modcdp.two",
		"upstream_nats_role":            "browser",
		"upstream_nats_wait_timeout_ms": 5,
	})
	if transport.URL != "nats://127.0.0.1:4222" {
		t.Fatalf("URL after update = %q", transport.URL)
	}
	if transport.UpstreamNATSSubjectPrefix != "modcdp.two" {
		t.Fatalf("UpstreamNATSSubjectPrefix after update = %q", transport.UpstreamNATSSubjectPrefix)
	}
	if transport.UpstreamNATSRole != "browser" {
		t.Fatalf("UpstreamNATSRole after update = %q", transport.UpstreamNATSRole)
	}
	if err := transport.WaitForPeer(); err == nil || !strings.Contains(err.Error(), "timed out waiting 5ms for NATS ModCDP peer") {
		t.Fatalf("WaitForPeer error = %v", err)
	}
}

func TestNATSUpstreamTransportCloseResetsPeerWaitState(t *testing.T) {
	transport := NewNATSUpstreamTransport(UpstreamTransportOptions{UpstreamNATSWaitTimeoutMS: 5})

	transport.HandlePayload(`{"type":"modcdp.nats.hello","role":"browser","version":1}`)
	if err := transport.WaitForPeer(); err != nil {
		t.Fatalf("WaitForPeer before close = %v", err)
	}
	if err := transport.Close(); err != nil {
		t.Fatalf("Close = %v", err)
	}
	if err := transport.WaitForPeer(); err == nil || !strings.Contains(err.Error(), "timed out waiting 5ms for NATS ModCDP peer") {
		t.Fatalf("WaitForPeer after close = %v", err)
	}
}

func TestNATSUpstreamTransportCloseRejectsPendingPeerWaits(t *testing.T) {
	transport := NewNATSUpstreamTransport(UpstreamTransportOptions{
		UpstreamNATSURL:           "ws://127.0.0.1:4223",
		UpstreamNATSSubjectPrefix: "modcdp.close",
		UpstreamNATSWaitTimeoutMS: 5_000,
	})
	done := make(chan error, 1)
	go func() {
		done <- transport.WaitForPeer()
	}()
	time.Sleep(50 * time.Millisecond)
	if err := transport.Close(); err != nil {
		t.Fatalf("Close = %v", err)
	}
	select {
	case err := <-done:
		if err == nil || !strings.Contains(err.Error(), "NATS transport for modcdp.close closed before a peer connected") {
			t.Fatalf("WaitForPeer close error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("WaitForPeer did not return after Close")
	}
}

func TestNATSUpstreamTransportReconnectsAfterCloseAgainstRealNATSServer(t *testing.T) {
	nats := startNATSServer(t)
	defer nats.close()
	transport := NewNATSUpstreamTransport(UpstreamTransportOptions{
		UpstreamNATSURL:           nats.url,
		UpstreamNATSSubjectPrefix: fmt.Sprintf("modcdp.reconnect.%d", time.Now().UnixMilli()),
	})
	defer transport.Close()

	if err := transport.Connect(); err != nil {
		t.Fatal(err)
	}
	if err := transport.Send(map[string]any{"id": 1, "method": "Browser.getVersion"}); err != nil {
		t.Fatalf("Send after Connect = %v", err)
	}
	if err := transport.Close(); err != nil {
		t.Fatal(err)
	}
	if err := transport.Send(map[string]any{"id": 2, "method": "Browser.getVersion"}); err == nil || !strings.Contains(err.Error(), "NATS transport is not connected") {
		t.Fatalf("Send after Close error = %v", err)
	}
	if err := transport.Connect(); err != nil {
		t.Fatal(err)
	}
	if err := transport.Send(map[string]any{"id": 3, "method": "Browser.getVersion"}); err != nil {
		t.Fatalf("Send after reconnect = %v", err)
	}
}

type natsTestServer struct {
	url   string
	close func()
}

func startNATSServer(t *testing.T) natsTestServer {
	t.Helper()
	websocketPort, err := freePort()
	if err != nil {
		t.Fatal(err)
	}
	clientPort, err := freePort()
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	configPath := filepath.Join(dir, "nats.conf")
	config := strings.Join([]string{
		`host: "127.0.0.1"`,
		fmt.Sprintf("port: %d", clientPort),
		"websocket {",
		`  host: "127.0.0.1"`,
		fmt.Sprintf("  port: %d", websocketPort),
		"  no_tls: true",
		"}",
		"",
	}, "\n")
	if err := os.WriteFile(configPath, []byte(config), 0o644); err != nil {
		t.Fatal(err)
	}
	binaryPath := natsServerBinaryPath(t)
	cmd := exec.Command(binaryPath, "-c", configPath)
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	url := fmt.Sprintf("ws://127.0.0.1:%d", websocketPort)
	closeServer := func() {
		if cmd.Process == nil {
			return
		}
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	}
	t.Cleanup(closeServer)
	if err := waitForNATSWebSocket(url, 10*time.Second); err != nil {
		closeServer()
		t.Fatal(err)
	}
	return natsTestServer{url: url, close: closeServer}
}

func natsServerBinaryPath(t *testing.T) string {
	t.Helper()
	cmd := exec.Command(
		"pnpm",
		"exec",
		"node",
		"--input-type=module",
		"-e",
		"import { getBinaryPath } from '@eplightning/nats-server'; console.log(await getBinaryPath())",
	)
	cmd.Dir = filepath.Clean(filepath.Join("..", ".."))
	body, err := cmd.Output()
	if err != nil {
		t.Fatal(err)
	}
	return strings.TrimSpace(string(body))
}

func waitForNATSWebSocket(rawURL string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	var lastErr error
	for time.Now().Before(deadline) {
		conn, _, _, err := ws.Dial(context.Background(), rawURL)
		if err == nil {
			_ = conn.Close()
			return nil
		}
		lastErr = err
		time.Sleep(50 * time.Millisecond)
	}
	if lastErr != nil {
		return lastErr
	}
	return fmt.Errorf("timed out waiting for %s", rawURL)
}
