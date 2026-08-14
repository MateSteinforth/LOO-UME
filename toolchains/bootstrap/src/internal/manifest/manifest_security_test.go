package manifest

import (
	"strings"
	"testing"
)

func TestParseRejectsUnsafeURLsAndTrailingData(t *testing.T) {
	tests := []struct {
		name string
		edit func(*Document)
		want string
	}{
		{"credentials", func(d *Document) { d.Targets[0].Artifacts[0].URL = "https://user:pass@downloads.example/node.tar.gz" }, "without credentials"},
		{"port", func(d *Document) { d.Targets[0].Artifacts[0].URL = "https://downloads.example:8443/node.tar.gz" }, "explicit port"},
		{"HTTP source", func(d *Document) { d.Targets[0].Artifacts[0].Source.URL = "http://source.example/node" }, "source metadata"},
		{"unsafe executable", func(d *Document) { d.Targets[0].Artifacts[0].Executables = []string{"../node"} }, "executable path"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			document := validDocument()
			test.edit(&document)
			_, err := Parse(encodeDocument(t, document))
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("Parse() error = %v", err)
			}
		})
	}
	data := append(encodeDocument(t, validDocument()), []byte(` {}`)...)
	if _, err := Parse(data); err == nil || !strings.Contains(err.Error(), "trailing") {
		t.Fatalf("Parse() trailing-data error = %v", err)
	}
}

func TestParseRejectsDuplicateTargetAndExecutable(t *testing.T) {
	document := validDocument()
	document.Targets = append(document.Targets, document.Targets[0])
	if _, err := Parse(encodeDocument(t, document)); err == nil || !strings.Contains(err.Error(), "duplicated") {
		t.Fatalf("Parse() duplicate-target error = %v", err)
	}
	document = validDocument()
	document.Targets[0].Artifacts[0].Executables = []string{"bin/node", "BIN/NODE"}
	if _, err := Parse(encodeDocument(t, document)); err == nil || !strings.Contains(err.Error(), "duplicated") {
		t.Fatalf("Parse() duplicate-executable error = %v", err)
	}
}
