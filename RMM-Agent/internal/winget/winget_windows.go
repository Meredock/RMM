//go:build windows

package winget

import (
	"fmt"
	"os"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Shared files live under C:\Users\Public so both the SYSTEM service (which
// writes/reads them) and the user-session winget process can access them.
const (
	exportManifest = `C:\Users\Public\rmm-winget-export.json`
	importManifest = `C:\Users\Public\rmm-winget-import.json`
	wingetLog      = `C:\Users\Public\rmm-winget.log`
	createNoWindow = 0x08000000
)

func export() (string, error) {
	_ = os.Remove(exportManifest)
	cmd := fmt.Sprintf(`winget export -o "%s" --accept-source-agreements > "%s" 2>&1`, exportManifest, wingetLog)
	runErr := runInUserSession(cmd, 5*time.Minute)
	data, err := os.ReadFile(exportManifest)
	if err != nil {
		logData, _ := os.ReadFile(wingetLog)
		return string(logData), fmt.Errorf("winget export produced no manifest (is winget/App Installer present and a user logged in?): %v", runErr)
	}
	return string(data), nil
}

func importApps(manifest string) (string, error) {
	if err := os.WriteFile(importManifest, []byte(manifest), 0644); err != nil {
		return "", err
	}
	defer os.Remove(importManifest)
	cmd := fmt.Sprintf(`winget import -i "%s" --accept-package-agreements --accept-source-agreements --disable-interactivity --ignore-unavailable > "%s" 2>&1`, importManifest, wingetLog)
	runErr := runInUserSession(cmd, 60*time.Minute)
	logData, _ := os.ReadFile(wingetLog)
	out := string(logData)
	if runErr != nil {
		return out, runErr
	}
	return out, nil
}

// runInUserSession runs "cmd /c <cmdLine>" in the active console session and
// waits for it to finish (winget can't run from the service's Session 0).
func runInUserSession(cmdLine string, timeout time.Duration) error {
	session := windows.WTSGetActiveConsoleSessionId()
	if session == 0xFFFFFFFF {
		return fmt.Errorf("no active user session (someone must be signed in)")
	}

	var userToken windows.Token
	if err := windows.WTSQueryUserToken(session, &userToken); err != nil {
		return fmt.Errorf("WTSQueryUserToken: %w", err)
	}
	defer userToken.Close()

	var primary windows.Token
	if err := windows.DuplicateTokenEx(userToken, windows.MAXIMUM_ALLOWED, nil,
		windows.SecurityImpersonation, windows.TokenPrimary, &primary); err != nil {
		return fmt.Errorf("DuplicateTokenEx: %w", err)
	}
	defer primary.Close()

	var env *uint16
	_ = windows.CreateEnvironmentBlock(&env, primary, false)
	defer func() {
		if env != nil {
			_ = windows.DestroyEnvironmentBlock(env)
		}
	}()

	exe := `C:\Windows\System32\cmd.exe`
	full := `cmd.exe /c ` + cmdLine
	si := &windows.StartupInfo{}
	si.Cb = uint32(unsafe.Sizeof(*si))
	pi := &windows.ProcessInformation{}

	if err := windows.CreateProcessAsUser(primary,
		windows.StringToUTF16Ptr(exe), windows.StringToUTF16Ptr(full),
		nil, nil, false, windows.CREATE_UNICODE_ENVIRONMENT|createNoWindow,
		env, nil, si, pi); err != nil {
		return fmt.Errorf("CreateProcessAsUser: %w", err)
	}
	defer windows.CloseHandle(pi.Thread)
	defer windows.CloseHandle(pi.Process)

	w, err := windows.WaitForSingleObject(pi.Process, uint32(timeout.Milliseconds()))
	if err != nil {
		return fmt.Errorf("wait: %w", err)
	}
	if w == uint32(windows.WAIT_TIMEOUT) {
		_ = windows.TerminateProcess(pi.Process, 1)
		return fmt.Errorf("winget timed out after %s", timeout)
	}
	return nil
}
