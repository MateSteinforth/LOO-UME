package manifest

import (
	"encoding/json"
	"strings"
	"testing"
)

func validDocument() Document {
	return Document{
		SchemaVersion: SchemaVersion,
		Targets: []Target{{
			ID: "linux-x64", Platform: "linux", Architecture: "x64",
			Artifacts: []Artifact{{
				ID: "node", Version: "22.0.0",
				InstallDirectory:       ".tools/node-linux-x64",
				URL:                    "https://downloads.example/node.tar.gz",
				AllowedRedirectOrigins: []string{"https://assets.example"},
				Size:                   123, SHA256: strings.Repeat("a", 64),
				Source:  Source{URL: "https://source.example/node", Revision: "v22.0.0"},
				License: License{ID: "MIT", URL: "https://source.example/LICENSE"},
				Extraction: Extraction{Kind: "tar.gz", RootDirectory: "node-v22",
					MaximumEntries: 100, MaximumBytes: 1000,
					MaximumEntrySize: 500, MaximumCompressionRatio: 20},
				Executables: []string{"bin/node"}, TreeSHA256: strings.Repeat("b", 64),
			}},
		}},
	}
}

func encodeDocument(t *testing.T, document Document) []byte {
	t.Helper()
	data, err := json.Marshal(document)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestParseAcceptsStrictValidManifest(t *testing.T) {
	if _, err := Parse(encodeDocument(t, validDocument())); err != nil {
		t.Fatalf("Parse() rejected a valid manifest: %v", err)
	}
}

func TestParseRejectsUnknownAndDuplicateFields(t *testing.T) {
	valid := string(encodeDocument(t, validDocument()))
	withUnknown := strings.Replace(valid, `"schemaVersion":"1.0.0"`, `"schemaVersion":"1.0.0","extra":true`, 1)
	if _, err := Parse([]byte(withUnknown)); err == nil || !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("Parse() unknown-field error = %v", err)
	}
	withDuplicate := strings.Replace(valid, `"schemaVersion":"1.0.0"`, `"schemaVersion":"1.0.0","schemaVersion":"1.0.0"`, 1)
	if _, err := Parse([]byte(withDuplicate)); err == nil || !strings.Contains(err.Error(), "duplicate key") {
		t.Fatalf("Parse() duplicate-key error = %v", err)
	}
}

func TestParseRejectsUnsafeMetadata(t *testing.T) {
	tests := []struct {
		name string
		edit func(*Document)
		want string
	}{
		{"unsupported target", func(d *Document) {
			d.Targets[0].ID = "win32-x64"
			d.Targets[0].Platform = "win32"
		}, "not supported"},
		{"unsafe path", func(d *Document) { d.Targets[0].Artifacts[0].InstallDirectory = ".tools/../node" }, "below .tools"},
		{"malformed checksum", func(d *Document) { d.Targets[0].Artifacts[0].SHA256 = strings.Repeat("A", 64) }, "lowercase hexadecimal"},
		{"unsafe redirect", func(d *Document) {
			d.Targets[0].Artifacts[0].AllowedRedirectOrigins = []string{"http://assets.example"}
		}, "allowed redirect origin"},
		{"case collision", func(d *Document) {
			copy := d.Targets[0].Artifacts[0]
			copy.ID = "python"
			copy.InstallDirectory = ".tools/Node-Linux-X64"
			d.Targets[0].Artifacts = append(d.Targets[0].Artifacts, copy)
		}, "colliding install directories"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			document := validDocument()
			test.edit(&document)
			_, err := Parse(encodeDocument(t, document))
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("Parse() error = %v, want text %q", err, test.want)
			}
		})
	}
}
