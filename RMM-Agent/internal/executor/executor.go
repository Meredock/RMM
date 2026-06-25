package executor

import (
	"bytes"
	"context"
	"encoding/base64"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/meredock/rmm-agent/internal/avscan"
	"github.com/meredock/rmm-agent/internal/backup"
	"github.com/meredock/rmm-agent/internal/httpcheck"
	"github.com/meredock/rmm-agent/internal/script"
	"github.com/meredock/rmm-agent/internal/sysinfo"
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

	if payload, ok := httpcheckPayload(command); ok {
		output, err := httpcheck.Run(payload)
		if err != nil {
			return Result{Output: err.Error(), ExitCode: 1, Success: false}
		}
		// A reachable-or-not result is still a successful check run.
		return Result{Output: output, ExitCode: 0, Success: true}
	}

	if c := strings.TrimSpace(command); c == "inventory" || c == "winupdates" {
		var output string
		var err error
		if c == "inventory" {
			output, err = sysinfo.Inventory()
		} else {
			output, err = sysinfo.WindowsUpdates()
		}
		if err != nil {
			return Result{Output: output + "\n" + err.Error(), ExitCode: 1, Success: false}
		}
		return Result{Output: output, ExitCode: 0, Success: true}
	}

	if shell, content, ok := runscriptArgs(command); ok {
		output, err := script.Run(shell, content)
		exit := 0
		if err != nil {
			exit = 1
		}
		return Result{Output: output, ExitCode: exit, Success: err == nil}
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

// httpcheckPayload recognises "httpcheck {json}" commands.
func httpcheckPayload(command string) (string, bool) {
	command = strings.TrimSpace(command)
	if strings.HasPrefix(command, "httpcheck ") {
		payload := strings.TrimSpace(strings.TrimPrefix(command, "httpcheck "))
		return payload, payload != ""
	}
	return "", false
}

// runscriptArgs recognises "runscript <shell> <base64-content>" commands. The
// content is base64-encoded to survive transport without quoting issues.
func runscriptArgs(command string) (shell, content string, ok bool) {
	command = strings.TrimSpace(command)
	if !strings.HasPrefix(command, "runscript ") {
		return "", "", false
	}
	fields := strings.Fields(strings.TrimPrefix(command, "runscript "))
	if len(fields) != 2 {
		return "", "", false
	}
	decoded, err := base64.StdEncoding.DecodeString(fields[1])
	if err != nil {
		return "", "", false
	}
	return fields[0], string(decoded), true
}
