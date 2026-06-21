package backup

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestRunUploadsArchiveAndRemovesLocal(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source")
	mustWrite(t, filepath.Join(source, "a.txt"), "alpha")

	var (
		mu       sync.Mutex
		gotBody  []byte
		gotType  string
		gotPath  string
		gotMatch bool
	)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		gotMatch = r.Method == http.MethodPut
		gotType = r.Header.Get("Content-Type")
		gotPath = r.URL.Path
		gotBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	result, err := Run(Request{
		Source:      source,
		Destination: filepath.Join(root, "backups"),
		Name:        "cloud",
		Upload: &UploadSpec{
			URL:     server.URL + "/bucket/cloud.zip?X-Amz-Signature=secret",
			Headers: map[string]string{"Content-Type": "application/zip"},
		},
	})
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}

	if !result.Uploaded {
		t.Fatal("result.Uploaded = false, want true")
	}
	if !gotMatch {
		t.Fatal("upload did not use PUT")
	}
	if gotType != "application/zip" {
		t.Fatalf("Content-Type = %q, want application/zip", gotType)
	}
	if gotPath != "/bucket/cloud.zip" {
		t.Fatalf("upload path = %q", gotPath)
	}

	// The reported location must not leak the presigned signature.
	if result.Location == "" || bytes.Contains([]byte(result.Location), []byte("X-Amz-Signature")) {
		t.Fatalf("location leaked query/signature: %q", result.Location)
	}

	// Body must be the actual zip (PK header), and local copy removed.
	if len(gotBody) < 2 || gotBody[0] != 'P' || gotBody[1] != 'K' {
		t.Fatalf("uploaded body is not a zip (got %d bytes)", len(gotBody))
	}
	if _, statErr := os.Stat(result.Archive); !os.IsNotExist(statErr) {
		t.Fatalf("local archive should have been removed, stat err = %v", statErr)
	}
}

func TestRunUploadKeepLocal(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source")
	mustWrite(t, filepath.Join(source, "a.txt"), "alpha")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	result, err := Run(Request{
		Source:      source,
		Destination: filepath.Join(root, "backups"),
		Name:        "kept",
		Upload:      &UploadSpec{URL: server.URL + "/kept.zip", KeepLocal: true},
	})
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if _, statErr := os.Stat(result.Archive); statErr != nil {
		t.Fatalf("local archive should have been kept: %v", statErr)
	}
}

func TestRunUploadFailureReturnsError(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source")
	mustWrite(t, filepath.Join(source, "a.txt"), "alpha")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte("AccessDenied"))
	}))
	defer server.Close()

	_, err := Run(Request{
		Source:      source,
		Destination: filepath.Join(root, "backups"),
		Name:        "fail",
		Upload:      &UploadSpec{URL: server.URL + "/fail.zip"},
	})
	if err == nil {
		t.Fatal("expected an error when the upload is rejected")
	}
}
