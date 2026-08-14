package archive

import (
	"archive/tar"
	"compress/gzip"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/manifest"
)

type tarEntry struct {
	name, link string
	kind       byte
	data       string
}

func writeArchive(t *testing.T, entries []tarEntry) string {
	t.Helper()
	file, err := os.CreateTemp(t.TempDir(), "fixture-*.tar.gz")
	if err != nil {
		t.Fatal(err)
	}
	gzipWriter := gzip.NewWriter(file)
	tarWriter := tar.NewWriter(gzipWriter)
	for _, item := range entries {
		header := &tar.Header{Name: item.name, Typeflag: item.kind, Linkname: item.link, Mode: 0o755, Format: tar.FormatUSTAR}
		if item.kind == tar.TypeReg {
			header.Size = int64(len(item.data))
			header.Mode = 0o644
		}
		if err := tarWriter.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		if item.data != "" {
			if _, err := tarWriter.Write([]byte(item.data)); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	return file.Name()
}

func extractionPolicy() manifest.Extraction {
	return manifest.Extraction{Kind: "tar.gz", RootDirectory: "payload", MaximumEntries: 20,
		MaximumBytes: 4096, MaximumEntrySize: 2048, MaximumCompressionRatio: 100}
}

func TestExtractTarGzAcceptsContainedLinks(t *testing.T) {
	archive := writeArchive(t, []tarEntry{
		{name: "payload/", kind: tar.TypeDir},
		{name: "payload/bin/tool", kind: tar.TypeReg, data: "tool"},
		{name: "payload/bin/alias", kind: tar.TypeSymlink, link: "tool"},
		{name: "payload/bin/copy", kind: tar.TypeLink, link: "payload/bin/tool"},
	})
	destination := filepath.Join(t.TempDir(), "path with spaces")
	if err := ExtractTarGz(archive, destination, extractionPolicy()); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"tool", "alias", "copy"} {
		data, err := os.ReadFile(filepath.Join(destination, "bin", name))
		if err != nil || string(data) != "tool" {
			t.Fatalf("%s: %q, %v", name, data, err)
		}
	}
}

func TestInspectRejectsUnsafePathsLinksAndLimits(t *testing.T) {
	tests := []struct {
		name    string
		entries []tarEntry
		edit    func(*manifest.Extraction)
		want    string
	}{
		{"traversal", []tarEntry{{name: "payload/../escape", kind: tar.TypeReg, data: "x"}}, nil, "unsafe archive path"},
		{"case collision", []tarEntry{{name: "payload/Bin", kind: tar.TypeReg, data: "x"}, {name: "payload/bin", kind: tar.TypeReg, data: "x"}}, nil, "collide"},
		{"escaping symlink", []tarEntry{{name: "payload/link", kind: tar.TypeSymlink, link: "../../escape"}}, nil, "escapes"},
		{"link cycle", []tarEntry{{name: "payload/a", kind: tar.TypeSymlink, link: "b"}, {name: "payload/b", kind: tar.TypeSymlink, link: "a"}}, nil, "cycle"},
		{"entry limit", []tarEntry{{name: "payload/a", kind: tar.TypeReg, data: "a"}, {name: "payload/b", kind: tar.TypeReg, data: "b"}}, func(p *manifest.Extraction) { p.MaximumEntries = 1 }, "entry limit"},
		{"expanded limit", []tarEntry{{name: "payload/a", kind: tar.TypeReg, data: strings.Repeat("a", 20)}}, func(p *manifest.Extraction) { p.MaximumBytes = 10 }, "expanded-size"},
		{"special file", []tarEntry{{name: "payload/device", kind: tar.TypeChar}}, nil, "unsupported type"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			policy := extractionPolicy()
			if test.edit != nil {
				test.edit(&policy)
			}
			_, err := inspect(writeArchive(t, test.entries), policy)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("inspect() error = %v, want text %q", err, test.want)
			}
		})
	}
}
