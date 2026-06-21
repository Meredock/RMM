//go:build windows

package desktop

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"time"
	"unsafe"

	"github.com/meredock/rmm-agent/internal/wsconn"
	"golang.org/x/sys/windows"
)

const (
	createUnicodeEnvironment = 0x00000400
	createNoWindow           = 0x08000000
	noActiveSession          = 0xFFFFFFFF
)

// dispatch bridges desktop capture/input to a helper process running in the
// interactive console session. GDI capture from the service's Session 0 only
// ever yields a blank desktop, so the helper is required for a real picture.
// If the helper can't be launched (e.g. the agent is running interactively, not
// as a service), it falls back to in-process capture.
func dispatch(sessionId string, send func(wsconn.Msg), recv <-chan wsconn.Msg) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Printf("[desktop] listener failed (%v); capturing in-process", err)
		runInProcess(sessionId, send, recv)
		return
	}
	defer ln.Close()

	token := randomToken()
	proc, err := launchSessionHelper(ln.Addr().String(), token)
	if err != nil {
		log.Printf("[desktop] session helper launch failed (%v); capturing in-process", err)
		runInProcess(sessionId, send, recv)
		return
	}
	defer proc.terminate()

	if tcp, ok := ln.(*net.TCPListener); ok {
		_ = tcp.SetDeadline(time.Now().Add(15 * time.Second))
	}
	conn, err := ln.Accept()
	if err != nil {
		log.Printf("[desktop] session helper did not connect: %v", err)
		return
	}
	defer conn.Close()

	enc := json.NewEncoder(conn)
	dec := json.NewDecoder(conn)

	if !authenticateHelper(conn, dec, token) {
		log.Printf("[desktop] session helper failed authentication")
		return
	}

	proxyHelper(enc, dec, sessionId, send, recv)
}

func authenticateHelper(conn net.Conn, dec *json.Decoder, token string) bool {
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	var hello wsconn.Msg
	if err := dec.Decode(&hello); err != nil {
		return false
	}
	_ = conn.SetReadDeadline(time.Time{}) // clear deadline for the session
	return hello.Type() == "HELLO" && hello.String("token") == token
}

type sessionProc struct {
	handle windows.Handle
}

func (p *sessionProc) terminate() {
	if p == nil || p.handle == 0 {
		return
	}
	_ = windows.TerminateProcess(p.handle, 0)
	_ = windows.CloseHandle(p.handle)
}

// launchSessionHelper starts this executable as a desktop helper inside the
// active console session, using the logged-in user's token so screen capture
// and input injection target the real desktop.
func launchSessionHelper(addr, token string) (*sessionProc, error) {
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}

	sessionID := windows.WTSGetActiveConsoleSessionId()
	if sessionID == noActiveSession {
		return nil, fmt.Errorf("no active console session (no user logged in)")
	}

	var userToken windows.Token
	if err := windows.WTSQueryUserToken(sessionID, &userToken); err != nil {
		return nil, fmt.Errorf("WTSQueryUserToken: %w", err)
	}
	defer userToken.Close()

	var primary windows.Token
	if err := windows.DuplicateTokenEx(
		userToken,
		windows.MAXIMUM_ALLOWED,
		nil,
		windows.SecurityImpersonation,
		windows.TokenPrimary,
		&primary,
	); err != nil {
		return nil, fmt.Errorf("DuplicateTokenEx: %w", err)
	}
	defer primary.Close()

	var envBlock *uint16
	_ = windows.CreateEnvironmentBlock(&envBlock, primary, false)
	defer func() {
		if envBlock != nil {
			_ = windows.DestroyEnvironmentBlock(envBlock)
		}
	}()

	cmdLine := fmt.Sprintf(`"%s" -desktop-helper -desktop-addr %s -desktop-token %s`, exe, addr, token)

	si := &windows.StartupInfo{
		Desktop: windows.StringToUTF16Ptr(`winsta0\default`),
	}
	si.Cb = uint32(unsafe.Sizeof(*si))
	pi := &windows.ProcessInformation{}

	if err := windows.CreateProcessAsUser(
		primary,
		windows.StringToUTF16Ptr(exe),
		windows.StringToUTF16Ptr(cmdLine),
		nil,
		nil,
		false,
		createUnicodeEnvironment|createNoWindow,
		envBlock,
		nil,
		si,
		pi,
	); err != nil {
		return nil, fmt.Errorf("CreateProcessAsUser: %w", err)
	}

	_ = windows.CloseHandle(pi.Thread)
	return &sessionProc{handle: pi.Process}, nil
}

func randomToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "rmm-desktop-helper"
	}
	return hex.EncodeToString(b)
}
