package metrics

import (
	"os"
	"runtime"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
)

type Snapshot struct {
	CPUPercent   float64 `json:"cpu_percent"`
	RAMPercent   float64 `json:"ram_percent"`
	RAMUsedMB    float64 `json:"ram_used_mb"`
	RAMTotalMB   float64 `json:"ram_total_mb"`
	DiskPercent  float64 `json:"disk_percent"`
	DiskUsedGB   float64 `json:"disk_used_gb"`
	DiskTotalGB  float64 `json:"disk_total_gb"`
	IPAddress    string  `json:"ip_address,omitempty"`
	OSVersion    string  `json:"os_version,omitempty"`
	AgentVersion string  `json:"agent_version,omitempty"`
}

func Collect(agentVersion string) (*Snapshot, error) {
	s := &Snapshot{AgentVersion: agentVersion}

	// CPU (1 second sample)
	percents, err := cpu.Percent(0, false)
	if err == nil && len(percents) > 0 {
		s.CPUPercent = percents[0]
	}

	// RAM
	vm, err := mem.VirtualMemory()
	if err == nil {
		s.RAMPercent = vm.UsedPercent
		s.RAMUsedMB = float64(vm.Used) / 1024 / 1024
		s.RAMTotalMB = float64(vm.Total) / 1024 / 1024
	}

	// Disk (root partition)
	diskPath := "/"
	if runtime.GOOS == "windows" {
		diskPath = "C:\\"
	}
	du, err := disk.Usage(diskPath)
	if err == nil {
		s.DiskPercent = du.UsedPercent
		s.DiskUsedGB = float64(du.Used) / 1024 / 1024 / 1024
		s.DiskTotalGB = float64(du.Total) / 1024 / 1024 / 1024
	}

	s.OSVersion = runtime.GOOS + "/" + runtime.GOARCH

	// Best-effort IP
	if hostname, err := os.Hostname(); err == nil {
		s.IPAddress = hostname
	}

	return s, nil
}
