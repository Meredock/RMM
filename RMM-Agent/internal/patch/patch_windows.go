//go:build windows

package patch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

const (
	wuaScanTimeout    = 10 * time.Minute
	wingetListTimeout = 5 * time.Minute
	wuaInstallTimeout = 60 * time.Minute
	wingetPkgTimeout  = 30 * time.Minute
)

func runPowerShell(script string, timeout time.Duration) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return out.String(), fmt.Errorf("timed out after %s", timeout)
	}
	return out.String(), err
}

// wingetPath resolves winget.exe. The agent runs as LocalSystem, where the
// per-user App Execution Alias is not on PATH, so fall back to the machine-wide
// WindowsApps install of the Desktop App Installer.
func wingetPath() string {
	if p, err := exec.LookPath("winget.exe"); err == nil {
		return p
	}
	matches, _ := filepath.Glob(`C:\Program Files\WindowsApps\Microsoft.DesktopAppInstaller_*_` + archTag() + `__8wekyb3d8bbwe\winget.exe`)
	if len(matches) == 0 {
		// Arch-agnostic fallback.
		matches, _ = filepath.Glob(`C:\Program Files\WindowsApps\Microsoft.DesktopAppInstaller_*__8wekyb3d8bbwe\winget.exe`)
	}
	if len(matches) > 0 {
		sort.Strings(matches) // highest version last
		return matches[len(matches)-1]
	}
	return ""
}

func archTag() string {
	if runtime.GOARCH == "arm64" {
		return "arm64"
	}
	return "x64"
}

func runWinget(timeout time.Duration, args ...string) (string, error) {
	wp := wingetPath()
	if wp == "" {
		return "", fmt.Errorf("winget not found")
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, wp, args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return out.String(), fmt.Errorf("timed out after %s", timeout)
	}
	return out.String(), err
}

const wuaScanScript = `$ErrorActionPreference='Stop';
$session = New-Object -ComObject Microsoft.Update.Session;
$searcher = $session.CreateUpdateSearcher();
$result = $searcher.Search("IsInstalled=0 and IsHidden=0");
$updates = @($result.Updates | ForEach-Object {
  [pscustomobject]@{
    updateId   = "$($_.Identity.UpdateID)";
    title      = "$($_.Title)";
    severity   = "$($_.MsrcSeverity)";
    kb         = ($_.KBArticleIDs -join ',');
    categories = @($_.Categories | ForEach-Object { "$($_.Name)" });
    sizeMB     = [math]::Round($_.MaxDownloadSize / 1MB, 1)
  }
});
$reboot = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') -or
          (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending');
ConvertTo-Json -Depth 6 -Compress ([pscustomobject]@{ rebootPending = [bool]$reboot; updates = @($updates) })`

func scan() (string, error) {
	res := ScanResult{
		Platform:  "windows",
		Supported: true,
		WUA:       []WUAUpdate{},
		Winget:    []WingetUpgrade{},
		Errors:    []string{},
	}

	wuaOK := false
	if out, err := runPowerShell(wuaScanScript, wuaScanTimeout); err != nil {
		res.Errors = append(res.Errors, "wua: "+firstLine(err.Error()+" "+out))
	} else {
		var parsed struct {
			RebootPending bool        `json:"rebootPending"`
			Updates       []WUAUpdate `json:"updates"`
		}
		if jerr := json.Unmarshal([]byte(strings.TrimSpace(out)), &parsed); jerr != nil {
			res.Errors = append(res.Errors, "wua: unparseable output: "+firstLine(out))
		} else {
			res.RebootPending = parsed.RebootPending
			res.WUA = parsed.Updates
			wuaOK = true
		}
	}

	if wingetPath() == "" {
		res.WingetAvailable = false
	} else {
		res.WingetAvailable = true
		out, err := runWinget(wingetListTimeout, "upgrade", "--include-unknown",
			"--accept-source-agreements", "--disable-interactivity")
		// winget exits non-zero when no upgrades are found; only treat it as an
		// error when the output doesn't contain a parseable table either.
		upgrades := parseWingetUpgradeTable(out)
		if err != nil && len(upgrades) == 0 && !strings.Contains(out, "No installed package") &&
			!strings.Contains(out, "No available upgrade") {
			res.Errors = append(res.Errors, "winget: "+firstLine(err.Error()+" "+out))
		}
		res.Winget = upgrades
	}

	buf, err := json.Marshal(res)
	if err != nil {
		return "", err
	}
	// A scan with no working source at all is a failure.
	if !wuaOK && len(res.Winget) == 0 && len(res.Errors) > 0 {
		return string(buf), fmt.Errorf("patch scan failed: %s", strings.Join(res.Errors, "; "))
	}
	return string(buf), nil
}

func install(req InstallRequest) (string, error) {
	res := InstallResult{Results: []InstallItemResult{}}

	// --- Windows Update installs (batched in one WUA session) ---
	ids := make([]string, 0, len(req.UpdateIDs))
	for _, id := range req.UpdateIDs {
		id = strings.TrimSpace(id)
		if wuaIDPattern.MatchString(id) {
			ids = append(ids, id)
		} else if id != "" {
			res.Results = append(res.Results, InstallItemResult{Kind: "wua", ID: id, Result: "Failed", Error: "invalid update id"})
		}
	}
	if len(ids) > 0 {
		script := buildWUAInstallScript(ids)
		out, err := runPowerShell(script, wuaInstallTimeout)
		if err != nil {
			for _, id := range ids {
				res.Results = append(res.Results, InstallItemResult{Kind: "wua", ID: id, Result: "Failed", Error: firstLine(err.Error() + " " + out)})
			}
		} else {
			var parsed struct {
				RebootRequired bool `json:"rebootRequired"`
				Results        []struct {
					UpdateID string `json:"updateId"`
					Title    string `json:"title"`
					Result   string `json:"result"`
				} `json:"results"`
			}
			if jerr := json.Unmarshal([]byte(strings.TrimSpace(out)), &parsed); jerr != nil {
				for _, id := range ids {
					res.Results = append(res.Results, InstallItemResult{Kind: "wua", ID: id, Result: "Failed", Error: "unparseable installer output: " + firstLine(out)})
				}
			} else {
				res.RebootRequired = res.RebootRequired || parsed.RebootRequired
				seen := map[string]bool{}
				for _, r := range parsed.Results {
					seen[strings.ToLower(r.UpdateID)] = true
					res.Results = append(res.Results, InstallItemResult{Kind: "wua", ID: r.UpdateID, Title: r.Title, Result: r.Result})
				}
				for _, id := range ids {
					if !seen[strings.ToLower(id)] {
						res.Results = append(res.Results, InstallItemResult{Kind: "wua", ID: id, Result: "NotFound", Error: "update no longer offered to this device"})
					}
				}
			}
		}
	}

	// --- winget installs (one process per package) ---
	for _, id := range req.WingetIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if !wingetIDPattern.MatchString(id) {
			res.Results = append(res.Results, InstallItemResult{Kind: "winget", ID: id, Result: "Failed", Error: "invalid package id"})
			continue
		}
		out, err := runWinget(wingetPkgTimeout, "upgrade", "--id", id, "--exact", "--silent",
			"--accept-source-agreements", "--accept-package-agreements", "--disable-interactivity")
		if err != nil {
			res.Results = append(res.Results, InstallItemResult{Kind: "winget", ID: id, Result: "Failed", Error: firstLine(tail(out, 400) + " " + err.Error())})
		} else {
			res.Results = append(res.Results, InstallItemResult{Kind: "winget", ID: id, Result: "Succeeded"})
		}
	}

	buf, err := json.Marshal(res)
	if err != nil {
		return "", err
	}
	for _, r := range res.Results {
		if r.Result == "Failed" || r.Result == "Aborted" {
			return string(buf), fmt.Errorf("one or more patches failed to install")
		}
	}
	return string(buf), nil
}

// buildWUAInstallScript embeds the (regex-validated) UpdateIDs into a
// PowerShell script that installs exactly that subset of pending updates.
func buildWUAInstallScript(ids []string) string {
	quoted := make([]string, len(ids))
	for i, id := range ids {
		quoted[i] = "'" + strings.ToLower(id) + "'"
	}
	return `$ErrorActionPreference='Stop';
$want = @(` + strings.Join(quoted, ",") + `);
$session = New-Object -ComObject Microsoft.Update.Session;
$result = $session.CreateUpdateSearcher().Search("IsInstalled=0 and IsHidden=0");
$toInstall = New-Object -ComObject Microsoft.Update.UpdateColl;
foreach ($u in $result.Updates) {
  if ($want -contains $u.Identity.UpdateID.ToLower()) {
    if (-not $u.EulaAccepted) { $u.AcceptEula() };
    [void]$toInstall.Add($u)
  }
}
if ($toInstall.Count -eq 0) {
  ConvertTo-Json -Compress ([pscustomobject]@{ rebootRequired = $false; results = @() }); exit 0
}
$dl = $session.CreateUpdateDownloader(); $dl.Updates = $toInstall; [void]$dl.Download();
$inst = $session.CreateUpdateInstaller(); $inst.Updates = $toInstall;
$res = $inst.Install();
$map = @{2='Succeeded';3='SucceededWithErrors';4='Failed';5='Aborted'};
$items = @();
for ($i=0; $i -lt $toInstall.Count; $i++) {
  $code = [int]$res.GetUpdateResult($i).ResultCode;
  $items += [pscustomobject]@{
    updateId = "$($toInstall.Item($i).Identity.UpdateID)";
    title    = "$($toInstall.Item($i).Title)";
    result   = $(if ($map.ContainsKey($code)) { $map[$code] } else { "Failed" })
  }
}
ConvertTo-Json -Depth 5 -Compress ([pscustomobject]@{ rebootRequired = [bool]$res.RebootRequired; results = @($items) })`
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexAny(s, "\r\n"); i >= 0 {
		s = s[:i]
	}
	if len(s) > 300 {
		s = s[:300]
	}
	return s
}

func tail(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[len(s)-n:]
}
