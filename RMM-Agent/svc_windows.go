//go:build windows

package main

import (
	"log"

	"github.com/meredock/rmm-agent/internal/config"
	"golang.org/x/sys/windows/svc"
)

type windowsService struct {
	cfg *config.Config
}

func (s *windowsService) Execute(_ []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (bool, uint32) {
	changes <- svc.Status{State: svc.StartPending}
	go runAgent(s.cfg)
	changes <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}
	for c := range r {
		switch c.Cmd {
		case svc.Stop, svc.Shutdown:
			changes <- svc.Status{State: svc.StopPending}
			return false, 0
		}
	}
	return false, 0
}

func checkWindowsService(cfg *config.Config) bool {
	isService, err := svc.IsWindowsService()
	if err != nil || !isService {
		return false
	}
	log.Println("Running as Windows service")
	if err := svc.Run("RMMAgent", &windowsService{cfg: cfg}); err != nil {
		log.Printf("Service run error: %v", err)
	}
	return true
}
