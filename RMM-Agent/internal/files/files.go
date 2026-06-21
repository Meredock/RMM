package files

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/meredock/rmm-agent/internal/wsconn"
)

type FileItem struct {
	Name    string    `json:"name"`
	Path    string    `json:"path"`
	IsDir   bool      `json:"isDir"`
	Size    int64     `json:"size"`
	ModTime time.Time `json:"modTime"`
}

func Handle(sessionId string, send func(wsconn.Msg), recv <-chan wsconn.Msg) {
	for msg := range recv {
		reqId := msg.String("reqId")
		switch msg.Type() {
		case "FILES_LIST":
			listDir(sessionId, reqId, msg.String("path"), send)
		case "FILES_READ":
			readFile(sessionId, reqId, msg.String("path"), send)
		case "FILES_WRITE":
			writeFile(sessionId, reqId, msg.String("path"), msg.String("data"), send)
		case "FILES_DELETE":
			deletePath(sessionId, reqId, msg.String("path"), send)
		case "FILES_MKDIR":
			mkdir(sessionId, reqId, msg.String("path"), send)
		case "FILES_RENAME":
			renamePath(sessionId, reqId, msg.String("from"), msg.String("to"), send)
		case "FILES_COPY":
			copyPath(sessionId, reqId, msg.String("from"), msg.String("to"), send)
		}
	}
}

func reply(send func(wsconn.Msg), m wsconn.Msg) {
	send(m)
}

func sendItems(sessionId, reqId string, items []FileItem, send func(wsconn.Msg)) {
	itemsJSON, _ := json.Marshal(items)
	reply(send, wsconn.Msg{"type": "FILES_LIST_RES", "sessionId": sessionId, "reqId": reqId, "items": json.RawMessage(itemsJSON)})
}

func listDir(sessionId, reqId, path string, send func(wsconn.Msg)) {
	if path == "" || path == "/" {
		listRoot(sessionId, reqId, send)
		return
	}
	entries, err := os.ReadDir(path)
	if err != nil {
		reply(send, wsconn.Msg{"type": "FILES_LIST_RES", "sessionId": sessionId, "reqId": reqId, "error": err.Error()})
		return
	}
	items := make([]FileItem, 0, len(entries))
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		items = append(items, FileItem{
			Name:    e.Name(),
			Path:    filepath.ToSlash(filepath.Join(path, e.Name())),
			IsDir:   e.IsDir(),
			Size:    info.Size(),
			ModTime: info.ModTime(),
		})
	}
	sendItems(sessionId, reqId, items, send)
}

func readFile(sessionId, reqId, path string, send func(wsconn.Msg)) {
	const maxSize = 50 * 1024 * 1024 // 50 MB
	info, err := os.Stat(path)
	if err != nil {
		reply(send, wsconn.Msg{"type": "FILES_READ_RES", "sessionId": sessionId, "reqId": reqId, "error": err.Error()})
		return
	}
	if info.Size() > maxSize {
		reply(send, wsconn.Msg{"type": "FILES_READ_RES", "sessionId": sessionId, "reqId": reqId, "error": "file too large (max 50 MB)"})
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		reply(send, wsconn.Msg{"type": "FILES_READ_RES", "sessionId": sessionId, "reqId": reqId, "error": err.Error()})
		return
	}
	reply(send, wsconn.Msg{"type": "FILES_READ_RES", "sessionId": sessionId, "reqId": reqId, "data": base64.StdEncoding.EncodeToString(data), "size": info.Size()})
}

func writeFile(sessionId, reqId, path, b64data string, send func(wsconn.Msg)) {
	data, err := base64.StdEncoding.DecodeString(b64data)
	if err != nil {
		reply(send, wsconn.Msg{"type": "FILES_WRITE_RES", "sessionId": sessionId, "reqId": reqId, "ok": false, "error": err.Error()})
		return
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		reply(send, wsconn.Msg{"type": "FILES_WRITE_RES", "sessionId": sessionId, "reqId": reqId, "ok": false, "error": err.Error()})
		return
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		reply(send, wsconn.Msg{"type": "FILES_WRITE_RES", "sessionId": sessionId, "reqId": reqId, "ok": false, "error": err.Error()})
		return
	}
	reply(send, wsconn.Msg{"type": "FILES_WRITE_RES", "sessionId": sessionId, "reqId": reqId, "ok": true})
}

func deletePath(sessionId, reqId, path string, send func(wsconn.Msg)) {
	err := os.RemoveAll(path)
	if err != nil {
		reply(send, wsconn.Msg{"type": "FILES_DELETE_RES", "sessionId": sessionId, "reqId": reqId, "ok": false, "error": err.Error()})
		return
	}
	reply(send, wsconn.Msg{"type": "FILES_DELETE_RES", "sessionId": sessionId, "reqId": reqId, "ok": true})
}

func mkdir(sessionId, reqId, path string, send func(wsconn.Msg)) {
	err := os.MkdirAll(path, 0755)
	if err != nil {
		reply(send, wsconn.Msg{"type": "FILES_MKDIR_RES", "sessionId": sessionId, "reqId": reqId, "ok": false, "error": err.Error()})
		return
	}
	reply(send, wsconn.Msg{"type": "FILES_MKDIR_RES", "sessionId": sessionId, "reqId": reqId, "ok": true})
}

func renamePath(sessionId, reqId, from, to string, send func(wsconn.Msg)) {
	err := os.Rename(from, to)
	if err != nil {
		reply(send, wsconn.Msg{"type": "FILES_RENAME_RES", "sessionId": sessionId, "reqId": reqId, "ok": false, "error": err.Error()})
		return
	}
	reply(send, wsconn.Msg{"type": "FILES_RENAME_RES", "sessionId": sessionId, "reqId": reqId, "ok": true})
}

func copyPath(sessionId, reqId, from, to string, send func(wsconn.Msg)) {
	if err := copyRecursive(from, to); err != nil {
		reply(send, wsconn.Msg{"type": "FILES_COPY_RES", "sessionId": sessionId, "reqId": reqId, "ok": false, "error": err.Error()})
		return
	}
	reply(send, wsconn.Msg{"type": "FILES_COPY_RES", "sessionId": sessionId, "reqId": reqId, "ok": true})
}

// copyRecursive copies a file or, for a directory, its whole tree from -> to.
func copyRecursive(from, to string) error {
	info, err := os.Stat(from)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return copyFile(from, to, info.Mode().Perm())
	}
	if err := os.MkdirAll(to, info.Mode().Perm()); err != nil {
		return err
	}
	entries, err := os.ReadDir(from)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if err := copyRecursive(filepath.Join(from, e.Name()), filepath.Join(to, e.Name())); err != nil {
			return err
		}
	}
	return nil
}

func copyFile(from, to string, perm os.FileMode) error {
	src, err := os.Open(from)
	if err != nil {
		return err
	}
	defer src.Close()
	dst, err := os.OpenFile(to, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, perm)
	if err != nil {
		return err
	}
	defer dst.Close()
	if _, err := io.Copy(dst, src); err != nil {
		return err
	}
	return dst.Close()
}
