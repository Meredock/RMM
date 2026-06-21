//go:build !windows

package selfupdate

import "fmt"

// launchUpdater is a no-op off Windows; self-replacement of a running service is
// handled per-OS and only Windows is supported for now.
func launchUpdater(string, string) error {
	return fmt.Errorf("auto-update is only supported on Windows")
}

// ApplyUpdate is unused off Windows.
func ApplyUpdate(string, string) error { return nil }
