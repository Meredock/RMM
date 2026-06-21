// Package tray shows a Windows notification-area (system tray) icon indicating
// the agent is running. Because the agent runs as a Session 0 service, the icon
// is shown by a helper process launched in the interactive user session.
package tray

import _ "embed"

//go:embed icon.ico
var iconICO []byte

// Run displays the tray icon and blocks until the process exits. On non-Windows
// platforms it is a no-op that returns immediately.
func Run() {
	run()
}

// StartSupervisor launches and keeps alive a tray helper in the active user
// session (the service's own Session 0 can't display a tray icon). It returns
// immediately; on non-Windows platforms it does nothing.
func StartSupervisor() {
	startSupervisor()
}
