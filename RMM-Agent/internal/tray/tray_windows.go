//go:build windows

package tray

import "fyne.io/systray"

func run() {
	systray.Run(onReady, func() {})
}

func onReady() {
	systray.SetIcon(iconICO)
	systray.SetTitle("RMM Agent")
	systray.SetTooltip("Fixsmith RMM Agent — running")

	// Presence only: a single disabled item naming the agent. No quit item, so
	// users can't stop monitoring from the tray.
	item := systray.AddMenuItem("Fixsmith RMM Agent (running)", "The RMM agent is active")
	item.Disable()
}
