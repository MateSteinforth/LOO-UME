package install

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/archive"
	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/download"
	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/manifest"
)

const (
	receiptFile = archive.ReceiptFileName
)

type Receipt struct {
	SchemaVersion    string   `json:"schemaVersion"`
	Target           string   `json:"target"`
	Artifact         string   `json:"artifact"`
	Version          string   `json:"version"`
	ArtifactSHA256   string   `json:"artifactSha256"`
	TreeSHA256       string   `json:"treeSha256"`
	InstallDirectory string   `json:"installDirectory"`
	Executables      []string `json:"executables"`
}

func Run(ctx context.Context, client *http.Client, document *manifest.Document, targetID, root string) error {
	target, err := document.Target(targetID)
	if err != nil {
		return err
	}
	root, err = validateRepositoryRoot(root)
	if err != nil {
		return err
	}
	tools := filepath.Join(root, ".tools")
	if err := ensurePrivateDirectory(tools); err != nil {
		return fmt.Errorf("prepare managed tools directory: %w", err)
	}
	releaseLock, err := acquireLock(tools)
	if err != nil {
		return err
	}
	defer releaseLock()

	cache := filepath.Join(tools, "cache")
	if err := ensurePrivateDirectory(cache); err != nil {
		return fmt.Errorf("prepare managed cache directory: %w", err)
	}
	bootstrapCache := filepath.Join(cache, "bootstrap")
	if err := ensurePrivateDirectory(bootstrapCache); err != nil {
		return fmt.Errorf("prepare bootstrap cache directory: %w", err)
	}
	for _, artifact := range target.Artifacts {
		if err := installArtifact(ctx, client, root, bootstrapCache, targetID, artifact); err != nil {
			return fmt.Errorf("install %s %s: %w", artifact.ID, artifact.Version, err)
		}
	}
	return nil
}

func Verify(document *manifest.Document, targetID, root string) error {
	target, err := document.Target(targetID)
	if err != nil {
		return err
	}
	root, err = validateRepositoryRoot(root)
	if err != nil {
		return err
	}
	for _, artifact := range target.Artifacts {
		if err := verifyInstallation(root, targetID, artifact); err != nil {
			return fmt.Errorf("verify %s %s: %w", artifact.ID, artifact.Version, err)
		}
	}
	return nil
}

func installArtifact(ctx context.Context, client *http.Client, root, cache, targetID string, artifact manifest.Artifact) error {
	finalDirectory := filepath.Join(root, filepath.FromSlash(artifact.InstallDirectory))
	if err := verifyInstallation(root, targetID, artifact); err == nil {
		return nil
	}
	archivePath := filepath.Join(cache, artifact.SHA256+".tar.gz")
	if err := download.Verified(ctx, client, download.Request{
		URL: artifact.URL, Size: artifact.Size, SHA256: artifact.SHA256,
		Path: archivePath, AllowedRedirectOrigins: artifact.AllowedRedirectOrigins,
	}); err != nil {
		return err
	}

	stagingBase, err := os.MkdirTemp(filepath.Join(root, ".tools"), ".bootstrap-staging-")
	if err != nil {
		return fmt.Errorf("create install staging directory: %w", err)
	}
	if err := os.Chmod(stagingBase, 0o700); err != nil {
		_ = os.RemoveAll(stagingBase)
		return err
	}
	defer os.RemoveAll(stagingBase)
	staging := filepath.Join(stagingBase, "payload")
	if err := archive.ExtractTarGz(archivePath, staging, artifact.Extraction); err != nil {
		return err
	}
	for _, executable := range artifact.Executables {
		candidate := filepath.Join(staging, filepath.FromSlash(executable))
		info, err := os.Lstat(candidate)
		if err != nil || !info.Mode().IsRegular() {
			return fmt.Errorf("required executable %q is missing or not a regular file", executable)
		}
		if err := os.Chmod(candidate, 0o755); err != nil {
			return fmt.Errorf("set executable mode on %q: %w", executable, err)
		}
	}
	treeHash, err := archive.TreeSHA256(staging)
	if err != nil {
		return err
	}
	if treeHash != artifact.TreeSHA256 {
		return fmt.Errorf("extracted tree has SHA-256 %s, expected %s", treeHash, artifact.TreeSHA256)
	}
	if err := writeReceipt(staging, targetID, artifact); err != nil {
		return fmt.Errorf("write staged receipt: %w", err)
	}
	return publishDirectory(root, staging, finalDirectory)
}

func verifyInstallation(root, targetID string, artifact manifest.Artifact) error {
	installed := filepath.Join(root, filepath.FromSlash(artifact.InstallDirectory))
	info, err := os.Lstat(installed)
	if err != nil || info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return fmt.Errorf("install directory is absent or unsafe")
	}
	receipt, err := readReceipt(filepath.Join(installed, receiptFile))
	if err != nil {
		return err
	}
	if !receiptsEqual(receipt, receiptFor(targetID, artifact)) {
		return fmt.Errorf("installed receipt does not match the selected target and artifact")
	}
	for _, executable := range artifact.Executables {
		candidate := filepath.Join(installed, filepath.FromSlash(executable))
		info, err := os.Lstat(candidate)
		if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0o111 == 0 {
			return fmt.Errorf("required executable %q is absent or not executable", executable)
		}
	}
	actual, err := archive.TreeSHA256(installed)
	if err != nil {
		return err
	}
	if actual != artifact.TreeSHA256 {
		return fmt.Errorf("installed tree has SHA-256 %s, expected %s", actual, artifact.TreeSHA256)
	}
	return nil
}

func receiptFor(targetID string, artifact manifest.Artifact) Receipt {
	return Receipt{
		SchemaVersion: "1.0.0", Target: targetID, Artifact: artifact.ID,
		Version: artifact.Version, ArtifactSHA256: artifact.SHA256,
		TreeSHA256: artifact.TreeSHA256, InstallDirectory: artifact.InstallDirectory,
		Executables: append([]string(nil), artifact.Executables...),
	}
}

func writeReceipt(directory, targetID string, artifact manifest.Artifact) error {
	data, err := json.MarshalIndent(receiptFor(targetID, artifact), "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	path := filepath.Join(directory, receiptFile)
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return syncDirectory(directory)
}

func readReceipt(path string) (Receipt, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return Receipt{}, fmt.Errorf("inspect installed receipt: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm() != 0o600 {
		return Receipt{}, fmt.Errorf("installed receipt is not a regular 0600 file")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return Receipt{}, fmt.Errorf("read installed receipt: %w", err)
	}
	if len(data) == 0 || len(data) > 64<<10 {
		return Receipt{}, fmt.Errorf("installed receipt size is invalid")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var receipt Receipt
	if err := decoder.Decode(&receipt); err != nil {
		return Receipt{}, fmt.Errorf("decode installed receipt: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return Receipt{}, fmt.Errorf("installed receipt has trailing data")
	}
	return receipt, nil
}

func receiptsEqual(left, right Receipt) bool {
	if left.SchemaVersion != right.SchemaVersion || left.Target != right.Target ||
		left.Artifact != right.Artifact || left.Version != right.Version ||
		left.ArtifactSHA256 != right.ArtifactSHA256 || left.TreeSHA256 != right.TreeSHA256 ||
		left.InstallDirectory != right.InstallDirectory || len(left.Executables) != len(right.Executables) {
		return false
	}
	for index := range left.Executables {
		if left.Executables[index] != right.Executables[index] {
			return false
		}
	}
	return true
}

func publishDirectory(root, staging, finalDirectory string) error {
	if err := ensureContainedDirectory(root, filepath.Dir(finalDirectory)); err != nil {
		return err
	}
	var quarantine string
	if _, err := os.Lstat(finalDirectory); err == nil {
		quarantine = finalDirectory + fmt.Sprintf(".invalid-%d", time.Now().UnixNano())
		if err := os.Rename(finalDirectory, quarantine); err != nil {
			return fmt.Errorf("quarantine invalid installation: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.Rename(staging, finalDirectory); err != nil {
		return restoreAfterPublishFailure(finalDirectory, quarantine, fmt.Errorf("publish verified installation: %w", err))
	}
	if err := syncDirectory(filepath.Dir(finalDirectory)); err != nil {
		return restoreAfterPublishFailure(finalDirectory, quarantine, fmt.Errorf("sync published installation: %w", err))
	}
	if quarantine != "" {
		if err := os.RemoveAll(quarantine); err != nil {
			return fmt.Errorf("remove quarantined installation %q: %w", quarantine, err)
		}
		return syncDirectory(filepath.Dir(finalDirectory))
	}
	return nil
}

func restoreAfterPublishFailure(finalDirectory, quarantine string, publishErr error) error {
	var cleanupErr error
	if _, err := os.Lstat(finalDirectory); err == nil {
		cleanupErr = os.RemoveAll(finalDirectory)
	}
	if quarantine == "" {
		return errors.Join(publishErr, cleanupErr)
	}
	return errors.Join(publishErr, cleanupErr, os.Rename(quarantine, finalDirectory))
}

func validateRepositoryRoot(root string) (string, error) {
	absolute, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("resolve repository root: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", fmt.Errorf("resolve repository root links: %w", err)
	}
	info, err := os.Lstat(filepath.Join(resolved, ".git"))
	if err != nil || info.Mode()&os.ModeSymlink != 0 || !(info.IsDir() || info.Mode().IsRegular()) {
		return "", fmt.Errorf("repository root must contain a real .git file or directory")
	}
	return resolved, nil
}

func ensureContainedDirectory(root, directory string) error {
	relative, err := filepath.Rel(root, directory)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return fmt.Errorf("managed directory escapes the repository")
	}
	current := root
	if relative == "." {
		return nil
	}
	for _, segment := range strings.Split(relative, string(filepath.Separator)) {
		current = filepath.Join(current, segment)
		if err := ensurePrivateDirectory(current); err != nil {
			return err
		}
	}
	return nil
}

func ensurePrivateDirectory(path string) error {
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		if err := os.Mkdir(path, 0o700); err != nil {
			return err
		}
		return nil
	}
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return fmt.Errorf("path %q is not a real directory", path)
	}
	return os.Chmod(path, 0o700)
}

func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}
