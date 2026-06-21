//go:build !windows

package tray

// run is a no-op off Windows; the tray icon is a Windows-only feature.
func run() {}

// startSupervisor is a no-op off Windows.
func startSupervisor() {}
