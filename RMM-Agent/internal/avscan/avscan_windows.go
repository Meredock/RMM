//go:build windows

package avscan

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"time"
)

// runScan drives Microsoft Defender via PowerShell. Scans can run for minutes
// (quick) to hours (full), well beyond the normal command timeout, so this uses
// its own generous deadline.
func runScan(scanType string) (string, error) {
	var psType string
	var timeout time.Duration
	switch scanType {
	case "quick":
		psType, timeout = "QuickScan", 30*time.Minute
	case "full":
		psType, timeout = "FullScan", 3*time.Hour
	default:
		return "", fmt.Errorf("unknown scan type %q (use \"quick\" or \"full\")", scanType)
	}

	script := "$ErrorActionPreference='Stop';" +
		"Start-MpScan -ScanType " + psType + ";" +
		"Write-Output '--- Recent threat detections ---';" +
		"$d = Get-MpThreatDetection -ErrorAction SilentlyContinue | Sort-Object InitialDetectionTime -Descending | Select-Object -First 20;" +
		"if ($d) { $d | Format-Table InitialDetectionTime, ThreatID, ProcessName, Resources -AutoSize | Out-String } else { Write-Output 'No threats detected.' };" +
		"$s = Get-MpComputerStatus;" +
		"Write-Output ('Signature version: ' + $s.AntivirusSignatureVersion)"

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()

	header := fmt.Sprintf("Windows Defender %s — %s\n", psType, time.Now().Format(time.RFC1123))
	switch {
	case ctx.Err() == context.DeadlineExceeded:
		return header + out.String() + "\n[scan timed out]", fmt.Errorf("scan timed out after %s", timeout)
	case err != nil:
		return header + out.String(), fmt.Errorf("scan failed: %w", err)
	default:
		return header + out.String(), nil
	}
}
