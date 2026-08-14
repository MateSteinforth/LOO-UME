package install

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/archive"
	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/manifest"
)

func TestPublishDirectoryRestoresOldInstallWhenPromotionFails(t *testing.T) {
	root := filepath.Join(t.TempDir(), "root with spaces")
	final := filepath.Join(root, ".tools", "node")
	if err := os.MkdirAll(final, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(final, "old"), []byte("preserved"), 0o600); err != nil {
		t.Fatal(err)
	}

	err := publishDirectory(root, filepath.Join(root, "missing staging"), final)
	if err == nil || !strings.Contains(err.Error(), "publish verified installation") {
		t.Fatalf("publishDirectory() error = %v", err)
	}
	data, readErr := os.ReadFile(filepath.Join(final, "old"))
	if readErr != nil || string(data) != "preserved" {
		t.Fatalf("old install after failure = %q, %v", data, readErr)
	}
}

func TestVerifyDetectsTamperedWarmInstall(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".git"), 0o700); err != nil {
		t.Fatal(err)
	}
	installed := filepath.Join(root, ".tools", "node")
	if err := os.MkdirAll(filepath.Join(installed, "bin"), 0o700); err != nil {
		t.Fatal(err)
	}
	executable := filepath.Join(installed, "bin", "node")
	if err := os.WriteFile(executable, []byte("original"), 0o755); err != nil {
		t.Fatal(err)
	}
	treeHash, err := archive.TreeSHA256(installed)
	if err != nil {
		t.Fatal(err)
	}
	artifact := manifest.Artifact{ID: "node", Version: "22.0.0", InstallDirectory: ".tools/node",
		Executables: []string{"bin/node"}, TreeSHA256: treeHash}
	document := &manifest.Document{SchemaVersion: manifest.SchemaVersion, Targets: []manifest.Target{{
		ID: "linux-x64", Platform: "linux", Architecture: "x64", Artifacts: []manifest.Artifact{artifact},
	}}}
	if err := writeReceipt(installed, "linux-x64", artifact); err != nil {
		t.Fatal(err)
	}
	if err := Verify(document, "linux-x64", root); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(executable, []byte("tampered"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := Verify(document, "linux-x64", root); err == nil || !strings.Contains(err.Error(), "installed tree") {
		t.Fatalf("Verify() error = %v", err)
	}
}

func TestWriteReceiptUsesAtomicTargetBoundData(t *testing.T) {
	receipts := t.TempDir()
	artifact := manifest.Artifact{ID: "node", Version: "22.0.0", InstallDirectory: ".tools/node",
		SHA256: strings.Repeat("a", 64), TreeSHA256: strings.Repeat("b", 64), Executables: []string{"bin/node"}}
	if err := writeReceipt(receipts, "linux-x64", artifact); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(receipts, receiptFile))
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, expected := range []string{`"target": "linux-x64"`, `"artifactSha256": "` + strings.Repeat("a", 64) + `"`, `"treeSha256": "` + strings.Repeat("b", 64) + `"`} {
		if !strings.Contains(text, expected) {
			t.Fatalf("receipt missing %s: %s", expected, text)
		}
	}
	matches, err := filepath.Glob(filepath.Join(receipts, ".receipt-*"))
	if err != nil || len(matches) != 0 {
		t.Fatalf("temporary receipts = %v, %v", matches, err)
	}
}
