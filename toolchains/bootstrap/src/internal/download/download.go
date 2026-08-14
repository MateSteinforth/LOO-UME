package download

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"time"
)

const (
	MaximumRedirects = 5
	RequestTimeout   = 60 * time.Second
)

type Request struct {
	URL                    string
	Size                   int64
	SHA256                 string
	Path                   string
	AllowedRedirectOrigins []string
}

func Client() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	return &http.Client{
		Transport: transport,
		Timeout:   RequestTimeout,
	}
}

func Verified(ctx context.Context, client *http.Client, request Request) error {
	parsed, err := url.Parse(request.URL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return fmt.Errorf("download URL is not valid HTTPS")
	}
	if request.Size <= 0 {
		return fmt.Errorf("download size is invalid")
	}
	allowedOrigins := map[string]struct{}{origin(parsed): {}}
	for _, value := range request.AllowedRedirectOrigins {
		allowed, parseErr := url.Parse(value)
		if parseErr != nil || allowed.Scheme != "https" || allowed.Host == "" {
			return fmt.Errorf("allowed redirect origin %q is invalid", value)
		}
		allowedOrigins[origin(allowed)] = struct{}{}
	}
	downloadClient := *client
	downloadClient.CheckRedirect = func(redirect *http.Request, via []*http.Request) error {
		if len(via) >= MaximumRedirects {
			return fmt.Errorf("download has more than %d redirects", MaximumRedirects)
		}
		if redirect.URL.Scheme != "https" {
			return fmt.Errorf("download redirect is not HTTPS")
		}
		if _, approved := allowedOrigins[origin(redirect.URL)]; !approved {
			return fmt.Errorf("download redirect origin %q is not approved", origin(redirect.URL))
		}
		return nil
	}
	if existing, err := verifyFile(request.Path, request.Size, request.SHA256); err == nil && existing {
		return nil
	}
	if err := ensurePrivateDirectory(filepath.Dir(request.Path)); err != nil {
		return fmt.Errorf("prepare download cache: %w", err)
	}
	temporary, err := os.CreateTemp(filepath.Dir(request.Path), ".download-*")
	if err != nil {
		return fmt.Errorf("create download staging file: %w", err)
	}
	temporaryPath := temporary.Name()
	cleanup := func() {
		temporary.Close()
		os.Remove(temporaryPath)
	}
	defer cleanup()
	if err := temporary.Chmod(0o600); err != nil {
		return fmt.Errorf("protect download staging file: %w", err)
	}
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodGet, request.URL, nil)
	if err != nil {
		return fmt.Errorf("create download request: %w", err)
	}
	httpRequest.Header.Set("Accept-Encoding", "identity")
	response, err := downloadClient.Do(httpRequest)
	if err != nil {
		return fmt.Errorf("download %s: %w", request.URL, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("download %s returned HTTP %d", request.URL, response.StatusCode)
	}
	if response.ContentLength >= 0 && response.ContentLength != request.Size {
		return fmt.Errorf("download %s declares size %d, expected %d", request.URL, response.ContentLength, request.Size)
	}
	if response.Header.Get("Content-Encoding") != "" {
		return fmt.Errorf("download %s uses an undeclared content encoding", request.URL)
	}
	hash := sha256.New()
	written, err := io.Copy(io.MultiWriter(temporary, hash), io.LimitReader(response.Body, request.Size+1))
	if err != nil {
		return fmt.Errorf("write download %s: %w", request.URL, err)
	}
	if written != request.Size {
		return fmt.Errorf("download %s has size %d, expected %d", request.URL, written, request.Size)
	}
	actualHash := hex.EncodeToString(hash.Sum(nil))
	if actualHash != request.SHA256 {
		return fmt.Errorf("download %s has SHA-256 %s, expected %s", request.URL, actualHash, request.SHA256)
	}
	if err := temporary.Sync(); err != nil {
		return fmt.Errorf("sync download staging file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close download staging file: %w", err)
	}
	if err := os.Rename(temporaryPath, request.Path); err != nil {
		return fmt.Errorf("publish verified download: %w", err)
	}
	if err := syncDirectory(filepath.Dir(request.Path)); err != nil {
		return err
	}
	return nil
}

func verifyFile(path string, expectedSize int64, expectedHash string) (bool, error) {
	file, err := os.Open(path)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() != expectedSize {
		return false, err
	}
	hash := sha256.New()
	written, err := io.Copy(hash, io.LimitReader(file, expectedSize+1))
	if err != nil || written != expectedSize {
		return false, err
	}
	return hex.EncodeToString(hash.Sum(nil)) == expectedHash, nil
}

func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open parent directory for sync: %w", err)
	}
	defer directory.Close()
	if err := directory.Sync(); err != nil {
		return fmt.Errorf("sync parent directory: %w", err)
	}
	return nil
}
