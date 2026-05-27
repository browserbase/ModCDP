package transport_test

import (
	. "github.com/browserbase/modcdp/go/modcdp/transport"
	"reflect"
	"testing"
)

func TestNativeMessagingUpstreamTransportConnectsToNativeMessagingStdioDirectly(t *testing.T) {
	transport := NewNativeMessagingUpstreamTransport(UpstreamTransportOptions{})
	if !reflect.DeepEqual(transport.ConfigForInjector(), InjectorOptions{}) {
		t.Fatalf("injector config = %#v", transport.ConfigForInjector())
	}
	if len(transport.ConfigForServer()) != 0 {
		t.Fatalf("server config = %#v", transport.ConfigForServer())
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
