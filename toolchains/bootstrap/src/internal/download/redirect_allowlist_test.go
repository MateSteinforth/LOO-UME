package download

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestVerifiedAcceptsDeclaredCrossOriginRedirect(t *testing.T) {
	payload := []byte("approved redirect")
	destination := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Write(payload)
	}))
	defer destination.Close()
	source := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		http.Redirect(response, request, destination.URL, http.StatusTemporaryRedirect)
	}))
	defer source.Close()

	roots := x509.NewCertPool()
	roots.AddCert(source.Certificate())
	roots.AddCert(destination.Certificate())
	client := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{
		MinVersion: tls.VersionTLS12,
		RootCAs:    roots,
	}}}
	request := Request{
		URL: source.URL, Size: int64(len(payload)), SHA256: digest(payload),
		Path:                   filepath.Join(t.TempDir(), "cache", "payload"),
		AllowedRedirectOrigins: []string{destination.URL},
	}
	if err := Verified(context.Background(), client, request); err != nil {
		t.Fatal(err)
	}
}
