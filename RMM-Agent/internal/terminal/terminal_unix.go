//go:build !windows && cgo

package terminal

import (
	"encoding/base64"
	"os"
	"os/exec"

	"github.com/creack/pty"
	"github.com/meredock/rmm-agent/internal/wsconn"
)

func Handle(sessionId string, send func(wsconn.Msg), recv <-chan wsconn.Msg) {
	cmd := exec.Command("/bin/bash")
	if _, err := exec.LookPath("/bin/bash"); err != nil {
		cmd = exec.Command("/bin/sh")
	}
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	ptmx, err := pty.Start(cmd)
	if err != nil {
		send(wsconn.Msg{"type": "SESSION_ERROR", "sessionId": sessionId, "error": err.Error()})
		return
	}
	defer func() {
		ptmx.Close()
		cmd.Process.Kill() //nolint
	}()

	// pty → browser
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
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

	// browser → pty
	for msg := range recv {
		switch msg.Type() {
		case "TERM_DATA":
			data, err := base64.StdEncoding.DecodeString(msg.String("data"))
			if err == nil {
				ptmx.Write(data) //nolint
			}
		case "TERM_RESIZE":
			cols := uint16(msg.Float("cols"))
			rows := uint16(msg.Float("rows"))
			if cols > 0 && rows > 0 {
				pty.Setsize(ptmx, &pty.Winsize{Cols: cols, Rows: rows}) //nolint
			}
		}
	}
}
