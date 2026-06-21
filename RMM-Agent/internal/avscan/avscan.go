package avscan

import "strings"

// Run executes an on-demand antivirus scan. arg selects the scan type and is
// either "quick" (default) or "full". On Windows this drives Microsoft
// Defender; other platforms report that scanning is unsupported.
func Run(arg string) (string, error) {
	scanType := strings.TrimSpace(strings.ToLower(arg))
	if scanType == "" {
		scanType = "quick"
	}
	return runScan(scanType)
}
