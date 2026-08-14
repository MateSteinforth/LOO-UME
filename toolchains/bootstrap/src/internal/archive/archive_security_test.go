package archive

import (
	"archive/tar"
	"compress/gzip"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"

	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/manifest"
)

func securityArchive(t *testing.T, headers []*tar.Header, bodies []string) string {
	t.Helper()
	file, err := os.CreateTemp(t.TempDir(), "security-*.tar.gz")
	if err != nil {
		t.Fatal(err)
	}
	gz := gzip.NewWriter(file)
	tw := tar.NewWriter(gz)
	for index, header := range headers {
		if header.Format == tar.FormatUnknown {
			header.Format = tar.FormatUSTAR
		}
		if err := tw.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		if bodies[index] != "" {
			if _, err := tw.Write([]byte(bodies[index])); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	return file.Name()
}

func regularHeader(name, body string) *tar.Header {
	return &tar.Header{Name: name, Typeflag: tar.TypeReg, Mode: 0o777, Size: int64(len(body))}
}

func TestInspectRejectsAdditionalPathAndLinkAttacks(t *testing.T) {
	tests := []struct {
		name   string
		header *tar.Header
		want   string
	}{
		{"absolute", regularHeader("/payload/escape", "x"), "unsafe archive path"},
		{"backslash", regularHeader(`payload\escape`, "x"), "backslash"},
		{"non ASCII", &tar.Header{Name: "payload/café", Typeflag: tar.TypeReg, Mode: 0o777, Size: 1, Format: tar.FormatGNU}, "portable ASCII"},
		{"escaping hardlink", &tar.Header{Name: "payload/link", Typeflag: tar.TypeLink, Linkname: "../escape", Mode: 0o755}, "unsafe segment"},
		{"missing hardlink", &tar.Header{Name: "payload/link", Typeflag: tar.TypeLink, Linkname: "payload/missing", Mode: 0o755}, "missing target"},
		{"privileged mode", &tar.Header{Name: "payload/tool", Typeflag: tar.TypeReg, Mode: 0o4755, Size: 1}, "privileged mode"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			body := ""
			if test.header.Typeflag == tar.TypeReg {
				body = "x"
			}
			_, err := inspect(securityArchive(t, []*tar.Header{test.header}, []string{body}), extractionPolicy())
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("inspect() error = %v, want text %q", err, test.want)
			}
		})
	}
}

func TestInspectRejectsPAXAndRemainingResourceLimits(t *testing.T) {
	pax := regularHeader("payload/tool", "x")
	pax.Format = tar.FormatPAX
	pax.PAXRecords = map[string]string{"comment": "rejected"}
	large := strings.Repeat("a", 2048)
	tests := []struct {
		name   string
		header *tar.Header
		body   string
		edit   func(*manifest.Extraction)
		want   string
	}{
		{"PAX", pax, "x", nil, "PAX"},
		{"per entry", regularHeader("payload/tool", large), large, func(p *manifest.Extraction) { p.MaximumEntrySize = 1024 }, "size limit"},
		{"compression", regularHeader("payload/tool", large), large, func(p *manifest.Extraction) { p.MaximumCompressionRatio = 1 }, "compression-ratio"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			policy := extractionPolicy()
			if test.edit != nil {
				test.edit(&policy)
			}
			_, err := inspect(securityArchive(t, []*tar.Header{test.header}, []string{test.body}), policy)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("inspect() error = %v, want text %q", err, test.want)
			}
		})
	}
}

func TestExtractSanitizesFileMode(t *testing.T) {
	archivePath := securityArchive(t, []*tar.Header{regularHeader("payload/tool", "x")}, []string{"x"})
	destination := filepath.Join(t.TempDir(), "safe mode")
	if err := ExtractTarGz(archivePath, destination, extractionPolicy()); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(destination, "tool"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o644 {
		t.Fatalf("file mode = %o, want 644", info.Mode().Perm())
	}
}

func TestExtractedTreeHashIsStableAcrossUmasks(t *testing.T) {
	archivePath := writeArchive(t, []tarEntry{
		{name: "payload/", kind: tar.TypeDir},
		{name: "payload/explicit/", kind: tar.TypeDir},
		{name: "payload/implicit/deep/tool", kind: tar.TypeReg, data: "tool"},
		{name: "payload/implicit/alias", kind: tar.TypeSymlink, link: "deep/tool"},
	})
	hashes := []string{}
	for _, mask := range []int{0o022, 0o077} {
		destination := filepath.Join(t.TempDir(), "umask tree")
		previous := syscall.Umask(mask)
		err := ExtractTarGz(archivePath, destination, extractionPolicy())
		syscall.Umask(previous)
		if err != nil {
			t.Fatal(err)
		}
		for _, directory := range []string{"explicit", "implicit", "implicit/deep"} {
			info, err := os.Stat(filepath.Join(destination, filepath.FromSlash(directory)))
			if err != nil || info.Mode().Perm() != 0o755 {
				t.Fatalf("directory %s mode = %v, %v", directory, info.Mode().Perm(), err)
			}
		}
		hash, err := TreeSHA256(destination)
		if err != nil {
			t.Fatal(err)
		}
		hashes = append(hashes, hash)
	}
	if hashes[0] != hashes[1] {
		t.Fatalf("tree hashes differ by umask: %v", hashes)
	}
}
