package transport

import (
	"fmt"
	"os"
	"sync"

	"github.com/browserbase/modcdp/go/modcdp/launcher"
)

type PipeUpstreamTransport struct {
	UpstreamTransport
	PipeRead  *os.File
	PipeWrite *os.File
	writeMu   sync.Mutex
	stateMu   sync.Mutex
	connected bool
}

type PipeUpstreamTransportOptions struct {
	PipeRead  *os.File `json:"-"`
	PipeWrite *os.File `json:"-"`
}

func NewPipeUpstreamTransport(options PipeUpstreamTransportOptions) *PipeUpstreamTransport {
	return &PipeUpstreamTransport{PipeRead: options.PipeRead, PipeWrite: options.PipeWrite}
}

func (t *PipeUpstreamTransport) Update(config map[string]any) {
	if config == nil {
		return
	}
	if pipeRead, _ := config["upstream_pipe_read"].(*os.File); pipeRead != nil {
		t.PipeRead = pipeRead
	}
	if pipeWrite, _ := config["upstream_pipe_write"].(*os.File); pipeWrite != nil {
		t.PipeWrite = pipeWrite
	}
}

func (t *PipeUpstreamTransport) GetLauncherConfig() LaunchOptions {
	return LaunchOptions{LauncherLocalCDPTransport: "pipe"}
}

func (t *PipeUpstreamTransport) Connect() error {
	if t.PipeRead == nil || t.PipeWrite == nil {
		return fmt.Errorf("upstream.upstream_mode=pipe requires launcher-provided pipe_read and pipe_write handles")
	}
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

func (t *PipeUpstreamTransport) Send(message map[string]any) error {
	t.stateMu.Lock()
	connected := t.connected
	t.stateMu.Unlock()
	if t.PipeWrite == nil || !connected {
		return fmt.Errorf("CDP pipe is not connected")
	}
	t.writeMu.Lock()
	defer t.writeMu.Unlock()
	return launcher.WritePipeMessage(t.PipeWrite, message)
}

func (t *PipeUpstreamTransport) Close() error {
	t.stateMu.Lock()
	t.connected = false
	t.stateMu.Unlock()
	if t.PipeRead != nil {
		_ = t.PipeRead.Close()
	}
	if t.PipeWrite != nil {
		_ = t.PipeWrite.Close()
	}
	return nil
}

func (t *PipeUpstreamTransport) readLoop() {
	for {
		message, err := launcher.ReadPipeMessage(t.PipeRead)
		if err != nil {
			t.stateMu.Lock()
			connected := t.connected
			t.connected = false
			t.stateMu.Unlock()
			if connected {
				t.emitClose(err)
			}
			return
		}
		t.emitRecv(message)
	}
}
