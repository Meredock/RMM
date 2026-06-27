//go:build !windows

package executor

import "os/exec"

// scheduleAgentRestart restarts the systemd service in the background.
func scheduleAgentRestart() error {
	cmd := exec.Command("sh", "-c", "(sleep 2 && systemctl restart rmm-agent) >/dev/null 2>&1 &")
	return cmd.Start()
}
