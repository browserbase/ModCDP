package transport_test

import (
	. "github.com/browserbase/modcdp/go/modcdp/transport"
	"reflect"
	"testing"
)

func TestNativeMessagingUpstreamTransportConnectsToNativeMessagingStdioDirectly(t *testing.T) {
	transport := NewNativeMessagingUpstreamTransport(NativeMessagingUpstreamTransportOptions{})
	if !reflect.DeepEqual(transport.GetInjectorConfig(), InjectorOptions{}) {
		t.Fatalf("injector config = %#v", transport.GetInjectorConfig())
	}
	if len(transport.GetServerConfig()) != 0 {
		t.Fatalf("server config = %#v", transport.GetServerConfig())
	}
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
}
