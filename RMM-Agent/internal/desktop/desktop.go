package desktop

import (
	"encoding/json"
	"log"
	"net"
	"sync"
	"time"

	"github.com/meredock/rmm-agent/internal/wsconn"
)

const targetFPS = 8
const frameInterval = time.Second / targetFPS

// Handle services a DESKTOP session. On Windows, where the agent runs as a
// service in the isolated Session 0, it bridges capture/input to a helper
// process in the interactive console session (dispatch handles that); otherwise
// it captures in-process.
func Handle(sessionId string, send func(wsconn.Msg), recv <-chan wsconn.Msg) {
	dispatch(sessionId, send, recv)
}

// runInProcess captures and injects directly in the current process. This works
// when the agent runs in the interactive session (e.g. during development) and
// is the fallback when a session helper can't be launched.
func runInProcess(sessionId string, send func(wsconn.Msg), recv <-chan wsconn.Msg) {
	setDPIAware() // align capture and cursor coordinates before any input
	stop := make(chan struct{})
	go captureFrames(stop, func(b64 string, w, h int) {
		send(wsconn.Msg{
			"type":      "DESKTOP_FRAME",
			"sessionId": sessionId,
			"data":      b64,
			"width":     w,
			"height":    h,
		})
	})
	for msg := range recv {
		handleInput(msg)
	}
	close(stop)
}

// captureFrames grabs the screen at the target frame rate, handing each encoded
// frame to onFrame until stop is closed.
// screenCapturer produces encoded frames. Implementations are platform-specific
// (DXGI/GDI on Windows; screenshot tools elsewhere) and created by newCapturer.
type screenCapturer interface {
	frame() (b64 string, w, h int, err error)
	close()
}

func captureFrames(stop <-chan struct{}, onFrame func(b64 string, w, h int)) {
	bindCaptureThread() // attach this capture thread to the visible desktop (Windows)
	cap := newCapturer()
	defer cap.close()
	ticker := time.NewTicker(frameInterval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			b64, w, h, err := cap.frame()
			if err != nil {
				log.Printf("[desktop] capture: %v", err)
				continue
			}
			onFrame(b64, w, h)
		}
	}
}

// handleInput applies a single input event from the browser.
func handleInput(msg wsconn.Msg) {
	switch msg.Type() {
	case "DESKTOP_MOUSE":
		simulateMouse(msg.String("event"), int(msg.Float("x")), int(msg.Float("y")), int(msg.Float("button")))
	case "DESKTOP_KEY":
		simulateKey(msg.String("event"), msg.String("key"))
	case "DESKTOP_SCROLL":
		simulateScroll(int(msg.Float("x")), int(msg.Float("y")), int(msg.Float("delta")))
	}
}

// RunHelper is the entry point for the helper subprocess launched in the
// interactive session. It connects back to the service, streams captured frames
// over the connection, and applies input events it receives.
func RunHelper(addr, token string) error {
	setDPIAware() // align capture and cursor coordinates before any input
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()

	enc := json.NewEncoder(conn)
	dec := json.NewDecoder(conn)

	// Authenticate to the waiting service listener.
	if err := enc.Encode(wsconn.Msg{"type": "HELLO", "token": token}); err != nil {
		return err
	}

	var encMu sync.Mutex
	stop := make(chan struct{})
	go captureFrames(stop, func(b64 string, w, h int) {
		encMu.Lock()
		_ = enc.Encode(wsconn.Msg{"type": "DESKTOP_FRAME", "data": b64, "width": w, "height": h})
		encMu.Unlock()
	})
	defer close(stop)

	for {
		var msg wsconn.Msg
		if err := dec.Decode(&msg); err != nil {
			return err
		}
		handleInput(msg)
	}
}

// proxyHelper bridges a connected helper to the browser session: helper frames
// are forwarded to the client (stamped with sessionId), and client input events
// are forwarded to the helper. It returns when the recv channel or the
// connection closes. The caller passes the encoder/decoder it already used for
// the handshake so no buffered bytes are lost.
func proxyHelper(enc *json.Encoder, dec *json.Decoder, sessionId string, send func(wsconn.Msg), recv <-chan wsconn.Msg) {
	go func() {
		for {
			var msg wsconn.Msg
			if err := dec.Decode(&msg); err != nil {
				return
			}
			if msg.Type() == "DESKTOP_FRAME" {
				msg["sessionId"] = sessionId
				send(msg)
			}
		}
	}()

	for msg := range recv {
		if err := enc.Encode(msg); err != nil {
			return
		}
	}
}
