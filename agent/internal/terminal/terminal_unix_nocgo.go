//go:build !windows && !cgo

package terminal

import (
	"encoding/base64"
	"io"
	"os"
	"os/exec"

	"github.com/meredock/rmm-agent/internal/wsconn"
)

// Pipe-based fallback used when cross-compiled without CGO (no PTY support).
func Handle(sessionId string, send func(wsconn.Msg), recv <-chan wsconn.Msg) {
	shell := "/bin/bash"
	if _, err := exec.LookPath(shell); err != nil {
		shell = "/bin/sh"
	}
	cmd := exec.Command(shell)
	cmd.Env = append(os.Environ(), "TERM=dumb")

	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		send(wsconn.Msg{"type": "SESSION_ERROR", "sessionId": sessionId, "error": err.Error()})
		return
	}
	defer func() {
		stdin.Close()
		cmd.Process.Kill() //nolint
	}()

	done := make(chan struct{})
	go func() {
		defer close(done)
		buf := make([]byte, 4096)
		mr := io.MultiReader(stdout, stderr)
		for {
			n, err := mr.Read(buf)
			if n > 0 {
				send(wsconn.Msg{
					"type":      "TERM_DATA",
					"sessionId": sessionId,
					"data":      base64.StdEncoding.EncodeToString(buf[:n]),
				})
			}
			if err != nil {
				return
			}
		}
	}()

	for msg := range recv {
		if msg.Type() == "TERM_DATA" {
			if data, err := base64.StdEncoding.DecodeString(msg.String("data")); err == nil {
				stdin.Write(data) //nolint
			}
		}
	}
	<-done
}
