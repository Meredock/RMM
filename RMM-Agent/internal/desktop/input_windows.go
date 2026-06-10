//go:build windows

package desktop

// user32dll is declared in capture_windows.go (same package, same build tag).

var (
	procSetCursorPos = user32dll.NewProc("SetCursorPos")
	procMouseEvent   = user32dll.NewProc("mouse_event")
	procKeybdEvent   = user32dll.NewProc("keybd_event")
	procVkKeyScanW   = user32dll.NewProc("VkKeyScanW")
)

const (
	mouseeventfLeftDown   = uintptr(0x0002)
	mouseeventfLeftUp     = uintptr(0x0004)
	mouseeventfRightDown  = uintptr(0x0008)
	mouseeventfRightUp    = uintptr(0x0010)
	mouseeventfMiddleDown = uintptr(0x0020)
	mouseeventfMiddleUp   = uintptr(0x0040)
	mouseeventfWheel      = uintptr(0x0800)

	keyeventfKeyUp = uintptr(0x0002)
)

func simulateMouse(event string, x, y, button int) {
	procSetCursorPos.Call(uintptr(x), uintptr(y))
	downFlags := []uintptr{mouseeventfLeftDown, mouseeventfMiddleDown, mouseeventfRightDown}
	upFlags := []uintptr{mouseeventfLeftUp, mouseeventfMiddleUp, mouseeventfRightUp}
	switch event {
	case "down":
		if button >= 0 && button < len(downFlags) {
			procMouseEvent.Call(downFlags[button], 0, 0, 0, 0)
		}
	case "up":
		if button >= 0 && button < len(upFlags) {
			procMouseEvent.Call(upFlags[button], 0, 0, 0, 0)
		}
	}
}

func simulateKey(event, key string) {
	vk, needShift := resolveKey(key)
	if vk == 0 {
		return
	}
	if event == "down" {
		if needShift {
			procKeybdEvent.Call(0x10, 0, 0, 0) // VK_SHIFT down
		}
		procKeybdEvent.Call(uintptr(vk), 0, 0, 0)
	} else {
		procKeybdEvent.Call(uintptr(vk), 0, keyeventfKeyUp, 0)
		if needShift {
			procKeybdEvent.Call(0x10, 0, keyeventfKeyUp, 0) // VK_SHIFT up
		}
	}
}

func simulateScroll(x, y, delta int) {
	procSetCursorPos.Call(uintptr(x), uintptr(y))
	// Browser deltaY > 0 = scroll down = negative WHEEL_DELTA in Win32.
	wheel := int32(120)
	if delta > 0 {
		wheel = -120
	}
	procMouseEvent.Call(mouseeventfWheel, 0, 0, uintptr(uint32(wheel)), 0)
}

// resolveKey maps a browser key name to a Win32 virtual key code.
// needShift indicates whether shift must be held for the key.
func resolveKey(key string) (vk uint16, needShift bool) {
	named := map[string]uint16{
		"Enter": 0x0D, "Backspace": 0x08, "Delete": 0x2E,
		"Escape": 0x1B, "Tab": 0x09, "CapsLock": 0x14, "Insert": 0x2D,
		"ArrowUp": 0x26, "ArrowDown": 0x28, "ArrowLeft": 0x25, "ArrowRight": 0x27,
		"Home": 0x24, "End": 0x23, "PageUp": 0x21, "PageDown": 0x22,
		"Shift": 0x10, "Control": 0x11, "Alt": 0x12, "Meta": 0x5B,
		"F1": 0x70, "F2": 0x71, "F3": 0x72, "F4": 0x73,
		"F5": 0x74, "F6": 0x75, "F7": 0x76, "F8": 0x77,
		"F9": 0x78, "F10": 0x79, "F11": 0x7A, "F12": 0x7B,
	}
	if v, ok := named[key]; ok {
		return v, false
	}
	if len(key) == 1 {
		ret, _, _ := procVkKeyScanW.Call(uintptr(rune(key[0])))
		v := uint16(ret & 0xFF)
		if v == 0xFF {
			return 0, false
		}
		shift := uint16((ret >> 8) & 0xFF)
		return v, shift&1 != 0
	}
	return 0, false
}
