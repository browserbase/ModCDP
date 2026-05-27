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
	closeCh                         chan struct{}
}

func NewNativeMessagingUpstreamTransport(options UpstreamTransportOptions) *NativeMessagingUpstreamTransport {
	nativemessagingHostName := firstNonEmptyString(options.UpstreamNativeMessagingHostName, DefaultUpstreamNativeMessagingHostName)
	return &NativeMessagingUpstreamTransport{
		UpstreamTransport:               NewUpstreamTransport(options),
		UpstreamNativeMessagingHostName: nativemessagingHostName,
	}
}

func (t *NativeMessagingUpstreamTransport) Update(config map[string]any) {
	t.UpstreamTransport.Update(config)
}

func (t *NativeMessagingUpstreamTransport) ConfigForServer() map[string]any {
	return map[string]any{}
}

func (t *NativeMessagingUpstreamTransport) ConfigForInjector() InjectorOptions {
	return InjectorOptions{}
}

func (t *NativeMessagingUpstreamTransport) Connect() error {
	t.stateMu.Lock()
	if t.closeCh != nil {
		t.stateMu.Unlock()
		return nil
	}
	closeCh := make(chan struct{})
	t.closeCh = closeCh
	t.stateMu.Unlock()
	go t.readLoop(closeCh)
	return nil
}

func (t *NativeMessagingUpstreamTransport) Send(message map[string]any) error {
	t.writeMu.Lock()
	defer t.writeMu.Unlock()
	t.stateMu.Lock()
	closeCh := t.closeCh
	t.stateMu.Unlock()
	if closeCh == nil {
		return fmt.Errorf("native messaging stdio is not connected for %s", t.UpstreamNativeMessagingHostName)
	}
	return writeLengthPrefixedJSON(os.Stdout, message)
}

func (t *NativeMessagingUpstreamTransport) WaitForPeer() error {
	t.stateMu.Lock()
	closeCh := t.closeCh
	t.stateMu.Unlock()
	if closeCh == nil {
		return fmt.Errorf("native messaging stdio is not connected for %s", t.UpstreamNativeMessagingHostName)
	}
	return nil
}

func (t *NativeMessagingUpstreamTransport) Close() error {
	t.stateMu.Lock()
	closeCh := t.closeCh
	t.closeCh = nil
	t.stateMu.Unlock()
	if closeCh != nil {
		close(closeCh)
	}
	return nil
}

func (t *NativeMessagingUpstreamTransport) readLoop(closeCh chan struct{}) {
	reader := bufio.NewReader(os.Stdin)
	for {
		message, err := readLengthPrefixedJSON(reader)
		if err != nil {
			t.stateMu.Lock()
			active := t.closeCh == closeCh
			if active {
				t.closeCh = nil
			}
			t.stateMu.Unlock()
			if active {
				t.emitClose(err)
			}
			return
		}
		select {
		case <-closeCh:
			return
		default:
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
