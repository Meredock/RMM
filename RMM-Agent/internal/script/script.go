// Package script runs an ad-hoc script (from the dashboard's script library) in
// a chosen shell with a generous timeout.
package script

import (
	"bytes"
	"context"
	"os/exec"
	"runtime"
	"time"
)

const timeout = 5 * time.Minute

// Run executes content in the given shell ("powershell", "cmd", or "sh"). The
// returned string is combined stdout+stderr.
func Run(shell, content string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		switch shell {
		case "cmd":
			cmd = exec.CommandContext(ctx, "cmd.exe", "/C", content)
		default:
			cmd = exec.CommandContext(ctx, "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", content)
		}
	} else {
		cmd = exec.CommandContext(ctx, "/bin/sh", "-c", content)
	}

	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return out.String() + "\n[script timed out after 5m]", nil
	}
	return out.String(), err
}
