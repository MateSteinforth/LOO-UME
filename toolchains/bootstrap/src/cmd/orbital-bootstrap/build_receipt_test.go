package main

import (
	"bytes"
	"crypto/sha256"
	"debug/elf"
	"debug/macho"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"testing"
)

type buildReceipt struct {
	SchemaVersion string `json:"schemaVersion"`
	Builder       struct {
		GoVersion     string `json:"goVersion"`
		Host          string `json:"host"`
		ArchiveURL    string `json:"archiveUrl"`
		ArchiveSize   int64  `json:"archiveSize"`
		ArchiveSHA256 string `json:"archiveSha256"`
		SourceURL     string `json:"sourceUrl"`
		SourceSHA256  string `json:"sourceSha256"`
		LicenseURL    string `json:"licenseUrl"`
	} `json:"builder"`
	Source struct {
		Path            string `json:"path"`
		DigestAlgorithm string `json:"digestAlgorithm"`
		SHA256          string `json:"sha256"`
	} `json:"source"`
	Build struct {
		CgoEnabled      bool     `json:"cgoEnabled"`
		GoToolchain     string   `json:"goToolchain"`
		GoAmd64         string   `json:"goAmd64"`
		SourceDateEpoch int64    `json:"sourceDateEpoch"`
		Flags           []string `json:"flags"`
		LinkerFlags     []string `json:"linkerFlags"`
	} `json:"build"`
	Binaries []struct {
		Target string `json:"target"`
		Path   string `json:"path"`
		Size   int64  `json:"size"`
		SHA256 string `json:"sha256"`
	} `json:"binaries"`
}

func TestCommittedBuildReceipt(t *testing.T) {
	_, current, _, _ := runtime.Caller(0)
	bootstrapRoot := filepath.Clean(filepath.Join(filepath.Dir(current), "..", "..", ".."))
	data, err := os.ReadFile(filepath.Join(bootstrapRoot, "build-receipt.json"))
	if err != nil {
		t.Fatal(err)
	}
	var receipt buildReceipt
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&receipt); err != nil {
		t.Fatal(err)
	}
	if receipt.SchemaVersion != "1.0.0" || receipt.Builder.GoVersion != "go1.26.6" ||
		receipt.Builder.Host != "linux-x64" || receipt.Builder.ArchiveSize != 66890545 ||
		receipt.Builder.ArchiveSHA256 != "708effb774be8237570d0add163225abbdfaf4fca28b2611df167beba4feef89" {
		t.Fatalf("unexpected pinned builder receipt: %+v", receipt.Builder)
	}
	if receipt.Builder.ArchiveURL != "https://go.dev/dl/go1.26.6.linux-amd64.tar.gz" ||
		receipt.Builder.SourceURL != "https://go.dev/dl/go1.26.6.src.tar.gz" ||
		receipt.Builder.SourceSHA256 != "a0721c54c688901448d77ad9b3ec7ea7c474730755ff891382e92ecb93ff2cb1" ||
		receipt.Builder.LicenseURL != "https://raw.githubusercontent.com/golang/go/go1.26.6/LICENSE" {
		t.Fatalf("incomplete Go provenance: %+v", receipt.Builder)
	}
	if receipt.Source.Path != "toolchains/bootstrap/src" || receipt.Source.DigestAlgorithm != "sha256-of-sorted-sha256sum-lines" {
		t.Fatalf("unexpected source receipt: %+v", receipt.Source)
	}
	if receipt.Build.CgoEnabled || receipt.Build.GoToolchain != "local" || receipt.Build.GoAmd64 != "v1" ||
		receipt.Build.SourceDateEpoch != 1786665600 ||
		!reflect.DeepEqual(receipt.Build.Flags, []string{"-mod=readonly", "-trimpath", "-buildvcs=false"}) ||
		!reflect.DeepEqual(receipt.Build.LinkerFlags, []string{"-s", "-w", "-buildid=", "-X main.buildTarget=<target>"}) {
		t.Fatalf("unexpected build policy: %+v", receipt.Build)
	}
	actualSource, err := sourceTreeSHA256(filepath.Join(bootstrapRoot, "src"))
	if err != nil {
		t.Fatal(err)
	}
	if actualSource != receipt.Source.SHA256 {
		t.Fatalf("source digest = %s, receipt = %s", actualSource, receipt.Source.SHA256)
	}
	expected := map[string]struct {
		path   string
		format string
		cpu    uint32
	}{
		"linux-x64":    {"bin/linux-x64/orbital-bootstrap", "elf", uint32(elf.EM_X86_64)},
		"darwin-arm64": {"bin/darwin-arm64/orbital-bootstrap", "macho", uint32(macho.CpuArm64)},
		"darwin-x64":   {"bin/darwin-x64/orbital-bootstrap", "macho", uint32(macho.CpuAmd64)},
	}
	if len(receipt.Binaries) != len(expected) {
		t.Fatalf("binary receipt count = %d", len(receipt.Binaries))
	}
	for _, binary := range receipt.Binaries {
		want, ok := expected[binary.Target]
		if !ok || binary.Path != "toolchains/bootstrap/"+want.path {
			t.Fatalf("unexpected binary receipt: %+v", binary)
		}
		path := filepath.Join(bootstrapRoot, filepath.FromSlash(want.path))
		info, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if info.Size() != binary.Size || info.Mode().Perm()&0o111 == 0 {
			t.Fatalf("binary metadata mismatch for %s", binary.Target)
		}
		hash, err := fileSHA256(path)
		if err != nil {
			t.Fatal(err)
		}
		if hash != binary.SHA256 {
			t.Fatalf("%s SHA-256 = %s, receipt = %s", binary.Target, hash, binary.SHA256)
		}
		if want.format == "elf" {
			file, err := elf.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			machine := uint32(file.Machine)
			_ = file.Close()
			if machine != want.cpu {
				t.Fatalf("%s ELF machine = %d", binary.Target, machine)
			}
		} else {
			file, err := macho.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			cpu := uint32(file.Cpu)
			_ = file.Close()
			if cpu != want.cpu {
				t.Fatalf("%s Mach-O CPU = %d", binary.Target, cpu)
			}
		}
		delete(expected, binary.Target)
	}
	if len(expected) != 0 {
		t.Fatalf("missing binary receipts: %v", expected)
	}
}

func sourceTreeSHA256(root string) (string, error) {
	type line struct{ relative, hash string }
	lines := []line{}
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("source path %q is not regular", path)
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		hash, err := fileSHA256(path)
		if err != nil {
			return err
		}
		lines = append(lines, line{filepath.ToSlash(relative), hash})
		return nil
	})
	if err != nil {
		return "", err
	}
	sort.Slice(lines, func(i, j int) bool { return lines[i].relative < lines[j].relative })
	digest := sha256.New()
	for _, item := range lines {
		fmt.Fprintf(digest, "%s  %s\n", item.hash, item.relative)
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	digest := sha256.New()
	if _, err := io.Copy(digest, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}
