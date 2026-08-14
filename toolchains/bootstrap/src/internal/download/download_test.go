package download

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func digest(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func requestFor(server *httptest.Server, root string, data []byte) Request {
	return Request{URL: server.URL, Size: int64(len(data)), SHA256: digest(data), Path: filepath.Join(root, "cache", "artifact.tar.gz")}
}

func TestVerifiedDownloadsExactHTTPSBytesAndReusesThem(t *testing.T) {
	payload := []byte("verified payload")
	calls := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		calls++
		response.Write(payload)
	}))
	defer server.Close()
	request := requestFor(server, t.TempDir(), payload)
	if err := Verified(context.Background(), server.Client(), request); err != nil {
		t.Fatal(err)
	}
	if err := Verified(context.Background(), server.Client(), request); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatalf("download calls = %d, want 1", calls)
	}
}

func TestVerifiedRejectsUnapprovedRedirect(t *testing.T) {
	destination := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("unapproved redirect destination was contacted")
	}))
	defer destination.Close()
	source := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		http.Redirect(response, request, destination.URL, http.StatusFound)
	}))
	defer source.Close()
	request := requestFor(source, t.TempDir(), []byte("x"))
	err := Verified(context.Background(), source.Client(), request)
	if err == nil || !strings.Contains(err.Error(), "not approved") {
		t.Fatalf("Verified() error = %v", err)
	}
}

func TestVerifiedRejectsContentEncoding(t *testing.T) {
	payload := []byte("not encoded")
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("Content-Encoding", "gzip")
		response.Header().Set("Content-Length", "11")
		response.Write(payload)
	}))
	defer server.Close()
	err := Verified(context.Background(), server.Client(), requestFor(server, t.TempDir(), payload))
	if err == nil || !strings.Contains(err.Error(), "content encoding") {
		t.Fatalf("Verified() error = %v", err)
	}
}

func TestVerifiedFailurePreservesExistingCacheFile(t *testing.T) {
	root := t.TempDir()
	cache := filepath.Join(root, "cache")
	if err := os.Mkdir(cache, 0o700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(cache, "artifact.tar.gz")
	if err := os.WriteFile(path, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Write([]byte("tampered"))
	}))
	defer server.Close()
	request := Request{URL: server.URL, Size: 8, SHA256: strings.Repeat("0", 64), Path: path}
	if err := Verified(context.Background(), server.Client(), request); err == nil {
		t.Fatal("Verified() accepted a bad checksum")
	}
	actual, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(actual) != "old" {
		t.Fatalf("existing cache changed to %q", actual)
	}
}
