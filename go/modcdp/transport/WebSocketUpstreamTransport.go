package transport

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"sync"

	"github.com/gobwas/ws"
	"github.com/gobwas/ws/wsutil"
)

type WebSocketUpstreamTransport struct {
	UpstreamTransport
	URL     string
	Conn    net.Conn
	writeMu sync.Mutex
}

type WebSocketUpstreamTransportOptions struct {
	CDPURL string `json:"cdp_url,omitempty"`
}

func NewWebSocketUpstreamTransport(options WebSocketUpstreamTransportOptions) *WebSocketUpstreamTransport {
	return &WebSocketUpstreamTransport{URL: options.CDPURL}
}

func (t *WebSocketUpstreamTransport) Update(config map[string]any) {
	if config == nil {
		return
	}
	if value, ok := config["cdp_url"].(string); ok && value != "" {
		t.URL = value
	}
}

func (t *WebSocketUpstreamTransport) Connect() error {
	if t.URL == "" {
		return fmt.Errorf("WebSocketUpstreamTransport requires upstream_cdp_url or launcher-provided cdp_url")
	}
	// URL may start as an HTTP cdp_url; from here on it is the resolved WebSocket CDP endpoint.
	resolvedURL, err := websocketURLFor(t.URL)
	if err != nil {
		return err
	}
	t.URL = resolvedURL
	conn, _, _, err := ws.Dial(context.Background(), t.URL)
	if err != nil {
		return err
	}
	t.writeMu.Lock()
	t.Conn = conn
	t.writeMu.Unlock()
	go t.readLoop(conn)
	return nil
}

func (t *WebSocketUpstreamTransport) Send(message map[string]any) error {
	body, err := json.Marshal(message)
	if err != nil {
		return err
	}
	t.writeMu.Lock()
	defer t.writeMu.Unlock()
	conn := t.Conn
	if conn == nil {
		return fmt.Errorf("CDP websocket is not connected")
	}
	return wsutil.WriteClientText(conn, body)
}

func (t *WebSocketUpstreamTransport) Close() error {
	t.writeMu.Lock()
	defer t.writeMu.Unlock()
	if t.Conn != nil {
		err := t.Conn.Close()
		t.Conn = nil
		return err
	}
	return nil
}

func (t *WebSocketUpstreamTransport) readLoop(conn net.Conn) {
	for {
		data, err := wsutil.ReadServerText(conn)
		if err != nil {
			t.writeMu.Lock()
			currentConn := t.Conn
			t.writeMu.Unlock()
			if currentConn == conn {
				t.emitClose(err)
			}
			return
		}
		var message map[string]any
		if err := json.Unmarshal(data, &message); err == nil {
			t.emitRecv(message)
		}
	}
}
