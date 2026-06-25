package executor

import (
	"encoding/base64"
	"testing"
)

func TestAvscanArg(t *testing.T) {
	cases := map[string]struct {
		wantArg string
		wantOK  bool
	}{
		"avscan":         {"", true},
		"avscan quick":   {"quick", true},
		"avscan full":    {"full", true},
		"  avscan full ": {"full", true},
		"backup x":       {"", false},
		"avscanx":        {"", false},
	}
	for in, want := range cases {
		gotArg, gotOK := avscanArg(in)
		if gotArg != want.wantArg || gotOK != want.wantOK {
			t.Errorf("avscanArg(%q) = (%q,%v), want (%q,%v)", in, gotArg, gotOK, want.wantArg, want.wantOK)
		}
	}
}

func TestHttpcheckPayload(t *testing.T) {
	if p, ok := httpcheckPayload(`httpcheck {"url":"x"}`); !ok || p != `{"url":"x"}` {
		t.Errorf("got (%q,%v)", p, ok)
	}
	if _, ok := httpcheckPayload("httpcheck "); ok {
		t.Error("empty payload should not be ok")
	}
	if _, ok := httpcheckPayload("inventory"); ok {
		t.Error("non-httpcheck should not match")
	}
}

func TestBackupPayload(t *testing.T) {
	for _, prefix := range []string{"backup ", "rmm-backup ", "rmm:backup "} {
		if p, ok := backupPayload(prefix + `{"a":1}`); !ok || p != `{"a":1}` {
			t.Errorf("prefix %q: got (%q,%v)", prefix, p, ok)
		}
	}
	if _, ok := backupPayload("notbackup"); ok {
		t.Error("non-backup should not match")
	}
}

func TestRunscriptArgs(t *testing.T) {
	content := "Write-Host hi"
	enc := base64.StdEncoding.EncodeToString([]byte(content))
	shell, got, ok := runscriptArgs("runscript powershell " + enc)
	if !ok || shell != "powershell" || got != content {
		t.Errorf("got (%q,%q,%v)", shell, got, ok)
	}
	if _, _, ok := runscriptArgs("runscript powershell"); ok {
		t.Error("missing content should not match")
	}
	if _, _, ok := runscriptArgs("runscript powershell !!notbase64!!"); ok {
		t.Error("invalid base64 should not match")
	}
}
