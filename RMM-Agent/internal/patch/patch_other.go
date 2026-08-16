//go:build !windows

package patch

import (
	"encoding/json"
	"fmt"
	"runtime"
)

// Patch scanning is Windows-only for now (Windows Update + winget). Other
// platforms report an explicit "unsupported" payload so the dashboard can show
// a sensible message instead of an error.
func scan() (string, error) {
	res := ScanResult{
		Platform:        runtime.GOOS,
		Supported:       false,
		WUA:             []WUAUpdate{},
		Winget:          []WingetUpgrade{},
		Errors:          []string{},
		WingetAvailable: false,
	}
	buf, err := json.Marshal(res)
	return string(buf), err
}

func install(_ InstallRequest) (string, error) {
	return "", fmt.Errorf("patch install is not supported on %s", runtime.GOOS)
}
