package install

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/archive"
	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/manifest"
)

func TestRunRejectsSymlinkedToolsDirectory(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".git"), 0o700); err != nil {
		t.Fatal(err)
	}
	realTools := filepath.Join(root, "real-tools")
	if err := os.Mkdir(realTools, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(realTools, filepath.Join(root, ".tools")); err != nil {
		t.Fatal(err)
	}
	document := &manifest.Document{Targets: []manifest.Target{{ID: "linux-x64"}}}
	err := Run(context.Background(), nil, document, "linux-x64", root)
	if err == nil || !strings.Contains(err.Error(), "not a real directory") {
		t.Fatalf("Run() error = %v", err)
	}
}

func TestVerifyRejectsSymlinkedInstallDirectory(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".git"), 0o700); err != nil {
		t.Fatal(err)
	}
	realInstall := filepath.Join(root, "real-node")
	if err := os.MkdirAll(filepath.Join(realInstall, "bin"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(realInstall, "bin", "node"), []byte("node"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, ".tools"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(realInstall, filepath.Join(root, ".tools", "node")); err != nil {
		t.Fatal(err)
	}
	artifact := manifest.Artifact{ID: "node", InstallDirectory: ".tools/node", Executables: []string{"bin/node"}, TreeSHA256: strings.Repeat("a", 64)}
	document := &manifest.Document{Targets: []manifest.Target{{ID: "linux-x64", Artifacts: []manifest.Artifact{artifact}}}}
	if err := Verify(document, "linux-x64", root); err == nil || !strings.Contains(err.Error(), "absent or unsafe") {
		t.Fatalf("Verify() error = %v", err)
	}
}

func TestRunReusesVerifiedWarmInstallWithoutNetwork(t *testing.T) {
	root := filepath.Join(t.TempDir(), "warm path with spaces")
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o700); err != nil {
		t.Fatal(err)
	}
	installed := filepath.Join(root, ".tools", "node")
	if err := os.MkdirAll(filepath.Join(installed, "bin"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(installed, "bin", "node"), []byte("node"), 0o755); err != nil {
		t.Fatal(err)
	}
	treeHash, err := archive.TreeSHA256(installed)
	if err != nil {
		t.Fatal(err)
	}
	artifact := manifest.Artifact{ID: "node", Version: "22.0.0", InstallDirectory: ".tools/node",
		SHA256: strings.Repeat("a", 64), TreeSHA256: treeHash, Executables: []string{"bin/node"}}
	if err := writeReceipt(installed, "linux-x64", artifact); err != nil {
		t.Fatal(err)
	}
	document := &manifest.Document{Targets: []manifest.Target{{ID: "linux-x64", Artifacts: []manifest.Artifact{artifact}}}}
	if err := Run(context.Background(), nil, document, "linux-x64", root); err != nil {
		t.Fatal(err)
	}
}

func TestVerifyRejectsSymlinkedReceipt(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".git"), 0o700); err != nil {
		t.Fatal(err)
	}
	installed := filepath.Join(root, ".tools", "node")
	if err := os.MkdirAll(filepath.Join(installed, "bin"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(installed, "bin", "node"), []byte("node"), 0o755); err != nil {
		t.Fatal(err)
	}
	treeHash, err := archive.TreeSHA256(installed)
	if err != nil {
		t.Fatal(err)
	}
	artifact := manifest.Artifact{ID: "node", Version: "22.0.0", InstallDirectory: ".tools/node",
		SHA256: strings.Repeat("a", 64), TreeSHA256: treeHash, Executables: []string{"bin/node"}}
	receiptSource := filepath.Join(root, "receipt-source")
	if err := os.Mkdir(receiptSource, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := writeReceipt(receiptSource, "linux-x64", artifact); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(receiptSource, receiptFile), filepath.Join(installed, receiptFile)); err != nil {
		t.Fatal(err)
	}
	document := &manifest.Document{Targets: []manifest.Target{{ID: "linux-x64", Artifacts: []manifest.Artifact{artifact}}}}
	if err := Verify(document, "linux-x64", root); err == nil || !strings.Contains(err.Error(), "not a regular 0600 file") {
		t.Fatalf("Verify() error = %v", err)
	}
}

func TestSelfTestExercisesContainedInstallAndVerification(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".git"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := SelfTest(context.Background(), "linux-x64", root); err != nil {
		t.Fatal(err)
	}
	matches, err := filepath.Glob(filepath.Join(root, ".bootstrap-self-test-*"))
	if err != nil || len(matches) != 0 {
		t.Fatalf("self-test temporary paths = %v, %v", matches, err)
	}
}
