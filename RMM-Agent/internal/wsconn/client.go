package wsconn

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type SessionHandler func(sessionId string, sessionType string, send func(Msg), recv <-chan Msg)

type Client struct {
	dashboardURL string
	apiKey       string
	handler      SessionHandler

	mu   sync.Mutex
	conn *websocket.Conn
}

func NewClient(dashboardURL, apiKey string, handler SessionHandler) *Client {
	return &Client{
		dashboardURL: dashboardURL,
		apiKey:       apiKey,
		handler:      handler,
	}
}

// Run connects and reconnects forever.
func (c *Client) Run() {
	for {
		if err := c.connect(); err != nil {
			log.Printf("[ws] Connection error: %v — retrying in 10s", err)
		}
		time.Sleep(10 * time.Second)
	}
}

func (c *Client) connect() error {
	wsURL := toWS(c.dashboardURL) + "/ws/agent"
	log.Printf("[ws] Connecting to %s", wsURL)

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		return err
	}
	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		c.conn = nil
		c.mu.Unlock()
		conn.Close()
	}()

	// Authenticate
	authMsg, _ := json.Marshal(Msg{"type": "AUTH", "apiKey": c.apiKey})
	if err := conn.WriteMessage(websocket.TextMessage, authMsg); err != nil {
		return err
	}

	// Wait for AUTH_OK
	_, raw, err := conn.ReadMessage()
	if err != nil {
		return err
	}
	msg, _ := Parse(raw)
	if msg.Type() != "AUTH_OK" {
		log.Printf("[ws] Auth rejected by dashboard")
		return fmt.Errorf("auth rejected")
	}
	log.Printf("[ws] Authenticated. Waiting for sessions...")

	// Active sessions: sessionId → channel to send to handler
	type session struct {
		ch chan Msg
	}
	sessions := make(map[string]*session)
	var sessmu sync.Mutex

	// Close all session channels when this connection drops so handler
	// goroutines unblock and don't leak across reconnects.
	defer func() {
		sessmu.Lock()
		for sid, s := range sessions {
			close(s.ch)
			delete(sessions, sid)
		}
		sessmu.Unlock()
	}()

	send := func(m Msg) {
		c.mu.Lock()
		defer c.mu.Unlock()
		if c.conn == nil {
			return
		}
		data, _ := json.Marshal(m)
		c.conn.WriteMessage(websocket.TextMessage, data) //nolint
	}

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return err
		}
		msg, err := Parse(raw)
		if err != nil {
			continue
		}

		switch msg.Type() {
		case "SESSION_START":
			sid := msg.SessionID()
			stype := msg.String("sessionType")
			ch := make(chan Msg, 64)
			sessmu.Lock()
			sessions[sid] = &session{ch: ch}
			sessmu.Unlock()

			// Notify relay session is ready
			send(Msg{"type": "SESSION_READY", "sessionId": sid})

			// Launch session handler goroutine
			go func(sid, stype string, ch chan Msg) {
				defer func() {
					sessmu.Lock()
					delete(sessions, sid)
					sessmu.Unlock()
					send(Msg{"type": "SESSION_END", "sessionId": sid})
					log.Printf("[ws] Session ended: %s (%s)", sid, stype)
				}()
				log.Printf("[ws] Session started: %s (%s)", sid, stype)
				c.handler(sid, stype, send, ch)
			}(sid, stype, ch)

		case "SESSION_END":
			sid := msg.SessionID()
			sessmu.Lock()
			if s, ok := sessions[sid]; ok {
				close(s.ch)
				delete(sessions, sid)
			}
			sessmu.Unlock()

		default:
			// Route to session channel
			sid := msg.SessionID()
			if sid == "" {
				continue
			}
			sessmu.Lock()
			s, ok := sessions[sid]
			sessmu.Unlock()
			if ok {
				select {
				case s.ch <- msg:
				default:
					// channel full, drop
				}
			}
		}
	}
}

func toWS(httpURL string) string {
	if len(httpURL) >= 5 && httpURL[:5] == "https" {
		return "wss" + httpURL[5:]
	}
	if len(httpURL) >= 4 && httpURL[:4] == "http" {
		return "ws" + httpURL[4:]
	}
	return httpURL
}
