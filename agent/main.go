package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"runtime"
	"time"

	"github.com/meredock/rmm-agent/internal/api"
	"github.com/meredock/rmm-agent/internal/config"
	"github.com/meredock/rmm-agent/internal/desktop"
	"github.com/meredock/rmm-agent/internal/executor"
	"github.com/meredock/rmm-agent/internal/files"
	"github.com/meredock/rmm-agent/internal/metrics"
	"github.com/meredock/rmm-agent/internal/terminal"
	"github.com/meredock/rmm-agent/internal/wsconn"
)

func main() {
	dashboardURL := flag.String("url", "", "Dashboard URL")
	regSecret := flag.String("secret", "", "Registration secret")
	deviceName := flag.String("name", "", "Device friendly name")
	interval := flag.Int("interval", 0, "Heartbeat interval in seconds")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		cfg = config.DefaultConfig()
	}
	if *dashboardURL != "" { cfg.DashboardURL = *dashboardURL }
	if *regSecret != "" { cfg.RegistrationSecret = *regSecret }
	if *deviceName != "" { cfg.DeviceName = *deviceName }
	if *interval > 0 { cfg.IntervalSeconds = *interval }
	if cfg.IntervalSeconds <= 0 { cfg.IntervalSeconds = 30 }

	if cfg.DashboardURL == "" {
		fmt.Fprintln(os.Stderr, "Error: dashboard URL is required (-url flag or config file)")
		os.Exit(1)
	}

	if checkWindowsService(cfg) {
		return
	}

	runAgent(cfg)
}

func runAgent(cfg *config.Config) {
	log.Printf("RMM Agent v%s | %s | %s", cfg.AgentVersion, runtime.GOOS, cfg.DashboardURL)

	client := api.NewClient(cfg.DashboardURL, cfg.APIKey)

	if !cfg.IsRegistered() {
		hostname, _ := os.Hostname()
		for {
			log.Println("Registering with dashboard...")
			resp, err := client.Register(api.RegisterRequest{
				Name: cfg.DeviceName, Hostname: hostname,
				Platform: runtime.GOOS, OSVersion: runtime.GOOS + "/" + runtime.GOARCH,
				AgentVersion: cfg.AgentVersion,
			}, cfg.RegistrationSecret)
			if err != nil {
				log.Printf("Registration failed: %v — retrying in 30s", err)
				time.Sleep(30 * time.Second)
				continue
			}
			cfg.APIKey = resp.APIKey
			cfg.DeviceID = resp.DeviceID
			cfg.RegistrationSecret = ""
			client = api.NewClient(cfg.DashboardURL, cfg.APIKey)
			if err := cfg.Save(); err != nil {
				log.Printf("Warning: could not save config: %v", err)
			}
			log.Printf("Registered. Device ID: %s", cfg.DeviceID)
			break
		}
	} else {
		log.Printf("Registered. Device ID: %s", cfg.DeviceID)
	}

	wsClient := wsconn.NewClient(cfg.DashboardURL, cfg.APIKey, sessionHandler)
	go wsClient.Run()

	log.Printf("Heartbeat every %ds", cfg.IntervalSeconds)
	beat(client, cfg)
	for range time.NewTicker(time.Duration(cfg.IntervalSeconds) * time.Second).C {
		beat(client, cfg)
	}
}

func sessionHandler(sessionId, sessionType string, send func(wsconn.Msg), recv <-chan wsconn.Msg) {
	switch sessionType {
	case "TERMINAL":
		terminal.Handle(sessionId, send, recv)
	case "FILES":
		files.Handle(sessionId, send, recv)
	case "DESKTOP":
		desktop.Handle(sessionId, send, recv)
	default:
		log.Printf("[ws] Unknown session type: %s", sessionType)
	}
}

func beat(client *api.Client, cfg *config.Config) {
	snapshot, err := metrics.Collect(cfg.AgentVersion)
	if err != nil {
		log.Printf("Metrics error: %v", err)
		return
	}
	resp, err := client.Heartbeat(snapshot)
	if err != nil {
		log.Printf("Heartbeat error: %v", err)
		return
	}
	if len(resp.PendingCommands) == 0 {
		return
	}
	for _, cmd := range resp.PendingCommands {
		log.Printf("Running: %s", cmd.Command)
		result := executor.Run(cmd.Command)
		if err := client.ReportResult(api.CommandResultRequest{
			CommandID: cmd.ID, Output: result.Output,
			ExitCode: result.ExitCode, Success: result.Success,
		}); err != nil {
			log.Printf("Report result error: %v", err)
		}
	}
}
