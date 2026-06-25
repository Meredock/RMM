// Package sysinfo collects on-demand inventory from the host: installed
// software and pending Windows updates. Results are returned as JSON.
package sysinfo

// Inventory returns the installed-software list as JSON.
func Inventory() (string, error) { return inventory() }

// WindowsUpdates returns pending OS updates as JSON.
func WindowsUpdates() (string, error) { return windowsUpdates() }
