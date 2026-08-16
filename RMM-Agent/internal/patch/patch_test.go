package patch

import "testing"

const sampleWingetOutput = "" +
	"   \\\r\n" + // progress art winget sometimes emits
	"Name                              Id                          Version        Available      Source\r\n" +
	"-----------------------------------------------------------------------------------------------------\r\n" +
	"Mozilla Firefox (x64 en-US)       Mozilla.Firefox             128.0.3        129.0          winget\r\n" +
	"7-Zip 23.01 (x64)                 7zip.7zip                   23.01          24.08          winget\r\n" +
	"Google Chrome                     Google.Chrome               126.0.6478.62  127.0.6533.73  winget\r\n" +
	"3 upgrades available.\r\n" +
	"\r\n" +
	"The following packages have an upgrade available, but require explicit targeting for upgrade:\r\n" +
	"Name                              Id                          Version        Available      Source\r\n" +
	"-----------------------------------------------------------------------------------------------------\r\n" +
	"Microsoft Teams                   Microsoft.Teams             24193.1805.30  24243.1309.30  winget\r\n"

func TestParseWingetUpgradeTable(t *testing.T) {
	got := parseWingetUpgradeTable(sampleWingetOutput)
	if len(got) != 4 {
		t.Fatalf("expected 4 upgrades, got %d: %+v", len(got), got)
	}
	if got[0].ID != "Mozilla.Firefox" || got[0].Available != "129.0" || got[0].Current != "128.0.3" {
		t.Errorf("firefox row parsed wrong: %+v", got[0])
	}
	if got[1].ID != "7zip.7zip" {
		t.Errorf("7zip row parsed wrong: %+v", got[1])
	}
	if got[3].ID != "Microsoft.Teams" {
		t.Errorf("explicit-targeting section not parsed: %+v", got[3])
	}
	for _, u := range got {
		if u.Source != "winget" {
			t.Errorf("source parsed wrong: %+v", u)
		}
	}
}

func TestParseWingetUpgradeTableEmpty(t *testing.T) {
	if got := parseWingetUpgradeTable("No installed package found matching input criteria.\n"); len(got) != 0 {
		t.Fatalf("expected 0 upgrades, got %+v", got)
	}
	if got := parseWingetUpgradeTable(""); len(got) != 0 {
		t.Fatalf("expected 0 upgrades on empty input, got %+v", got)
	}
}

func TestInstallRejectsBadPayload(t *testing.T) {
	if _, err := Install("not json"); err == nil {
		t.Fatal("expected error for invalid JSON payload")
	}
}

func TestIDPatterns(t *testing.T) {
	if !wuaIDPattern.MatchString("12345678-90ab-cdef-1234-567890abcdef") {
		t.Error("valid GUID rejected")
	}
	if !wuaIDPattern.MatchString("12345678-90ab-cdef-1234-567890abcdef.200") {
		t.Error("valid GUID with revision rejected")
	}
	if wuaIDPattern.MatchString("'; Remove-Item -Recurse C:\\ #") {
		t.Error("injection string accepted as WUA id")
	}
	if !wingetIDPattern.MatchString("Mozilla.Firefox") || !wingetIDPattern.MatchString("7zip.7zip") {
		t.Error("valid winget id rejected")
	}
	if wingetIDPattern.MatchString("evil id; rm -rf /") {
		t.Error("injection string accepted as winget id")
	}
}
