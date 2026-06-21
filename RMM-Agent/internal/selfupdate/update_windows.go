//go:build windows

package selfupdate

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
)

const (
	detachedProcess       = 0x00000008
	createNewProcessGroup = 0x00000200
)

// launchUpdater spawns the freshly downloaded binary in update mode, detached so
// it survives this process being stopped together with the service.
func launchUpdater(newPath, serviceName string) error {
	cmd := exec.Command(newPath, "-apply-update",
		"-update-target", selfPath(),
		"-update-service", serviceName)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: detachedProcess | createNewProcessGroup,
	}
	return cmd.Start()
}

// ApplyUpdate runs inside the freshly downloaded binary: stop the service, copy
// this binary over the installed one, then restart the service.
func ApplyUpdate(target, serviceName string) error {
	if serviceName != "" {
		_ = exec.Command("sc", "stop", serviceName).Run()
		// Wait for the old process to release the file before overwriting.
		for i := 0; i < 15; i++ {
			time.Sleep(time.Second)
			if f, err := os.OpenFile(target, os.O_WRONLY, 0); err == nil {
				f.Close()
				break
			}
		}
	}

	if err := copyFile(selfPath(), target); err != nil {
		return fmt.Errorf("copy new binary: %w", err)
	}

	if serviceName != "" {
		if err := exec.Command("sc", "start", serviceName).Run(); err != nil {
			return fmt.Errorf("restart service: %w", err)
		}
	}
	// Best-effort cleanup of the downloaded file (may fail while still mapped).
	_ = os.Remove(selfPath())
	return nil
}
