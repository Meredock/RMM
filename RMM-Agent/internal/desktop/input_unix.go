//go:build !windows

package desktop

import (
	"fmt"
	"os/exec"
	"runtime"
)

func simulateMouse(event string, x, y, button int) {
	if runtime.GOOS == "darwin" {
		simulateMouseMac(event, x, y, button)
	} else {
		simulateMouseLinux(event, x, y, button)
	}
}

func simulateMouseLinux(event string, x, y, button int) {
	btn := button + 1
	switch event {
	case "move":
		exec.Command("xdotool", "mousemove", fmt.Sprint(x), fmt.Sprint(y)).Run() //nolint
	case "down":
		exec.Command("xdotool", "mousedown", fmt.Sprint(btn)).Run() //nolint
	case "up":
		exec.Command("xdotool", "mouseup", fmt.Sprint(btn)).Run() //nolint
	}
}

func simulateMouseMac(event string, x, y, button int) {
	switch event {
	case "move":
		exec.Command("cliclick", fmt.Sprintf("m:%d,%d", x, y)).Run() //nolint
	case "down":
		exec.Command("cliclick", fmt.Sprintf("kd:%d,%d", x, y)).Run() //nolint
	case "up":
		exec.Command("cliclick", fmt.Sprintf("ku:%d,%d", x, y)).Run() //nolint
	}
}

func simulateKey(event, key string) {
	if event != "down" {
		return
	}
	if runtime.GOOS == "darwin" {
		exec.Command("cliclick", fmt.Sprintf("t:%s", key)).Run() //nolint
	} else {
		exec.Command("xdotool", "key", key).Run() //nolint
	}
}

func simulateScroll(x, y, delta int) {
	btn := "4"
	if delta < 0 {
		btn = "5"
	}
	if runtime.GOOS == "darwin" {
		exec.Command("cliclick", fmt.Sprintf("m:%d,%d", x, y)).Run() //nolint
	} else {
		exec.Command("xdotool", "click", btn).Run() //nolint
	}
}
