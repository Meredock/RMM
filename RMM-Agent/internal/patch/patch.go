// Package patch implements structured patch management: scanning for missing
// OS updates (Windows Update) and outdated third-party applications (winget),
// and installing an approved subset of them. Results are returned as JSON for
// the dashboard's patch intake to ingest.
package patch

import (
	"encoding/json"
	"regexp"
	"strings"
)

// WUAUpdate is one pending update reported by the Windows Update Agent.
type WUAUpdate struct {
	UpdateID   string   `json:"updateId"`
	Title      string   `json:"title"`
	Severity   string   `json:"severity"`
	KB         string   `json:"kb"`
	Categories []string `json:"categories"`
	SizeMB     float64  `json:"sizeMB"`
}

// WingetUpgrade is one outdated package reported by `winget upgrade`.
type WingetUpgrade struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Current   string `json:"current"`
	Available string `json:"available"`
	Source    string `json:"source"`
}

// ScanResult is the JSON payload produced by Scan.
type ScanResult struct {
	Platform        string          `json:"platform"`
	Supported       bool            `json:"supported"`
	RebootPending   bool            `json:"rebootPending"`
	WUA             []WUAUpdate     `json:"wua"`
	WingetAvailable bool            `json:"wingetAvailable"`
	Winget          []WingetUpgrade `json:"winget"`
	Errors          []string        `json:"errors"`
}

// InstallRequest is the payload of a "patchinstall <json>" command.
type InstallRequest struct {
	UpdateIDs []string `json:"updateIds"` // WUA Identity.UpdateID values
	WingetIDs []string `json:"wingetIds"` // winget package identifiers
}

// InstallItemResult is the outcome for a single requested patch.
type InstallItemResult struct {
	Kind   string `json:"kind"` // "wua" | "winget"
	ID     string `json:"id"`
	Title  string `json:"title,omitempty"`
	Result string `json:"result"` // Succeeded | SucceededWithErrors | Failed | Aborted | NotFound
	Error  string `json:"error,omitempty"`
}

// InstallResult is the JSON payload produced by Install.
type InstallResult struct {
	Results        []InstallItemResult `json:"results"`
	RebootRequired bool                `json:"rebootRequired"`
}

// Scan reports missing OS updates and outdated winget packages as JSON.
func Scan() (string, error) { return scan() }

// Install installs the subset of patches named in the JSON payload and
// returns a JSON summary. The payload is an InstallRequest.
func Install(payload string) (string, error) {
	var req InstallRequest
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", err
	}
	return install(req)
}

var (
	// WUA UpdateIDs are GUIDs (sometimes with a ".<revision>" suffix).
	wuaIDPattern = regexp.MustCompile(`^[0-9a-fA-F-]{36}(\.[0-9]+)?$`)
	// winget package IDs: Publisher.Name style with a conservative charset.
	wingetIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$`)
)

// parseWingetUpgradeTable parses the fixed-width table printed by
// `winget upgrade`. winget has no stable machine-readable output for upgrade
// listings, so column offsets are derived from each header row. Multiple table
// sections (e.g. "require explicit targeting") are all parsed.
func parseWingetUpgradeTable(raw string) []WingetUpgrade {
	out := []WingetUpgrade{}
	lines := strings.Split(strings.ReplaceAll(raw, "\r", ""), "\n")

	type cols struct{ name, id, version, available, source int }
	var c *cols
	expectSep := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if c == nil || !expectSep {
			// Look for a header row: "Name ... Id ... Version ... Available ..."
			ni := strings.Index(line, "Name")
			ii := strings.Index(line, "Id")
			vi := strings.Index(line, "Version")
			ai := strings.Index(line, "Available")
			if ni >= 0 && ii > ni && vi > ii && ai > vi {
				si := strings.Index(line, "Source")
				c = &cols{name: ni, id: ii, version: vi, available: ai, source: si}
				expectSep = true
				continue
			}
		}
		if c != nil && expectSep {
			if strings.HasPrefix(trimmed, "---") {
				expectSep = false // next lines are rows
				continue
			}
			// Header not followed by separator: not a real table.
			c, expectSep = nil, false
			continue
		}
		if c == nil {
			continue
		}
		if trimmed == "" {
			c = nil // section ended; a later section may re-declare headers
			continue
		}
		// Trailer lines like "3 upgrades available." end the section too.
		if !strings.Contains(line, "  ") && len(trimmed) < 60 && !strings.Contains(trimmed, ".") {
			continue
		}
		runes := []rune(line)
		slice := func(from, to int) string {
			if from < 0 || from >= len(runes) {
				return ""
			}
			if to < 0 || to > len(runes) {
				to = len(runes)
			}
			return strings.TrimSpace(string(runes[from:to]))
		}
		srcEnd := -1
		u := WingetUpgrade{
			Name:      slice(c.name, c.id),
			ID:        slice(c.id, c.version),
			Current:   slice(c.version, c.available),
			Available: slice(c.available, ifPos(c.source, srcEnd)),
		}
		if c.source >= 0 {
			u.Source = slice(c.source, -1)
		}
		// Reject rows that clearly aren't data (progress art, trailers).
		if u.ID == "" || strings.ContainsAny(u.ID, " \\/") || !wingetIDPattern.MatchString(u.ID) {
			continue
		}
		out = append(out, u)
	}
	return out
}

func ifPos(v, fallback int) int {
	if v >= 0 {
		return v
	}
	return fallback
}
