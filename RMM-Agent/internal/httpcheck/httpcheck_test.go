package httpcheck

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func runJSON(t *testing.T, payload string) result {
	t.Helper()
	out, err := Run(payload)
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	var r result
	if err := json.Unmarshal([]byte(out), &r); err != nil {
		t.Fatalf("bad result json %q: %v", out, err)
	}
	return r
}

func TestHTTPCheckOK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(200)
	}))
	defer srv.Close()

	r := runJSON(t, `{"url":"`+srv.URL+`","timeoutMs":2000}`)
	if !r.OK || r.Status != 200 {
		t.Errorf("expected ok 200, got %+v", r)
	}
}

func TestHTTPCheckExpectedStatusMismatch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(500)
	}))
	defer srv.Close()

	r := runJSON(t, `{"url":"`+srv.URL+`","expectedStatus":200,"timeoutMs":2000}`)
	if r.OK || r.Status != 500 || r.Error == "" {
		t.Errorf("expected not-ok 500 with error, got %+v", r)
	}
}

func TestHTTPCheckUnreachable(t *testing.T) {
	r := runJSON(t, `{"url":"http://127.0.0.1:1","timeoutMs":500}`)
	if r.OK || r.Error == "" {
		t.Errorf("expected failure for unreachable host, got %+v", r)
	}
}

func TestHTTPCheckBadPayload(t *testing.T) {
	if _, err := Run("{not json"); err == nil {
		t.Error("expected error for malformed payload")
	}
	if _, err := Run(`{"url":""}`); err == nil {
		t.Error("expected error for missing url")
	}
}
