//go:build !windows

package avscan

import "fmt"

func runScan(scanType string) (string, error) {
	return "", fmt.Errorf("virus scan is only supported on Windows (Microsoft Defender)")
}
