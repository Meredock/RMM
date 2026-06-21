package executor

import (
	"bytes"
	"context"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/meredock/rmm-agent/internal/avscan"
	"github.com/meredock/rmm-agent/internal/backup"
)

const timeout = 60 * time.Second

type Result struct {
	Output   string
	ExitCode int
	Success  bool
}

func Run(command string) Result {
	if payload, ok := backupPayload(command); ok {
		output, err := backup.RunJSON(payload)
		if err != nil {
			return Result{
				Output:   err.Error(),
				ExitCode: 1,
				Success:  false,
			}
		}
		return Result{
			Output:   output,
			ExitCode: 0,
			Success:  true,
		}
	}

	if arg, ok := avscanArg(command); ok {
		output, err := avscan.Run(arg)
		if err != nil {
			return Result{
				Output:   output + "\n" + err.Error(),
				ExitCode: 1,
				Success:  false,
			}
		}
		return Result{
			Output:   output,
			ExitCode: 0,
			Success:  true,
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd.exe", "/C", command)
	} else {
		cmd = exec.CommandContext(ctx, "/bin/sh", "-c", command)
	}

	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out

	err := cmd.Run()

	exitCode := 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}

	success := err == nil
	if ctx.Err() == context.DeadlineExceeded {
		return Result{
			Output:   out.String() + "\n[command timed out after 60s]",
			ExitCode: -1,
			Success:  false,
		}
	}

	return Result{
		Output:   out.String(),
		ExitCode: exitCode,
		Success:  success,
	}
}

func backupPayload(command string) (string, bool) {
	command = strings.TrimSpace(command)
	for _, prefix := range []string{"backup ", "rmm-backup ", "rmm:backup "} {
		if strings.HasPrefix(command, prefix) {
			payload := strings.TrimSpace(strings.TrimPrefix(command, prefix))
			return payload, payload != ""
		}
	}
	return "", false
}

// avscanArg recognises "avscan [quick|full]" commands and returns the scan-type
// argument (empty meaning the default quick scan).
func avscanArg(command string) (string, bool) {
	command = strings.TrimSpace(command)
	if command == "avscan" {
		return "", true
	}
	if strings.HasPrefix(command, "avscan ") {
		return strings.TrimSpace(strings.TrimPrefix(command, "avscan ")), true
	}
	return "", false
}
