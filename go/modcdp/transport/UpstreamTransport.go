// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/transport/UpstreamTransport.ts
// - ./python/modcdp/transport/UpstreamTransport.py
package transport

import (
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/browserbase/modcdp/go/modcdp/injector"
	"github.com/browserbase/modcdp/go/modcdp/launcher"
	"github.com/browserbase/modcdp/go/modcdp/types"
)

type InjectorConfig = types.InjectorConfig
type LauncherConfig = types.LauncherConfig
type UpstreamTransportConfig = types.UpstreamTransportConfig

const DefaultModCDPExtensionID = injector.DefaultModCDPExtensionID

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func boolPtr(value bool) *bool {
	return &value
}

func freePort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port, nil
}

func websocketURLFor(endpoint string) (string, error) {
	return launcher.WebsocketURLFor(endpoint)
}

type UpstreamMode string

const (
	UpstreamModeWS UpstreamMode = "ws"
)

type UpstreamTransport struct {
	Config         UpstreamTransportConfig
	recvListeners  []recvListener
	closeListeners []closeListener
	listenerMu     sync.Mutex
	nextListenerID int64
	nextID         int64
	pending        map[int64]chan map[string]any
	pendingMu      sync.Mutex
	writeCommand   func(map[string]any) error
}

type recvListener struct {
	id int64
	fn func(map[string]any)
}

type closeListener struct {
	id int64
	fn func(error)
}

func NewUpstreamTransport(options UpstreamTransportConfig) UpstreamTransport {
	return UpstreamTransport{
		Config:  options,
		pending: map[int64]chan map[string]any{},
		writeCommand: func(map[string]any) error {
			return fmt.Errorf("UpstreamTransport.send is not implemented")
		},
	}
}

func (e *UpstreamTransport) Update(config map[string]any) {
	if config == nil {
		return
	}
	if value, ok := config["upstream_ws_cdp_url"].(string); ok {
		e.Config.UpstreamWSCDPURL = value
	}
	if value, ok := intFromConfig(config["upstream_ws_connect_error_settle_timeout_ms"]); ok {
		e.Config.UpstreamWSConnectErrorSettleTimeoutMS = value
	}
	if value, ok := intFromConfig(config["upstream_cdp_send_timeout_ms"]); ok {
		e.Config.UpstreamCDPSendTimeoutMS = value
	}
}

func (e *UpstreamTransport) Connect() error {
	return fmt.Errorf("%T.Connect is not implemented", e)
}

func (e *UpstreamTransport) Close() error {
	return nil
}

func (e *UpstreamTransport) Send(command string, params map[string]any, sessionID string, timeout ...time.Duration) (map[string]any, error) {
	e.pendingMu.Lock()
	e.nextID++
	id := e.nextID
	done := make(chan map[string]any, 1)
	e.pending[id] = done
	e.pendingMu.Unlock()

	message := map[string]any{"id": id, "method": command, "params": params}
	if sessionID != "" {
		message["sessionId"] = sessionID
	}
	if err := e.writeCommand(message); err != nil {
		e.pendingMu.Lock()
		delete(e.pending, id)
		e.pendingMu.Unlock()
		return nil, err
	}
	effectiveTimeout := time.Duration(e.Config.UpstreamCDPSendTimeoutMS) * time.Millisecond
	if len(timeout) > 0 {
		effectiveTimeout = timeout[0]
	}
	if effectiveTimeout <= 0 {
		response := <-done
		if errObj, ok := response["error"].(map[string]any); ok {
			return nil, fmt.Errorf("%s failed: %v", command, errObj["message"])
		}
		if result, ok := response["result"].(map[string]any); ok {
			return result, nil
		}
		return map[string]any{}, nil
	}
	select {
	case <-time.After(effectiveTimeout):
		e.pendingMu.Lock()
		delete(e.pending, id)
		e.pendingMu.Unlock()
		return nil, fmt.Errorf("%s timed out after %s", command, effectiveTimeout)
	case response := <-done:
		if errObj, ok := response["error"].(map[string]any); ok {
			return nil, fmt.Errorf("%s failed: %v", command, errObj["message"])
		}
		if result, ok := response["result"].(map[string]any); ok {
			return result, nil
		}
		return map[string]any{}, nil
	}
}

func (e *UpstreamTransport) ConfigForLauncher() LauncherConfig {
	return LauncherConfig{}
}

func (e *UpstreamTransport) ConfigForServer() map[string]any {
	return map[string]any{}
}

func (e *UpstreamTransport) OnRecv(listener func(map[string]any)) func() {
	e.listenerMu.Lock()
	e.nextListenerID++
	id := e.nextListenerID
	e.recvListeners = append(e.recvListeners, recvListener{id: id, fn: listener})
	e.listenerMu.Unlock()
	var once sync.Once
	return func() {
		once.Do(func() {
			e.listenerMu.Lock()
			defer e.listenerMu.Unlock()
			for index, candidate := range e.recvListeners {
				if candidate.id != id {
					continue
				}
				e.recvListeners = append(e.recvListeners[:index], e.recvListeners[index+1:]...)
				return
			}
		})
	}
}

func (e *UpstreamTransport) OnClose(listener func(error)) func() {
	e.listenerMu.Lock()
	e.nextListenerID++
	id := e.nextListenerID
	e.closeListeners = append(e.closeListeners, closeListener{id: id, fn: listener})
	e.listenerMu.Unlock()
	var once sync.Once
	return func() {
		once.Do(func() {
			e.listenerMu.Lock()
			defer e.listenerMu.Unlock()
			for index, candidate := range e.closeListeners {
				if candidate.id != id {
					continue
				}
				e.closeListeners = append(e.closeListeners[:index], e.closeListeners[index+1:]...)
				return
			}
		})
	}
}

func (e *UpstreamTransport) emitRecv(message map[string]any) {
	if id, ok := commandID(message["id"]); ok {
		e.pendingMu.Lock()
		done := e.pending[id]
		delete(e.pending, id)
		e.pendingMu.Unlock()
		if done != nil {
			done <- message
		}
	}
	e.listenerMu.Lock()
	listeners := append([]recvListener(nil), e.recvListeners...)
	e.listenerMu.Unlock()
	for _, listener := range listeners {
		listener.fn(message)
	}
}

func (e *UpstreamTransport) EmitRecv(message map[string]any) {
	e.emitRecv(message)
}

func (e *UpstreamTransport) emitClose(err error) {
	e.pendingMu.Lock()
	pending := e.pending
	e.pending = map[int64]chan map[string]any{}
	e.pendingMu.Unlock()
	for _, done := range pending {
		done <- map[string]any{"error": map[string]any{"message": fmt.Sprintf("connection closed: %v", err)}}
	}
	e.listenerMu.Lock()
	listeners := append([]closeListener(nil), e.closeListeners...)
	e.listenerMu.Unlock()
	for _, listener := range listeners {
		listener.fn(err)
	}
}

func (e *UpstreamTransport) EmitClose(err error) {
	e.emitClose(err)
}

func (e *UpstreamTransport) WaitForPeer() error {
	return nil
}

func (e *UpstreamTransport) PeerGeneration() int64 {
	return 0
}

func intFromConfig(value any) (int, bool) {
	switch typed := value.(type) {
	case int:
		return typed, true
	case int64:
		return int(typed), true
	case float64:
		return int(typed), true
	case float32:
		return int(typed), true
	default:
		return 0, false
	}
}

func commandID(value any) (int64, bool) {
	switch typed := value.(type) {
	case int:
		return int64(typed), true
	case int64:
		return typed, true
	case float64:
		return int64(typed), true
	default:
		return 0, false
	}
}
