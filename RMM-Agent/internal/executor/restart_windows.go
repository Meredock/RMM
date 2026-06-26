//go:build windows

package executor

import (
	"os/exec"
	"syscall"
)

const (
	detachedProcess       = 0x00000008
	createNewProcessGroup = 0x00000200
)

// scheduleAgentRestart launches a detached process that waits a moment (so this
// command's result can be reported) and then restarts the service. It must be
// detached so it survives the service — and therefore this process — stopping.
func scheduleAgentRestart() error {
	cmd := exec.Command("cmd", "/C", "ping 127.0.0.1 -n 4 >nul & sc stop RMMAgent & sc start RMMAgent")
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: detachedProcess | createNewProcessGroup}
	return cmd.Start()
}
