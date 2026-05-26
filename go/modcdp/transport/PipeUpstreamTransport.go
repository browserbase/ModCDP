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
	closed    bool
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
	if pipeRead, _ := config["pipe_read"].(*os.File); pipeRead != nil {
		t.PipeRead = pipeRead
	}
	if pipeWrite, _ := config["pipe_write"].(*os.File); pipeWrite != nil {
		t.PipeWrite = pipeWrite
	}
}

func (t *PipeUpstreamTransport) GetLauncherConfig() LaunchOptions {
	return LaunchOptions{RemoteDebugging: "pipe"}
}

func (t *PipeUpstreamTransport) Connect() error {
	if t.PipeRead == nil || t.PipeWrite == nil {
		return fmt.Errorf("upstream.upstream_mode=pipe requires launcher-provided pipe_read and pipe_write handles")
	}
	t.setClosed(false)
	go t.readLoop()
	return nil
}

func (t *PipeUpstreamTransport) Send(message map[string]any) error {
	if t.PipeWrite == nil || t.isClosed() {
		return fmt.Errorf("CDP pipe is not connected")
	}
	t.writeMu.Lock()
	defer t.writeMu.Unlock()
	return launcher.WritePipeMessage(t.PipeWrite, message)
}

func (t *PipeUpstreamTransport) Close() error {
	t.setClosed(true)
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
			if !t.isClosed() {
				t.setClosed(true)
				t.emitClose(err)
			}
			return
		}
		t.emitRecv(message)
	}
}

func (t *PipeUpstreamTransport) setClosed(closed bool) {
	t.stateMu.Lock()
	t.closed = closed
	t.stateMu.Unlock()
}

func (t *PipeUpstreamTransport) isClosed() bool {
	t.stateMu.Lock()
	defer t.stateMu.Unlock()
	return t.closed
}
