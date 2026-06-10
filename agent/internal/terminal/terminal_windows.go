//go:build windows

package terminal

import (
	"encoding/base64"
	"io"
	"log"
	"os"
	"os/exec"

	"github.com/meredock/rmm-agent/internal/wsconn"
)

// replScript is a self-contained PowerShell REPL.
// It reads character-by-character so it can handle DEL/BS sent by the browser terminal.
const replScript = `
$ErrorActionPreference = "Continue"
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
while ($true) {
    [Console]::Write("PS $($PWD.Path)> ")
    [Console]::Out.Flush()
    $line = ''
    while ($true) {
        $k = [Console]::In.Read()
        if ($k -eq -1) { exit }
        if ($k -eq 10 -or $k -eq 13) { break }
        if ($k -eq 127 -or $k -eq 8) {
            if ($line.Length -gt 0) { $line = $line.Substring(0, $line.Length - 1) }
            continue
        }
        $line += [char]$k
    }
    if ($line -eq 'exit') { break }
    if ($line.Trim() -eq '') { continue }
    try {
        $result = Invoke-Expression $line 2>&1 | Out-String -Width 220
        [Console]::Write($result)
        [Console]::Out.Flush()
    } catch {
        [Console]::WriteLine($_.Exception.Message)
        [Console]::Out.Flush()
    }
}
`

func Handle(sessionId string, send func(wsconn.Msg), recv <-chan wsconn.Msg) {
	// Write the REPL script to a temp file so PowerShell executes it as a script.
	tmp, err := os.CreateTemp("", "rmm-term-*.ps1")
	if err != nil {
		sendText(send, sessionId, "\r\n\x1b[31m[error] cannot create temp file: "+err.Error()+"\x1b[0m\r\n")
		return
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.WriteString(replScript); err != nil {
		tmp.Close()
		sendText(send, sessionId, "\r\n\x1b[31m[error] cannot write temp file: "+err.Error()+"\x1b[0m\r\n")
		return
	}
	tmp.Close()

	cmd := exec.Command(
		"powershell.exe",
		"-NoProfile", "-NoLogo", "-ExecutionPolicy", "Bypass",
		"-File", tmp.Name(),
	)
	cmd.Env = append(cmd.Environ(), "TERM=dumb")

	stdin, err := cmd.StdinPipe()
	if err != nil {
		sendText(send, sessionId, "\r\n\x1b[31m[error] stdin pipe: "+err.Error()+"\x1b[0m\r\n")
		return
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		sendText(send, sessionId, "\r\n\x1b[31m[error] stdout pipe: "+err.Error()+"\x1b[0m\r\n")
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		sendText(send, sessionId, "\r\n\x1b[31m[error] stderr pipe: "+err.Error()+"\x1b[0m\r\n")
		return
	}

	if err := cmd.Start(); err != nil {
		log.Printf("[terminal] Start error: %v", err)
		sendText(send, sessionId, "\r\n\x1b[31m[error] Failed to start PowerShell: "+err.Error()+"\x1b[0m\r\n")
		return
	}
	defer func() {
		stdin.Close()
		cmd.Process.Kill() //nolint
	}()

	fwd := func(r io.Reader) {
		buf := make([]byte, 4096)
		for {
			n, readErr := r.Read(buf)
			if n > 0 {
				send(wsconn.Msg{
					"type":      "TERM_DATA",
					"sessionId": sessionId,
					"data":      base64.StdEncoding.EncodeToString(buf[:n]),
				})
			}
			if readErr != nil {
				return
			}
		}
	}
	go fwd(stdout)
	go fwd(stderr)

	// Unblock the recv loop when the process exits on its own (e.g. user types "exit").
	procDone := make(chan struct{})
	go func() {
		cmd.Wait() //nolint
		close(procDone)
	}()

	for {
		select {
		case msg, ok := <-recv:
			if !ok {
				return
			}
			if msg.Type() == "TERM_DATA" {
				data, err := base64.StdEncoding.DecodeString(msg.String("data"))
				if err == nil {
					io.WriteString(stdin, string(data)) //nolint
				}
			}
		case <-procDone:
			return
		}
	}
}

func sendText(send func(wsconn.Msg), sessionId, text string) {
	send(wsconn.Msg{
		"type":      "TERM_DATA",
		"sessionId": sessionId,
		"data":      base64.StdEncoding.EncodeToString([]byte(text)),
	})
}
