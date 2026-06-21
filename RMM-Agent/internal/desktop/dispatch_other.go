//go:build !windows

package desktop

import "github.com/meredock/rmm-agent/internal/wsconn"

// dispatch on non-Windows platforms captures in-process; there is no Session 0
// isolation to bridge.
func dispatch(sessionId string, send func(wsconn.Msg), recv <-chan wsconn.Msg) {
	runInProcess(sessionId, send, recv)
}
