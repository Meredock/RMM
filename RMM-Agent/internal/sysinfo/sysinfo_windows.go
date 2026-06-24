//go:build windows

package sysinfo

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"time"
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

func inventory() (string, error) {
	script := `$keys = @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
);
$items = Get-ItemProperty $keys -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName } |
  Select-Object @{n='name';e={$_.DisplayName}}, @{n='version';e={$_.DisplayVersion}}, @{n='publisher';e={$_.Publisher}} |
  Sort-Object name -Unique;
ConvertTo-Json -Compress @($items)`
	return runPowerShell(script, 3*time.Minute)
}

func windowsUpdates() (string, error) {
	script := `$session = New-Object -ComObject Microsoft.Update.Session;
$searcher = $session.CreateUpdateSearcher();
$result = $searcher.Search("IsInstalled=0 and IsHidden=0");
$updates = @($result.Updates | ForEach-Object {
  [pscustomobject]@{ title = $_.Title; severity = $_.MsrcSeverity; kb = ($_.KBArticleIDs -join ',') }
});
ConvertTo-Json -Depth 4 -Compress ([pscustomobject]@{ count = $updates.Count; updates = $updates })`
	return runPowerShell(script, 10*time.Minute)
}
