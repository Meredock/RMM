//go:build !windows

package desktop

import (
	"encoding/base64"
	"os/exec"
	"runtime"
)

// setDPIAware is a no-op off Windows; X11/Quartz capture reports real pixels.
func setDPIAware() {}

// bindCaptureThread is a no-op off Windows; there is no desktop/winstation
// isolation to bridge.
func bindCaptureThread() {}

// newCapturer off Windows just wraps the per-frame screenshot helper.
func newCapturer() screenCapturer { return shellCapturer{} }

type shellCapturer struct{}

func (shellCapturer) frame() (string, int, int, error) { return captureScreen() }
func (shellCapturer) close()                           {}

func captureScreen() (string, int, int, error) {
	switch runtime.GOOS {
	case "darwin":
		data, w, h, err := captureMac()
		if err != nil {
			return "", 0, 0, err
		}
		return base64.StdEncoding.EncodeToString(data), w, h, nil
	default:
		data, w, h, err := captureLinux()
		if err != nil {
			return "", 0, 0, err
		}
		return base64.StdEncoding.EncodeToString(data), w, h, nil
	}
}

func captureMac() ([]byte, int, int, error) {
	tmp := "/tmp/.rmm_screen.jpg"
	if err := exec.Command("screencapture", "-x", "-t", "jpg", "-q", tmp).Run(); err != nil {
		return nil, 0, 0, err
	}
	out, err := exec.Command("sh", "-c",
		`python3 -c "import base64,sys; d=open('`+tmp+`','rb').read(); w,h=0,0; print(str(w)+'x'+str(h)); print(base64.b64encode(d).decode())"`,
	).Output()
	if err != nil {
		out, err = exec.Command("sh", "-c",
			`SIZE=$(identify -format "%wx%h" `+tmp+` 2>/dev/null || echo "1920x1080"); echo $SIZE; base64 `+tmp,
		).Output()
		if err != nil {
			return nil, 0, 0, err
		}
	}
	return parseCapture(out)
}

func captureLinux() ([]byte, int, int, error) {
	tmp := "/tmp/.rmm_screen.jpg"
	if err := exec.Command("scrot", "-q", "40", tmp).Run(); err != nil {
		if err2 := exec.Command("import", "-window", "root", "-quality", "40", tmp).Run(); err2 != nil {
			return nil, 0, 0, err2
		}
	}
	out, err := exec.Command("sh", "-c",
		`SIZE=$(identify -format "%wx%h" `+tmp+` 2>/dev/null || echo "1920x1080"); echo $SIZE; base64 `+tmp,
	).Output()
	if err != nil {
		return nil, 0, 0, err
	}
	return parseCapture(out)
}

// parseCapture parses "WxH\n<base64>" output from shell capture commands.
func parseCapture(out []byte) ([]byte, int, int, error) {
	lines := splitLines(out)
	if len(lines) < 2 {
		data, err := base64.StdEncoding.DecodeString(string(out))
		return data, 1920, 1080, err
	}
	var w, h int
	if parts := splitX(lines[0]); len(parts) == 2 {
		parseInt(&w, parts[0])
		parseInt(&h, parts[1])
	}
	if w == 0 {
		w = 1920
	}
	if h == 0 {
		h = 1080
	}
	data, err := base64.StdEncoding.DecodeString(lines[1])
	return data, w, h, err
}

func parseInt(dst *int, s string) {
	var n int
	for _, c := range s {
		if c >= '0' && c <= '9' {
			n = n*10 + int(c-'0')
		}
	}
	*dst = n
}

func splitLines(b []byte) []string {
	var lines []string
	start := 0
	for i, c := range b {
		if c == '\n' {
			line := string(b[start:i])
			if len(line) > 0 && line[len(line)-1] == '\r' {
				line = line[:len(line)-1]
			}
			lines = append(lines, line)
			start = i + 1
		}
	}
	if start < len(b) {
		lines = append(lines, string(b[start:]))
	}
	return lines
}

func splitX(s string) []string {
	for i, c := range s {
		if c == 'x' || c == 'X' {
			return []string{s[:i], s[i+1:]}
		}
	}
	return []string{s}
}
