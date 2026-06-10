package desktop

import (
	"log"
	"time"

	"github.com/meredock/rmm-agent/internal/wsconn"
)

const targetFPS = 8
const frameInterval = time.Second / targetFPS

func Handle(sessionId string, send func(wsconn.Msg), recv <-chan wsconn.Msg) {
	stop := make(chan struct{})
	go captureLoop(sessionId, send, stop)
	for msg := range recv {
		switch msg.Type() {
		case "DESKTOP_MOUSE":
			simulateMouse(msg.String("event"), int(msg.Float("x")), int(msg.Float("y")), int(msg.Float("button")))
		case "DESKTOP_KEY":
			simulateKey(msg.String("event"), msg.String("key"))
		case "DESKTOP_SCROLL":
			simulateScroll(int(msg.Float("x")), int(msg.Float("y")), int(msg.Float("delta")))
		}
	}
	close(stop)
}

func captureLoop(sessionId string, send func(wsconn.Msg), stop <-chan struct{}) {
	ticker := time.NewTicker(frameInterval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			b64, w, h, err := captureScreen()
			if err != nil {
				log.Printf("[desktop] capture error: %v", err)
				continue
			}
			send(wsconn.Msg{
				"type":      "DESKTOP_FRAME",
				"sessionId": sessionId,
				"data":      b64,
				"width":     w,
				"height":    h,
			})
		}
	}
}
