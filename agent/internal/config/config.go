package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

type Config struct {
	DashboardURL        string `json:"dashboard_url"`
	RegistrationSecret  string `json:"registration_secret,omitempty"`
	DeviceName          string `json:"device_name"`
	APIKey              string `json:"api_key,omitempty"`
	DeviceID            string `json:"device_id,omitempty"`
	IntervalSeconds     int    `json:"interval_seconds"`
	AgentVersion        string `json:"agent_version"`
}

func DefaultConfig() *Config {
	hostname, _ := os.Hostname()
	return &Config{
		DashboardURL:    "http://localhost:3000",
		DeviceName:      hostname,
		IntervalSeconds: 30,
		AgentVersion:    "1.0.0",
	}
}

func configPath() string {
	switch runtime.GOOS {
	case "windows":
		dir := os.Getenv("PROGRAMDATA")
		if dir == "" {
			dir = `C:\ProgramData`
		}
		return filepath.Join(dir, "RMMAgent", "config.json")
	default:
		return "/etc/rmm-agent/config.json"
	}
}

func Load() (*Config, error) {
	path := configPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (c *Config) Save() error {
	path := configPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

func (c *Config) IsRegistered() bool {
	return c.APIKey != "" && c.DeviceID != ""
}
