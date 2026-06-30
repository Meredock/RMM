//go:build !windows

package winget

import "fmt"

func export() (string, error)           { return "", fmt.Errorf("winget is only available on Windows") }
func importApps(string) (string, error) { return "", fmt.Errorf("winget is only available on Windows") }
