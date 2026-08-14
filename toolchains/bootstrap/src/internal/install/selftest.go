package install

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/archive"
	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/download"
	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/manifest"
)

func SelfTest(ctx context.Context, targetID, root string) error {
	resolvedRoot, err := validateRepositoryRoot(root)
	if err != nil {
		return err
	}
	workspace, err := os.MkdirTemp(resolvedRoot, ".bootstrap-self-test-")
	if err != nil {
		return fmt.Errorf("create contained self-test directory: %w", err)
	}
	if err := os.Chmod(workspace, 0o700); err != nil {
		_ = os.RemoveAll(workspace)
		return err
	}
	defer os.RemoveAll(workspace)

	testRoot := filepath.Join(workspace, "repository")
	if err := os.MkdirAll(filepath.Join(testRoot, ".git"), 0o700); err != nil {
		return err
	}
	archiveBytes, err := selfTestArchive()
	if err != nil {
		return err
	}
	archiveHashBytes := sha256.Sum256(archiveBytes)
	archiveHash := hex.EncodeToString(archiveHashBytes[:])
	archivePath := filepath.Join(workspace, "fixture.tar.gz")
	if err := os.WriteFile(archivePath, archiveBytes, 0o600); err != nil {
		return err
	}
	policy := manifest.Extraction{
		Kind: "tar.gz", RootDirectory: "fixture", MaximumEntries: 8,
		MaximumBytes: 4096, MaximumEntrySize: 1024, MaximumCompressionRatio: 100,
	}
	expected := filepath.Join(workspace, "expected")
	if err := archive.ExtractTarGz(archivePath, expected, policy); err != nil {
		return fmt.Errorf("extract self-test fixture: %w", err)
	}
	if err := os.Chmod(filepath.Join(expected, "bin", "tool"), 0o755); err != nil {
		return err
	}
	treeHash, err := archive.TreeSHA256(expected)
	if err != nil {
		return err
	}
	if err := os.RemoveAll(expected); err != nil {
		return err
	}

	platform, architecture, err := selfTestTuple(targetID)
	if err != nil {
		return err
	}
	artifact := manifest.Artifact{
		ID: "bootstrap-self-test", Version: "1.0.0", InstallDirectory: ".tools/bootstrap-self-test",
		URL: "https://self-test.invalid/fixture.tar.gz", Size: int64(len(archiveBytes)), SHA256: archiveHash,
		Source:     manifest.Source{URL: "https://self-test.invalid/source", Revision: "self-test"},
		License:    manifest.License{ID: "MIT", URL: "https://self-test.invalid/license"},
		Extraction: policy, Executables: []string{"bin/tool"}, TreeSHA256: treeHash,
	}
	documentBytes, err := json.Marshal(manifest.Document{
		SchemaVersion: manifest.SchemaVersion,
		Targets:       []manifest.Target{{ID: targetID, Platform: platform, Architecture: architecture, Artifacts: []manifest.Artifact{artifact}}},
	})
	if err != nil {
		return err
	}
	document, err := manifest.Parse(documentBytes)
	if err != nil {
		return fmt.Errorf("parse self-test manifest: %w", err)
	}

	client := download.Client()
	transport, ok := client.Transport.(*http.Transport)
	if !ok || transport.TLSClientConfig == nil || transport.TLSClientConfig.MinVersion < tls.VersionTLS12 || client.Timeout <= 0 {
		return fmt.Errorf("HTTPS client does not enforce the bootstrap TLS and timeout policy")
	}
	cache := filepath.Join(testRoot, ".tools", "cache", "bootstrap")
	if err := os.MkdirAll(cache, 0o700); err != nil {
		return err
	}
	if err := os.Chmod(filepath.Join(testRoot, ".tools"), 0o700); err != nil {
		return err
	}
	if err := os.Chmod(filepath.Join(testRoot, ".tools", "cache"), 0o700); err != nil {
		return err
	}
	if err := os.Chmod(cache, 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(cache, archiveHash+".tar.gz"), archiveBytes, 0o600); err != nil {
		return err
	}
	if err := Run(ctx, client, document, targetID, testRoot); err != nil {
		return fmt.Errorf("run self-test install: %w", err)
	}
	if err := Verify(document, targetID, testRoot); err != nil {
		return fmt.Errorf("verify self-test install: %w", err)
	}
	installedTool := filepath.Join(testRoot, ".tools", "bootstrap-self-test", "bin", "tool")
	if err := os.WriteFile(installedTool, []byte("tampered"), 0o755); err != nil {
		return err
	}
	if err := Verify(document, targetID, testRoot); err == nil {
		return fmt.Errorf("self-test verification accepted a tampered installed file")
	}
	return nil
}

func selfTestTuple(targetID string) (string, string, error) {
	switch targetID {
	case "linux-x64":
		return "linux", "x64", nil
	case "darwin-arm64":
		return "darwin", "arm64", nil
	case "darwin-x64":
		return "darwin", "x64", nil
	default:
		return "", "", fmt.Errorf("unsupported self-test target %q", targetID)
	}
}

func selfTestArchive() ([]byte, error) {
	var output bytes.Buffer
	gzipWriter := gzip.NewWriter(&output)
	tarWriter := tar.NewWriter(gzipWriter)
	entries := []struct {
		header *tar.Header
		body   []byte
	}{
		{header: &tar.Header{Name: "fixture/", Typeflag: tar.TypeDir, Mode: 0o755, Format: tar.FormatUSTAR}},
		{header: &tar.Header{Name: "fixture/bin/", Typeflag: tar.TypeDir, Mode: 0o755, Format: tar.FormatUSTAR}},
		{header: &tar.Header{Name: "fixture/bin/tool", Typeflag: tar.TypeReg, Mode: 0o755, Size: 28, Format: tar.FormatUSTAR}, body: []byte("orbital bootstrap self-test\n")},
	}
	for _, item := range entries {
		if err := tarWriter.WriteHeader(item.header); err != nil {
			return nil, err
		}
		if len(item.body) != 0 {
			if _, err := tarWriter.Write(item.body); err != nil {
				return nil, err
			}
		}
	}
	if err := tarWriter.Close(); err != nil {
		return nil, err
	}
	if err := gzipWriter.Close(); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}
