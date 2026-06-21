package backup

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// UploadSpec tells the agent to push the finished archive to an object store
// after zipping. The dashboard fills URL with a short-lived presigned PUT URL,
// so no cloud credentials ever live on the agent. An empty spec means the
// archive stays local (the default, backward-compatible behaviour).
type UploadSpec struct {
	URL       string            `json:"url"`
	Method    string            `json:"method,omitempty"`    // defaults to PUT
	Headers   map[string]string `json:"headers,omitempty"`   // e.g. Content-Type the URL was signed with
	KeepLocal bool              `json:"keepLocal,omitempty"` // keep the local .zip after a successful upload
}

// uploadHTTPClient allows large archives to upload without the agent's normal
// short request timeout.
var uploadHTTPClient = &http.Client{Timeout: 30 * time.Minute}

func uploadArchive(path string, spec *UploadSpec) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("stat archive for upload: %w", err)
	}

	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open archive for upload: %w", err)
	}
	defer file.Close()

	method := strings.ToUpper(strings.TrimSpace(spec.Method))
	if method == "" {
		method = http.MethodPut
	}

	req, err := http.NewRequest(method, spec.URL, file)
	if err != nil {
		return fmt.Errorf("build upload request: %w", err)
	}
	// Object stores require an accurate length for a streamed PUT.
	req.ContentLength = info.Size()
	for key, value := range spec.Headers {
		req.Header.Set(key, value)
	}

	resp, err := uploadHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("upload archive: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("upload archive: status %d: %s", resp.StatusCode, strings.TrimSpace(string(snippet)))
	}
	return nil
}

// sanitizeURL strips the query string (which carries the presigned signature)
// so the stored/reported location never leaks credentials.
func sanitizeURL(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String()
}
