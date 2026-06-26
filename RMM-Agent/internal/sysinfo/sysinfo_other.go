//go:build !windows

package sysinfo

import "fmt"

func inventory() (string, error) {
	return "", fmt.Errorf("software inventory is only supported on Windows")
}

func windowsUpdates() (string, error) {
	return "", fmt.Errorf("Windows update status is only supported on Windows")
}

func installUpdates() (string, error) {
	return "", fmt.Errorf("installing updates is only supported on Windows")
}
