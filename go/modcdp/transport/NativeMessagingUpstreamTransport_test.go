package transport_test

import (
	"encoding/json"
	. "github.com/browserbase/modcdp/go/modcdp/transport"
	"testing"
)

func TestNativeMessagingUpstreamTransportConfigOwnsHostAndInjectorConfig(t *testing.T) {
	encoded, err := json.Marshal(NativeMessagingUpstreamTransportOptions{
		UpstreamNativeMessagingHostName: "com.modcdp.test",
	})
	if err != nil {
		t.Fatal(err)
	}
	if raw := string(encoded); raw != `{"upstream_nativemessaging_host_name":"com.modcdp.test"}` {
		t.Fatalf("NativeMessagingUpstreamTransportOptions JSON = %s", raw)
	}

	transport := NewNativeMessagingUpstreamTransport(NativeMessagingUpstreamTransportOptions{
		UpstreamNativeMessagingHostName: "com.modcdp.test",
	})
	if transport.GetInjectorConfig().UpstreamNativeMessagingHostName != "com.modcdp.test" {
		t.Fatalf("injector config = %#v", transport.GetInjectorConfig())
	}
	if len(transport.GetServerConfig()) != 0 {
		t.Fatalf("server config = %#v", transport.GetServerConfig())
	}
	if transport.URL != "native://com.modcdp.test" {
		t.Fatalf("URL = %q", transport.URL)
	}
}

func TestNativeMessagingUpstreamTransportConnectsToNativeMessagingStdioDirectly(t *testing.T) {
	transport := NewNativeMessagingUpstreamTransport(NativeMessagingUpstreamTransportOptions{})
	if err := transport.Connect(); err != nil {
		t.Fatal(err)
	}
	defer transport.Close()
	if err := transport.WaitForPeer(); err != nil {
		t.Fatalf("WaitForPeer before close = %v", err)
	}
	if err := transport.Close(); err != nil {
		t.Fatalf("Close = %v", err)
	}
	if !transport.Closed() {
		t.Fatalf("closed after Close = %v", transport.Closed())
	}
}
