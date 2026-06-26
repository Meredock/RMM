// Package selfupdate lets the agent pull a newer build from the dashboard and
// replace itself. The dashboard advertises the latest version + per-OS download
// URLs at /api/agent/version.
package selfupdate

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type versionResponse struct {
	Version   string `json:"version"`
	Downloads struct {
		Windows string `json:"windows"`
		Linux   string `json:"linux"`
		Darwin  string `json:"darwin"`
	} `json:"downloads"`
}

var (
	cfgURL     string
	cfgVersion string
	cfgService string
)

// Start runs a background loop that periodically checks for and applies updates.
// serviceName is the OS service to restart after swapping the binary.
func Start(dashboardURL, currentVersion, serviceName string) {
	cfgURL, cfgVersion, cfgService = dashboardURL, currentVersion, serviceName
	go func() {
		time.Sleep(2 * time.Minute) // don't disrupt startup
		for {
			if err := checkAndApply(dashboardURL, currentVersion, serviceName); err != nil {
				log.Printf("[update] %v", err)
			}
			time.Sleep(6 * time.Hour)
		}
	}()
}

// CheckNow runs a single update check on demand (e.g. from a dashboard command),
// using the config captured by Start.
func CheckNow() error {
	if cfgURL == "" {
		return nil
	}
	return checkAndApply(cfgURL, cfgVersion, cfgService)
}

func checkAndApply(dashboardURL, currentVersion, serviceName string) error {
	resp, err := http.Get(strings.TrimRight(dashboardURL, "/") + "/api/agent/version")
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var vr versionResponse
	if err := json.NewDecoder(resp.Body).Decode(&vr); err != nil {
		return err
	}
	if vr.Version == "" || !isNewer(currentVersion, vr.Version) {
		return nil
	}
	url := platformURL(vr)
	if url == "" {
		return fmt.Errorf("version %s available but no download URL for %s", vr.Version, runtime.GOOS)
	}

	log.Printf("[update] new version %s available (have %s); downloading", vr.Version, currentVersion)
	newPath, err := download(url)
	if err != nil {
		return fmt.Errorf("download: %w", err)
	}
	log.Printf("[update] launching updater to install %s", vr.Version)
	return launchUpdater(newPath, serviceName)
}

func platformURL(vr versionResponse) string {
	switch runtime.GOOS {
	case "windows":
		return vr.Downloads.Windows
	case "linux":
		return vr.Downloads.Linux
	case "darwin":
		return vr.Downloads.Darwin
	}
	return ""
}

func download(url string) (string, error) {
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	tmp := filepath.Join(filepath.Dir(selfPath()), "rmm-agent.update")
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		return "", err
	}
	if err := f.Close(); err != nil {
		return "", err
	}
	return tmp, nil
}

func selfPath() string {
	e, _ := os.Executable()
	return e
}

// isNewer reports whether candidate > current using dotted numeric comparison.
func isNewer(current, candidate string) bool {
	c, n := parseVer(current), parseVer(candidate)
	for i := 0; i < 3; i++ {
		if n[i] != c[i] {
			return n[i] > c[i]
		}
	}
	return false
}

func parseVer(v string) [3]int {
	var out [3]int
	parts := strings.SplitN(strings.TrimPrefix(strings.TrimSpace(v), "v"), ".", 3)
	for i := 0; i < len(parts) && i < 3; i++ {
		digits := strings.TrimFunc(parts[i], func(r rune) bool { return r < '0' || r > '9' })
		out[i], _ = strconv.Atoi(digits)
	}
	return out
}

func copyFile(from, to string) error {
	src, err := os.Open(from)
	if err != nil {
		return err
	}
	defer src.Close()
	dst, err := os.OpenFile(to, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		return err
	}
	return dst.Close()
}
