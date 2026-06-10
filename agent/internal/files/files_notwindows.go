//go:build !windows

package files

import (
	"os"
	"path/filepath"
	"time"

	"github.com/meredock/rmm-agent/internal/wsconn"
)

func listRoot(sessionId, reqId string, send func(wsconn.Msg)) {
	entries, err := os.ReadDir("/")
	if err != nil {
		reply(send, wsconn.Msg{"type": "FILES_LIST_RES", "sessionId": sessionId, "reqId": reqId, "error": err.Error()})
		return
	}
	items := make([]FileItem, 0, len(entries))
	for _, e := range entries {
		info, _ := e.Info()
		var sz int64
		var mt time.Time
		if info != nil {
			sz = info.Size()
			mt = info.ModTime()
		}
		items = append(items, FileItem{
			Name:    e.Name(),
			Path:    filepath.ToSlash(filepath.Join("/", e.Name())),
			IsDir:   e.IsDir(),
			Size:    sz,
			ModTime: mt,
		})
	}
	sendItems(sessionId, reqId, items, send)
}
