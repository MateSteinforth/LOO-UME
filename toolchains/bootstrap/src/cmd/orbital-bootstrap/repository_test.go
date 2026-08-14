package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateRepositoryPathsRejectsOutsideManifest(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "repository")
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o700); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(base, "outside.json")
	if err := os.WriteFile(outside, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, candidate := range []string{outside, filepath.Join(root, "linked.json")} {
		if candidate != outside {
			if err := os.Symlink(outside, candidate); err != nil {
				t.Fatal(err)
			}
		}
		_, _, err := validateRepositoryPaths(root, candidate)
		if err == nil || !strings.Contains(err.Error(), "outside the repository root") {
			t.Fatalf("validateRepositoryPaths(%q) error = %v", candidate, err)
		}
	}
}
