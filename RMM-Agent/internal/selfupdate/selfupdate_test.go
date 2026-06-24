package selfupdate

import "testing"

func TestIsNewer(t *testing.T) {
	cases := []struct {
		current, candidate string
		want               bool
	}{
		{"1.0.0", "1.0.1", true},
		{"1.0.0", "1.1.0", true},
		{"1.0.0", "2.0.0", true},
		{"1.2.3", "1.2.3", false},
		{"1.2.3", "1.2.2", false},
		{"2.0.0", "1.9.9", false},
		{"1.0.0", "v1.0.1", true}, // tolerate a leading v
		{"1.1.0", "1.10.0", true},
	}
	for _, c := range cases {
		if got := isNewer(c.current, c.candidate); got != c.want {
			t.Errorf("isNewer(%q,%q) = %v, want %v", c.current, c.candidate, got, c.want)
		}
	}
}

func TestParseVer(t *testing.T) {
	got := parseVer("v1.2.3")
	if got != [3]int{1, 2, 3} {
		t.Errorf("parseVer = %v", got)
	}
	if parseVer("1.1") != [3]int{1, 1, 0} {
		t.Error("short version should zero-fill")
	}
}
