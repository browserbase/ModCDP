package transport

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"
)

const DefaultUpstreamNativeMessagingHostName = "com.modcdp.bridge"

type NativeMessagingUpstreamTransport struct {
	UpstreamTransport
	UpstreamNativeMessagingHostName string
	writeMu                         sync.Mutex
	stateMu                         sync.Mutex
	connected                       bool
}

type NativeMessagingUpstreamTransportOptions struct {
	UpstreamNativeMessagingHostName string `json:"upstream_nativemessaging_host_name,omitempty"`
}

func NewNativeMessagingUpstreamTransport(options NativeMessagingUpstreamTransportOptions) *NativeMessagingUpstreamTransport {
	nativeHostName := firstNonEmptyString(options.UpstreamNativeMessagingHostName, DefaultUpstreamNativeMessagingHostName)
	return &NativeMessagingUpstreamTransport{
		UpstreamNativeMessagingHostName: nativeHostName,
	}
}

func (t *NativeMessagingUpstreamTransport) Update(config map[string]any) {
}

func (t *NativeMessagingUpstreamTransport) GetServerConfig() map[string]any {
	return map[string]any{}
}

func (t *NativeMessagingUpstreamTransport) GetInjectorConfig() ExtensionInjectorConfig {
	return ExtensionInjectorConfig{UpstreamNativeMessagingHostName: t.UpstreamNativeMessagingHostName}
}

func (t *NativeMessagingUpstreamTransport) Connect() error {
	t.stateMu.Lock()
	if t.connected {
		t.stateMu.Unlock()
		return nil
	}
	t.connected = true
	t.stateMu.Unlock()
	go t.readLoop()
	return nil
}

func (t *NativeMessagingUpstreamTransport) Send(message map[string]any) error {
	t.writeMu.Lock()
	defer t.writeMu.Unlock()
	t.stateMu.Lock()
	connected := t.connected
	t.stateMu.Unlock()
	if !connected {
		return fmt.Errorf("native messaging stdio is not connected for %s", t.UpstreamNativeMessagingHostName)
	}
	return writeLengthPrefixedJSON(os.Stdout, message)
}

func (t *NativeMessagingUpstreamTransport) WaitForPeer() error {
	t.stateMu.Lock()
	connected := t.connected
	t.stateMu.Unlock()
	if !connected {
		return fmt.Errorf("native messaging stdio is not connected for %s", t.UpstreamNativeMessagingHostName)
	}
	return nil
}

func (t *NativeMessagingUpstreamTransport) Close() error {
	t.stateMu.Lock()
	t.connected = false
	t.stateMu.Unlock()
	return nil
}

func (t *NativeMessagingUpstreamTransport) readLoop() {
	reader := bufio.NewReader(os.Stdin)
	for {
		message, err := readLengthPrefixedJSON(reader)
		if err != nil {
			t.stateMu.Lock()
			connected := t.connected
			t.stateMu.Unlock()
			if connected {
				t.emitClose(err)
			}
			return
		}
		t.emitRecv(message)
	}
}

func writeLengthPrefixedJSON(writer io.Writer, message map[string]any) error {
	body, err := json.Marshal(message)
	if err != nil {
		return err
	}
	header := make([]byte, 4)
	binary.LittleEndian.PutUint32(header, uint32(len(body)))
	if _, err := writer.Write(header); err != nil {
		return err
	}
	_, err = writer.Write(body)
	return err
}

func readLengthPrefixedJSON(reader io.Reader) (map[string]any, error) {
	header := make([]byte, 4)
	if _, err := io.ReadFull(reader, header); err != nil {
		return nil, err
	}
	body := make([]byte, binary.LittleEndian.Uint32(header))
	if _, err := io.ReadFull(reader, body); err != nil {
		return nil, err
	}
	var message map[string]any
	if err := json.Unmarshal(body, &message); err != nil {
		return nil, err
	}
	return message, nil
}
