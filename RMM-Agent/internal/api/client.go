package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

func NewClient(baseURL, apiKey string) *Client {
	return &Client{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *Client) post(path string, body any, extraHeaders map[string]string) (*http.Response, error) {
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest("POST", c.baseURL+path, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("X-Api-Key", c.apiKey)
	}
	for k, v := range extraHeaders {
		req.Header.Set(k, v)
	}
	return c.httpClient.Do(req)
}

// --- Register ---

type RegisterRequest struct {
	Name         string `json:"name"`
	Hostname     string `json:"hostname"`
	Platform     string `json:"platform"`
	OSVersion    string `json:"osVersion,omitempty"`
	AgentVersion string `json:"agentVersion,omitempty"`
}

type RegisterResponse struct {
	DeviceID string `json:"deviceId"`
	APIKey   string `json:"apiKey"`
	Message  string `json:"message"`
}

func (c *Client) Register(req RegisterRequest, registrationSecret string) (*RegisterResponse, error) {
	headers := map[string]string{}
	if registrationSecret != "" {
		headers["X-Registration-Secret"] = registrationSecret
	}
	resp, err := c.post("/api/agent/register", req, headers)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		return nil, fmt.Errorf("registration failed with status %d", resp.StatusCode)
	}

	var result RegisterResponse
	return &result, json.NewDecoder(resp.Body).Decode(&result)
}

// --- Heartbeat ---

type PendingCommand struct {
	ID      string `json:"id"`
	Command string `json:"command"`
}

type HeartbeatResponse struct {
	PendingCommands []PendingCommand `json:"pendingCommands"`
}

func (c *Client) Heartbeat(payload any) (*HeartbeatResponse, error) {
	resp, err := c.post("/api/agent/heartbeat", payload, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("heartbeat failed with status %d", resp.StatusCode)
	}

	var result HeartbeatResponse
	return &result, json.NewDecoder(resp.Body).Decode(&result)
}

// --- Command Result ---

type CommandResultRequest struct {
	CommandID string `json:"commandId"`
	Output    string `json:"output"`
	ExitCode  int    `json:"exitCode"`
	Success   bool   `json:"success"`
}

func (c *Client) ReportResult(req CommandResultRequest) error {
	resp, err := c.post("/api/agent/command/result", req, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("report result failed with status %d", resp.StatusCode)
	}
	return nil
}
