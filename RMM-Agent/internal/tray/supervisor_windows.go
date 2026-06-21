//go:build windows

package tray

import (
	"fmt"
	"log"
	"os"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	createUnicodeEnvironment = 0x00000400
	createNoWindow           = 0x08000000
	noActiveSession          = 0xFFFFFFFF
)

func startSupervisor() {
	go supervise()
}

// supervise keeps exactly one tray helper running in the active console
// session, relaunching when the session changes (e.g. a different user logs in)
// or the helper exits.
func supervise() {
	var proc windows.Handle
	var procSession uint32 = noActiveSession

	defer func() {
		if proc != 0 {
			_ = windows.TerminateProcess(proc, 0)
			_ = windows.CloseHandle(proc)
		}
	}()

	for {
		session := windows.WTSGetActiveConsoleSessionId()
		if session != noActiveSession && (proc == 0 || session != procSession || exited(proc)) {
			if proc != 0 {
				_ = windows.TerminateProcess(proc, 0)
				_ = windows.CloseHandle(proc)
				proc = 0
			}
			h, err := launchTrayHelper(session)
			if err != nil {
				log.Printf("[tray] launch failed: %v", err)
			} else {
				proc, procSession = h, session
			}
		}
		time.Sleep(20 * time.Second)
	}
}

func exited(h windows.Handle) bool {
	r, err := windows.WaitForSingleObject(h, 0)
	return err == nil && r == windows.WAIT_OBJECT_0
}

func launchTrayHelper(session uint32) (windows.Handle, error) {
	exe, err := os.Executable()
	if err != nil {
		return 0, err
	}

	var userToken windows.Token
	if err := windows.WTSQueryUserToken(session, &userToken); err != nil {
		return 0, fmt.Errorf("WTSQueryUserToken: %w", err)
	}
	defer userToken.Close()

	var primary windows.Token
	if err := windows.DuplicateTokenEx(
		userToken, windows.MAXIMUM_ALLOWED, nil,
		windows.SecurityImpersonation, windows.TokenPrimary, &primary,
	); err != nil {
		return 0, fmt.Errorf("DuplicateTokenEx: %w", err)
	}
	defer primary.Close()

	var envBlock *uint16
	_ = windows.CreateEnvironmentBlock(&envBlock, primary, false)
	defer func() {
		if envBlock != nil {
			_ = windows.DestroyEnvironmentBlock(envBlock)
		}
	}()

	cmdLine := fmt.Sprintf(`"%s" -tray`, exe)
	si := &windows.StartupInfo{Desktop: windows.StringToUTF16Ptr(`winsta0\default`)}
	si.Cb = uint32(unsafe.Sizeof(*si))
	pi := &windows.ProcessInformation{}

	if err := windows.CreateProcessAsUser(
		primary,
		windows.StringToUTF16Ptr(exe),
		windows.StringToUTF16Ptr(cmdLine),
		nil, nil, false,
		createUnicodeEnvironment|createNoWindow,
		envBlock, nil, si, pi,
	); err != nil {
		return 0, fmt.Errorf("CreateProcessAsUser: %w", err)
	}

	_ = windows.CloseHandle(pi.Thread)
	return pi.Process, nil
}
