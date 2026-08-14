package download

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestVerifiedAcceptsApprovedSameOriginRedirect(t *testing.T) {
	payload := []byte("redirected")
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/start" {
			http.Redirect(response, request, "/final", http.StatusTemporaryRedirect)
			return
		}
		response.Write(payload)
	}))
	defer server.Close()
	request := Request{URL: server.URL + "/start", Size: int64(len(payload)), SHA256: digest(payload), Path: filepath.Join(t.TempDir(), "cache", "payload")}
	if err := Verified(context.Background(), server.Client(), request); err != nil {
		t.Fatal(err)
	}
}

func TestVerifiedRejectsTLSFailureAndRedirectLimit(t *testing.T) {
	t.Run("certificate", func(t *testing.T) {
		server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) { response.Write([]byte("x")) }))
		defer server.Close()
		err := Verified(context.Background(), Client(), requestFor(server, t.TempDir(), []byte("x")))
		if err == nil {
			t.Fatal("Verified() trusted an unknown certificate")
		}
	})
	t.Run("redirect limit", func(t *testing.T) {
		server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			step, _ := strconv.Atoi(strings.TrimPrefix(request.URL.Path, "/"))
			http.Redirect(response, request, fmt.Sprintf("/%d", step+1), http.StatusFound)
		}))
		defer server.Close()
		request := requestFor(server, t.TempDir(), []byte("x"))
		request.URL = server.URL + "/0"
		err := Verified(context.Background(), server.Client(), request)
		if err == nil || !strings.Contains(err.Error(), "more than") {
			t.Fatalf("Verified() error = %v", err)
		}
	})
}

func TestVerifiedRejectsLengthAndHashFailures(t *testing.T) {
	tests := []struct {
		name     string
		body     string
		declared string
		size     int64
		hash     string
		want     string
	}{
		{"wrong declared length", "abc", "9", 3, digest([]byte("abc")), "declares size"},
		{"truncated", "abc", "5", 5, digest([]byte("abcde")), "unexpected EOF"},
		{"oversized", "abcde", "", 4, digest([]byte("abcd")), "declares size"},
		{"wrong hash", "abc", "", 3, strings.Repeat("0", 64), "SHA-256"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
				if test.declared != "" {
					response.Header().Set("Content-Length", test.declared)
				}
				response.Write([]byte(test.body))
			}))
			defer server.Close()
			request := Request{URL: server.URL, Size: test.size, SHA256: test.hash, Path: filepath.Join(t.TempDir(), "cache", "payload")}
			err := Verified(context.Background(), server.Client(), request)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("Verified() error = %v, want text %q", err, test.want)
			}
		})
	}
}
