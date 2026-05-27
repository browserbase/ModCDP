// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/transport/WSUpstreamTransport.ts
// - ./python/modcdp/transport/WSUpstreamTransport.py
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

type WSUpstreamTransport struct {
	UpstreamTransport
	URL     string
	Conn    net.Conn
	writeMu sync.Mutex
}

func NewWSUpstreamTransport(config UpstreamTransportConfig) *WSUpstreamTransport {
	transport := &WSUpstreamTransport{UpstreamTransport: NewUpstreamTransport(config), URL: config.UpstreamWSCDPURL}
	transport.writeCommand = func(command map[string]any) error {
		body, err := json.Marshal(command)
		if err != nil {
			return err
		}
		transport.writeMu.Lock()
		defer transport.writeMu.Unlock()
		conn := transport.Conn
		if conn == nil {
			return fmt.Errorf("CDP websocket is not connected")
		}
		return wsutil.WriteClientText(conn, body)
	}
	return transport
}

func (t *WSUpstreamTransport) Update(config map[string]any) {
	t.UpstreamTransport.Update(config)
	if config == nil {
		return
	}
	if value, ok := config["upstream_ws_cdp_url"].(string); ok && value != "" {
		t.URL = value
	}
}

func (t *WSUpstreamTransport) Connect() error {
	if t.URL == "" {
		return fmt.Errorf("WSUpstreamTransport requires upstream_ws_cdp_url or launcher-provided cdp_url")
	}
	// URL may start as an HTTP upstream_ws_cdp_url; from here on it is the resolved WebSocket CDP endpoint.
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

func (t *WSUpstreamTransport) Close() error {
	t.writeMu.Lock()
	defer t.writeMu.Unlock()
	if t.Conn != nil {
		err := t.Conn.Close()
		t.Conn = nil
		return err
	}
	return nil
}

func (t *WSUpstreamTransport) ToJSON() map[string]any {
	jsonValue := t.UpstreamTransport.ToJSON()
	state, _ := jsonValue["state"].(map[string]any)
	if state == nil {
		state = map[string]any{}
	}
	t.writeMu.Lock()
	state["connected"] = t.Conn != nil
	t.writeMu.Unlock()
	jsonValue["state"] = state
	return jsonValue
}

func (t *WSUpstreamTransport) readLoop(conn net.Conn) {
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
