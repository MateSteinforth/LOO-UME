package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func validateRepositoryPaths(root, manifestPath string) (string, string, error) {
	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return "", "", fmt.Errorf("resolve repository root: %w", err)
	}
	resolvedRoot, err := filepath.EvalSymlinks(absoluteRoot)
	if err != nil {
		return "", "", fmt.Errorf("resolve repository root links: %w", err)
	}
	rootInfo, err := os.Stat(resolvedRoot)
	if err != nil || !rootInfo.IsDir() {
		return "", "", fmt.Errorf("repository root is not a directory")
	}
	gitInfo, err := os.Lstat(filepath.Join(resolvedRoot, ".git"))
	if err != nil || gitInfo.Mode()&os.ModeSymlink != 0 || !(gitInfo.IsDir() || gitInfo.Mode().IsRegular()) {
		return "", "", fmt.Errorf("repository root has no safe .git marker")
	}
	absoluteManifest, err := filepath.Abs(manifestPath)
	if err != nil {
		return "", "", fmt.Errorf("resolve install manifest: %w", err)
	}
	resolvedManifest, err := filepath.EvalSymlinks(absoluteManifest)
	if err != nil {
		return "", "", fmt.Errorf("resolve install manifest links: %w", err)
	}
	relative, err := filepath.Rel(resolvedRoot, resolvedManifest)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return "", "", fmt.Errorf("install manifest is outside the repository root")
	}
	manifestInfo, err := os.Stat(resolvedManifest)
	if err != nil || !manifestInfo.Mode().IsRegular() {
		return "", "", fmt.Errorf("install manifest is not a regular file")
	}
	return resolvedRoot, resolvedManifest, nil
}
