//go:build windows

package config

import "os/exec"

// secureFile restricts the config file to SYSTEM and Administrators, removing
// inherited access so a non-admin user can't read the device API key.
func secureFile(path string) {
	// /inheritance:r removes inherited ACEs; then grant only SYSTEM and the
	// local Administrators group full control. Best-effort: ignore errors.
	_ = exec.Command("icacls", path, "/inheritance:r",
		"/grant:r", "SYSTEM:F",
		"/grant:r", "Administrators:F").Run()
}
