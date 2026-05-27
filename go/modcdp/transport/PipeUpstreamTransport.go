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
	closeCh   chan struct{}
}

func NewPipeUpstreamTransport(options UpstreamTransportOptions) *PipeUpstreamTransport {
	return &PipeUpstreamTransport{UpstreamTransport: NewUpstreamTransport(options), PipeRead: options.UpstreamPipeRead, PipeWrite: options.UpstreamPipeWrite}
}

func (t *PipeUpstreamTransport) Update(config map[string]any) {
	t.UpstreamTransport.Update(config)
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

func (t *PipeUpstreamTransport) ConfigForLauncher() LaunchOptions {
	return LaunchOptions{LauncherLocalCDPTransport: "pipe"}
}

func (t *PipeUpstreamTransport) Connect() error {
	if t.PipeRead == nil || t.PipeWrite == nil {
		return fmt.Errorf("upstream.upstream_mode=pipe requires launcher-provided pipe_read and pipe_write handles")
	}
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

func (t *PipeUpstreamTransport) Send(message map[string]any) error {
	t.stateMu.Lock()
	closeCh := t.closeCh
	t.stateMu.Unlock()
	if t.PipeWrite == nil || closeCh == nil {
		return fmt.Errorf("CDP pipe is not connected")
	}
	t.writeMu.Lock()
	defer t.writeMu.Unlock()
	return launcher.WritePipeMessage(t.PipeWrite, message)
}

func (t *PipeUpstreamTransport) Close() error {
	t.stateMu.Lock()
	closeCh := t.closeCh
	t.closeCh = nil
	t.stateMu.Unlock()
	if closeCh != nil {
		close(closeCh)
	}
	if t.PipeRead != nil {
		_ = t.PipeRead.Close()
	}
	if t.PipeWrite != nil {
		_ = t.PipeWrite.Close()
	}
	return nil
}

func (t *PipeUpstreamTransport) readLoop(closeCh chan struct{}) {
	for {
		message, err := launcher.ReadPipeMessage(t.PipeRead)
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
