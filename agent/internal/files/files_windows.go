//go:build windows

package files

import (
	"path/filepath"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"

	"github.com/meredock/rmm-agent/internal/wsconn"
)

var (
	kernel32dll               = windows.NewLazySystemDLL("kernel32.dll")
	procGetLogicalDriveStrings = kernel32dll.NewProc("GetLogicalDriveStringsW")
)

func listRoot(sessionId, reqId string, send func(wsconn.Msg)) {
	drives := getDrives()
	items := make([]FileItem, 0, len(drives))
	for _, d := range drives {
		items = append(items, FileItem{
			Name:    d,
			Path:    filepath.ToSlash(d),
			IsDir:   true,
			Size:    0,
			ModTime: time.Time{},
		})
	}
	sendItems(sessionId, reqId, items, send)
}

func getDrives() []string {
	buf := make([]uint16, 256)
	n, _, _ := procGetLogicalDriveStrings.Call(
		uintptr(len(buf)),
		uintptr(unsafe.Pointer(&buf[0])),
	)
	if n == 0 {
		return []string{`C:\`}
	}
	var drives []string
	i := 0
	for i < int(n) {
		if buf[i] == 0 {
			i++
			continue
		}
		j := i
		for j < int(n) && buf[j] != 0 {
			j++
		}
		drives = append(drives, windows.UTF16ToString(buf[i:j]))
		i = j + 1
	}
	return drives
}
