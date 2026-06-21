// Package httpcheck performs a single HTTP health check from the agent's
// network vantage point, so monitors can reach a customer's internal/LAN
// services that the dashboard server can't see.
package httpcheck

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type request struct {
	URL            string `json:"url"`
	ExpectedStatus int    `json:"expectedStatus"`
	TimeoutMs      int    `json:"timeoutMs"`
}

type result struct {
	OK         bool   `json:"ok"`
	Status     int    `json:"status"`
	DurationMs int64  `json:"durationMs"`
	Error      string `json:"error,omitempty"`
}

// Run performs the check described by the JSON payload and returns a JSON
// result. The returned error is non-nil only for a malformed payload; a failed
// check (timeout, connection refused, wrong status) is reported as ok=false in
// the JSON so the command itself still succeeds.
func Run(payload string) (string, error) {
	var req request
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", fmt.Errorf("invalid httpcheck payload: %w", err)
	}
	if req.URL == "" {
		return "", fmt.Errorf("httpcheck: url is required")
	}
	timeout := time.Duration(req.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	client := &http.Client{Timeout: timeout}
	start := time.Now()
	resp, err := client.Get(req.URL)
	dur := time.Since(start).Milliseconds()

	res := result{DurationMs: dur}
	if err != nil {
		res.OK = false
		res.Error = err.Error()
	} else {
		defer resp.Body.Close()
		res.Status = resp.StatusCode
		if req.ExpectedStatus > 0 {
			res.OK = resp.StatusCode == req.ExpectedStatus
		} else {
			res.OK = resp.StatusCode < 400
		}
		if !res.OK {
			res.Error = fmt.Sprintf("unexpected status %d", resp.StatusCode)
		}
	}

	out, _ := json.Marshal(res)
	return string(out), nil
}
