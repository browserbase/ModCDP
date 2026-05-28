// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/transport/UpstreamTransport.ts
// - ./python/modcdp/transport/UpstreamTransport.py
package transport

import (
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/browserbase/modcdp/go/modcdp/injector"
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

func freePort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port, nil
}

type UpstreamMode string
type UpstreamPeerKind string

const (
	UpstreamModeWS UpstreamMode = "ws"

	UpstreamPeerKindBrowserCDP   UpstreamPeerKind = "browser_cdp"
	UpstreamPeerKindModCDPServer UpstreamPeerKind = "modcdp_server"
)

type HostPort struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

type UpstreamTransport struct {
	Config         UpstreamTransportConfig
	PeerKind       UpstreamPeerKind
	recvListeners  []recvListener
	closeListeners []closeListener
	eventListeners map[string][]upstreamEventListener
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

type upstreamEventListener struct {
	id int64
	fn func(map[string]any, string, string)
}

func NewUpstreamTransport(config UpstreamTransportConfig) UpstreamTransport {
	if config.UpstreamMode == "" {
		config.UpstreamMode = string(UpstreamModeWS)
	}
	if config.UpstreamWSConnectErrorSettleTimeoutMS == 0 {
		config.UpstreamWSConnectErrorSettleTimeoutMS = 250
	}
	if config.UpstreamCDPSendTimeoutMS == 0 {
		config.UpstreamCDPSendTimeoutMS = 10_000
	}
	return UpstreamTransport{
		Config:         config,
		PeerKind:       UpstreamPeerKindBrowserCDP,
		eventListeners: map[string][]upstreamEventListener{},
		pending:        map[int64]chan map[string]any{},
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
	if value, ok := config["upstream_mode"].(string); ok && value != "" {
		e.Config.UpstreamMode = value
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

func (e *UpstreamTransport) Send(command any, params map[string]any, sessionID string, timeout ...time.Duration) (map[string]any, error) {
	method, ok := command.(string)
	if !ok {
		message, ok := command.(types.CdpCommandMessage)
		if !ok {
			return nil, fmt.Errorf("command must be a CDP method name or CdpCommandMessage")
		}
		payload := map[string]any{
			"id":     message.ID,
			"method": message.Method,
		}
		if message.Params != nil {
			payload["params"] = message.Params
		}
		if message.SessionID != "" {
			payload["sessionId"] = message.SessionID
		}
		return map[string]any{}, e.writeCommand(payload)
	}
	e.pendingMu.Lock()
	e.nextID++
	id := e.nextID
	done := make(chan map[string]any, 1)
	e.pending[id] = done
	e.pendingMu.Unlock()

	message := map[string]any{"id": id, "method": method, "params": params}
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
			return nil, fmt.Errorf("%s failed: %v", method, errObj["message"])
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
		return nil, fmt.Errorf("%s timed out after %s", method, effectiveTimeout)
	case response := <-done:
		if errObj, ok := response["error"].(map[string]any); ok {
			return nil, fmt.Errorf("%s failed: %v", method, errObj["message"])
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

func (e *UpstreamTransport) GetTargets() ([]map[string]any, error) {
	result, err := e.Send("Target.getTargets", map[string]any{}, "")
	if err != nil {
		return nil, err
	}
	targetInfos, _ := result["targetInfos"].([]any)
	targets := []map[string]any{}
	for _, targetInfo := range targetInfos {
		target, _ := targetInfo.(map[string]any)
		targets = append(targets, target)
	}
	return targets, nil
}

func (e *UpstreamTransport) ResolveTargetID(params map[string]any) string {
	targetID, _ := params["targetId"].(string)
	return targetID
}

func (e *UpstreamTransport) CreateTarget(url string) (string, error) {
	result, err := e.Send("Target.createTarget", map[string]any{"url": url}, "")
	if err != nil {
		return "", err
	}
	targetID, _ := result["targetId"].(string)
	if targetID == "" {
		return "", fmt.Errorf("Target.createTarget returned no targetId")
	}
	return targetID, nil
}

func (e *UpstreamTransport) AttachToTarget(targetID string) (string, error) {
	result, err := e.Send("Target.attachToTarget", map[string]any{"targetId": targetID, "flatten": true}, "")
	if err != nil {
		return "", err
	}
	sessionID, _ := result["sessionId"].(string)
	return sessionID, nil
}

func (e *UpstreamTransport) DetachFromTarget(sessionID string) error {
	_, err := e.Send("Target.detachFromTarget", map[string]any{"sessionId": sessionID}, "")
	return err
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

func (e *UpstreamTransport) On(event string, listener func(map[string]any, string, string)) func() {
	e.listenerMu.Lock()
	if e.eventListeners == nil {
		e.eventListeners = map[string][]upstreamEventListener{}
	}
	e.nextListenerID++
	id := e.nextListenerID
	e.eventListeners[event] = append(e.eventListeners[event], upstreamEventListener{id: id, fn: listener})
	e.listenerMu.Unlock()
	var once sync.Once
	return func() {
		once.Do(func() {
			e.listenerMu.Lock()
			defer e.listenerMu.Unlock()
			listeners := e.eventListeners[event]
			for index, candidate := range listeners {
				if candidate.id != id {
					continue
				}
				listeners = append(listeners[:index], listeners[index+1:]...)
				if len(listeners) == 0 {
					delete(e.eventListeners, event)
				} else {
					e.eventListeners[event] = listeners
				}
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
	if _, ok := commandID(message["id"]); !ok {
		method, _ := message["method"].(string)
		params, _ := message["params"].(map[string]any)
		sessionID, _ := message["sessionId"].(string)
		if method != "" {
			if params == nil {
				params = map[string]any{}
			}
			e.emitUpstreamEvent(method, params, "", sessionID)
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

func (e *UpstreamTransport) parseAndEmitRecv(data []byte) error {
	var message map[string]any
	if err := json.Unmarshal(data, &message); err != nil {
		return fmt.Errorf("invalid CDP message: %w", err)
	}
	if _, ok := commandID(message["id"]); ok {
		if errObj, hasError := message["error"]; hasError && errObj != nil {
			errorMap, ok := errObj.(map[string]any)
			if !ok {
				return fmt.Errorf("invalid CDP response error")
			}
			if message, ok := errorMap["message"].(string); !ok || message == "" {
				return fmt.Errorf("invalid CDP response error message")
			}
		}
		if sessionID, ok := message["sessionId"]; ok && sessionID != nil {
			if _, ok := sessionID.(string); !ok {
				return fmt.Errorf("invalid CDP response sessionId")
			}
		}
		e.emitRecv(message)
		return nil
	}
	if _, hasID := message["id"]; hasID {
		return fmt.Errorf("invalid CDP response id")
	}
	method, _ := message["method"].(string)
	if method == "" {
		return fmt.Errorf("invalid CDP event method")
	}
	if params, ok := message["params"]; ok && params != nil {
		if _, ok := params.(map[string]any); !ok {
			return fmt.Errorf("invalid CDP event params")
		}
	}
	if sessionID, ok := message["sessionId"]; ok && sessionID != nil {
		if _, ok := sessionID.(string); !ok {
			return fmt.Errorf("invalid CDP event sessionId")
		}
	}
	e.emitRecv(message)
	return nil
}

func (e *UpstreamTransport) emitUpstreamEvent(method string, payload map[string]any, targetID string, sessionID string) {
	e.listenerMu.Lock()
	listeners := append([]upstreamEventListener(nil), e.eventListeners[method]...)
	e.listenerMu.Unlock()
	for _, listener := range listeners {
		listener.fn(payload, targetID, sessionID)
	}
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

func (e *UpstreamTransport) ToJSON() map[string]any {
	e.pendingMu.Lock()
	pending := len(e.pending)
	e.pendingMu.Unlock()
	e.listenerMu.Lock()
	recvListeners := len(e.recvListeners)
	closeListeners := len(e.closeListeners)
	eventListeners := len(e.eventListeners)
	e.listenerMu.Unlock()
	config := e.Config
	return types.ModCDPToJSON(e, types.ModCDPJSONConfig{
		Config: config,
		State: map[string]any{
			"pending":         pending,
			"recv_listeners":  recvListeners,
			"close_listeners": closeListeners,
			"event_listeners": eventListeners,
		},
	})
}

func ParseHostPort(value string, defaultHost string, defaultPort int) (HostPort, error) {
	parseValue := value
	if !strings.Contains(value, "://") {
		parseValue = "ws://" + value
	}
	parsed, err := url.Parse(parseValue)
	if err != nil {
		return HostPort{}, err
	}
	host := parsed.Hostname()
	if host == "" {
		host = defaultHost
	}
	port := defaultPort
	if parsed.Port() != "" {
		parsedPort, ok := intFromConfig(parsed.Port())
		if !ok {
			return HostPort{}, fmt.Errorf("Invalid host:port %s", value)
		}
		port = parsedPort
	}
	if port <= 0 || port > 65_535 {
		return HostPort{}, fmt.Errorf("Invalid host:port %s", value)
	}
	return HostPort{Host: host, Port: port}, nil
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
	case string:
		parsed, err := strconv.Atoi(typed)
		if err != nil {
			return 0, false
		}
		return parsed, true
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
