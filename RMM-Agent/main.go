package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/meredock/rmm-agent/internal/api"
	"github.com/meredock/rmm-agent/internal/config"
	"github.com/meredock/rmm-agent/internal/desktop"
	"github.com/meredock/rmm-agent/internal/executor"
	"github.com/meredock/rmm-agent/internal/files"
	"github.com/meredock/rmm-agent/internal/metrics"
	"github.com/meredock/rmm-agent/internal/selfupdate"
	"github.com/meredock/rmm-agent/internal/terminal"
	"github.com/meredock/rmm-agent/internal/tray"
	"github.com/meredock/rmm-agent/internal/wsconn"
)

// logPath returns the agent log file location per OS.
func logPath() string {
	if runtime.GOOS == "windows" {
		dir := os.Getenv("PROGRAMDATA")
		if dir == "" {
			dir = `C:\ProgramData`
		}
		return filepath.Join(dir, "RMMAgent", "agent.log")
	}
	return "/var/log/rmm-agent.log"
}

// setupLogging tees log output to a file (the service has no console), with a
// crude size cap so it can't grow without bound. Applies to all modes, including
// the desktop/tray helper subprocesses, so their logs are captured too.
func setupLogging() {
	path := logPath()
	_ = os.MkdirAll(filepath.Dir(path), 0755)
	flags := os.O_CREATE | os.O_WRONLY | os.O_APPEND
	if fi, err := os.Stat(path); err == nil && fi.Size() > 5*1024*1024 {
		flags = os.O_CREATE | os.O_WRONLY | os.O_TRUNC
	}
	f, err := os.OpenFile(path, flags, 0644)
	if err != nil {
		return
	}
	log.SetOutput(io.MultiWriter(os.Stderr, f))
}

func main() {
	setupLogging()
	dashboardURL := flag.String("url", "", "Dashboard URL")
	regSecret := flag.String("secret", "", "Registration secret")
	deviceName := flag.String("name", "", "Device friendly name")
	interval := flag.Int("interval", 0, "Heartbeat interval in seconds")
	desktopHelper := flag.Bool("desktop-helper", false, "Internal: run as the remote-desktop capture helper")
	desktopAddr := flag.String("desktop-addr", "", "Internal: helper callback address")
	desktopToken := flag.String("desktop-token", "", "Internal: helper auth token")
	trayHelper := flag.Bool("tray", false, "Internal: run as the system-tray presence helper")
	applyUpdate := flag.Bool("apply-update", false, "Internal: install a downloaded update")
	updateTarget := flag.String("update-target", "", "Internal: path of the binary to replace")
	updateService := flag.String("update-service", "", "Internal: service to restart after update")
	flag.Parse()

	// Helper modes run in the interactive session and must short-circuit before
	// any config load or Windows service handling.
	if *desktopHelper {
		if err := desktop.RunHelper(*desktopAddr, *desktopToken); err != nil {
			log.Printf("desktop helper exited: %v", err)
		}
		return
	}
	if *trayHelper {
		tray.Run()
		return
	}
	if *applyUpdate {
		if err := selfupdate.ApplyUpdate(*updateTarget, *updateService); err != nil {
			log.Printf("update failed: %v", err)
		}
		return
	}

	cfg, err := config.Load()
	if err != nil {
		cfg = config.DefaultConfig()
	}
	// The binary's compiled version always wins over any persisted value.
	cfg.AgentVersion = config.Version
	if *dashboardURL != "" {
		cfg.DashboardURL = *dashboardURL
	}
	if *regSecret != "" {
		cfg.RegistrationSecret = *regSecret
	}
	if *deviceName != "" {
		cfg.DeviceName = *deviceName
	}
	if *interval > 0 {
		cfg.IntervalSeconds = *interval
	}
	if cfg.IntervalSeconds <= 0 {
		cfg.IntervalSeconds = 30
	}

	if cfg.DashboardURL == "" {
		fmt.Fprintln(os.Stderr, "Error: dashboard URL is required (-url flag or config file)")
		os.Exit(1)
	}

	if err := enforceTLS(cfg.DashboardURL); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	if checkWindowsService(cfg) {
		return
	}

	runAgent(cfg)
}

// enforceTLS rejects plaintext dashboard URLs so the API key and command
// traffic are never sent in the clear. Loopback addresses are allowed for
// local development.
func enforceTLS(dashboardURL string) error {
	u, err := url.Parse(dashboardURL)
	if err != nil {
		return fmt.Errorf("invalid dashboard URL %q: %w", dashboardURL, err)
	}
	host := u.Hostname()
	loopback := host == "localhost" || host == "127.0.0.1" || host == "::1"
	if (u.Scheme == "http" || u.Scheme == "ws") && !loopback {
		return fmt.Errorf("refusing insecure dashboard URL %q: use https:// (plaintext is only allowed for localhost)", dashboardURL)
	}
	return nil
}

func runAgent(cfg *config.Config) {
	log.Printf("RMM Agent v%s | %s | %s", cfg.AgentVersion, runtime.GOOS, cfg.DashboardURL)

	// Show a tray presence icon in the active user session (Windows service runs
	// in Session 0, so this is delegated to a helper process).
	tray.StartSupervisor()

	// Poll the dashboard for newer builds and self-update (Windows service).
	selfupdate.Start(cfg.DashboardURL, cfg.AgentVersion, "RMMAgent")

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
	// Run each command in its own goroutine so a long-running one (AV scan,
	// update install, script) never blocks heartbeats — otherwise the agent
	// would appear offline for the command's whole duration. The dashboard marks
	// dispatched commands RUNNING, so they're never handed out twice.
	for _, cmd := range resp.PendingCommands {
		go runCommand(client, cmd)
	}
}

func runCommand(client *api.Client, cmd api.PendingCommand) {
	log.Printf("Running: %s", cmd.Command)
	result := executor.Run(cmd.Command)
	if err := client.ReportResult(api.CommandResultRequest{
		CommandID: cmd.ID, Output: result.Output,
		ExitCode: result.ExitCode, Success: result.Success,
	}); err != nil {
		log.Printf("Report result error: %v", err)
	}
}
