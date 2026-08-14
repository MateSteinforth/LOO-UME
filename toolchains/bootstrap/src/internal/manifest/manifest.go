package manifest

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"strings"

	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/safepath"
)

const SchemaVersion = "1.0.0"

type Document struct {
	SchemaVersion string   `json:"schemaVersion"`
	Targets       []Target `json:"targets"`
}

type Target struct {
	ID           string     `json:"id"`
	Platform     string     `json:"platform"`
	Architecture string     `json:"architecture"`
	Artifacts    []Artifact `json:"artifacts"`
}

type Artifact struct {
	ID                     string     `json:"id"`
	Version                string     `json:"version"`
	InstallDirectory       string     `json:"installDirectory"`
	URL                    string     `json:"url"`
	AllowedRedirectOrigins []string   `json:"allowedRedirectOrigins"`
	Size                   int64      `json:"size"`
	SHA256                 string     `json:"sha256"`
	Source                 Source     `json:"source"`
	License                License    `json:"license"`
	Extraction             Extraction `json:"extraction"`
	Executables            []string   `json:"executables"`
	TreeSHA256             string     `json:"treeSha256"`
}

type Source struct {
	URL      string `json:"url"`
	Revision string `json:"revision"`
}

type License struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

type Extraction struct {
	Kind                    string `json:"kind"`
	RootDirectory           string `json:"rootDirectory"`
	MaximumEntries          int    `json:"maximumEntries"`
	MaximumBytes            int64  `json:"maximumExpandedBytes"`
	MaximumEntrySize        int64  `json:"maximumEntryBytes"`
	MaximumCompressionRatio int    `json:"maximumCompressionRatio"`
}

func Load(path string) (*Document, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read bootstrap manifest: %w", err)
	}
	return Parse(data)
}

func Parse(data []byte) (*Document, error) {
	if len(data) == 0 || len(data) > 4<<20 {
		return nil, fmt.Errorf("bootstrap manifest size is invalid")
	}
	if err := rejectDuplicateKeys(data); err != nil {
		return nil, err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var document Document
	if err := decoder.Decode(&document); err != nil {
		return nil, fmt.Errorf("decode bootstrap manifest: %w", err)
	}
	if err := requireJSONEOF(decoder); err != nil {
		return nil, err
	}
	if err := document.Validate(); err != nil {
		return nil, err
	}
	return &document, nil
}

func requireJSONEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return fmt.Errorf("bootstrap manifest has trailing JSON data")
		}
		return fmt.Errorf("decode trailing bootstrap manifest data: %w", err)
	}
	return nil
}

type jsonScope struct {
	object       bool
	expectingKey bool
	keys         map[string]struct{}
}

func rejectDuplicateKeys(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	stack := []jsonScope{}
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return fmt.Errorf("decode bootstrap manifest tokens: %w", err)
		}
		switch value := token.(type) {
		case json.Delim:
			switch value {
			case '{':
				stack = append(stack, jsonScope{object: true, expectingKey: true, keys: map[string]struct{}{}})
			case '[':
				stack = append(stack, jsonScope{})
			case '}', ']':
				if len(stack) == 0 {
					return fmt.Errorf("bootstrap manifest has an unbalanced delimiter")
				}
				stack = stack[:len(stack)-1]
				markValueComplete(stack)
			}
		case string:
			if len(stack) > 0 && stack[len(stack)-1].object && stack[len(stack)-1].expectingKey {
				current := &stack[len(stack)-1]
				if _, exists := current.keys[value]; exists {
					return fmt.Errorf("bootstrap manifest has duplicate key %q", value)
				}
				current.keys[value] = struct{}{}
				current.expectingKey = false
			} else {
				markValueComplete(stack)
			}
		default:
			markValueComplete(stack)
		}
	}
}

func markValueComplete(stack []jsonScope) {
	if len(stack) > 0 && stack[len(stack)-1].object && !stack[len(stack)-1].expectingKey {
		stack[len(stack)-1].expectingKey = true
	}
}

func (document *Document) Validate() error {
	if document.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported bootstrap manifest schema %q", document.SchemaVersion)
	}
	if len(document.Targets) == 0 || len(document.Targets) > 8 {
		return fmt.Errorf("bootstrap manifest must contain 1 to 8 targets")
	}
	targetIDs := map[string]struct{}{}
	for targetIndex := range document.Targets {
		target := &document.Targets[targetIndex]
		if target.ID != target.Platform+"-"+target.Architecture {
			return fmt.Errorf("target %q has inconsistent tuple fields", target.ID)
		}
		if !isSupportedTuple(target.ID, target.Platform, target.Architecture) {
			return fmt.Errorf("target %q is not supported", target.ID)
		}
		if _, exists := targetIDs[target.ID]; exists {
			return fmt.Errorf("target %q is duplicated", target.ID)
		}
		targetIDs[target.ID] = struct{}{}
		if len(target.Artifacts) == 0 || len(target.Artifacts) > 16 {
			return fmt.Errorf("target %q must contain 1 to 16 artifacts", target.ID)
		}
		artifactIDs := map[string]struct{}{}
		installPaths := map[string]struct{}{}
		for artifactIndex := range target.Artifacts {
			artifact := &target.Artifacts[artifactIndex]
			if err := artifact.validate(); err != nil {
				return fmt.Errorf("target %q artifact %q: %w", target.ID, artifact.ID, err)
			}
			if _, exists := artifactIDs[artifact.ID]; exists {
				return fmt.Errorf("target %q duplicates artifact %q", target.ID, artifact.ID)
			}
			artifactIDs[artifact.ID] = struct{}{}
			key := safepath.CollisionKey(artifact.InstallDirectory)
			if _, exists := installPaths[key]; exists {
				return fmt.Errorf("target %q has colliding install directories", target.ID)
			}
			installPaths[key] = struct{}{}
		}
	}
	return nil
}

func isSupportedTuple(id, platform, architecture string) bool {
	return (id == "linux-x64" && platform == "linux" && architecture == "x64") ||
		(id == "darwin-arm64" && platform == "darwin" && architecture == "arm64") ||
		(id == "darwin-x64" && platform == "darwin" && architecture == "x64")
}

func (artifact *Artifact) validate() error {
	if !validID(artifact.ID) || artifact.Version == "" {
		return fmt.Errorf("id or version is invalid")
	}
	installDirectory, err := safepath.Validate(artifact.InstallDirectory, false)
	installName := strings.TrimPrefix(installDirectory, ".tools/")
	if err != nil || installName == installDirectory || strings.Contains(installName, "/") {
		return fmt.Errorf("installDirectory must be one direct child below .tools")
	}
	if err := validateHTTPS(artifact.URL); err != nil {
		return fmt.Errorf("artifact URL: %w", err)
	}
	origins := map[string]struct{}{}
	for _, origin := range artifact.AllowedRedirectOrigins {
		if err := validateOrigin(origin); err != nil {
			return fmt.Errorf("allowed redirect origin %q: %w", origin, err)
		}
		if _, exists := origins[origin]; exists {
			return fmt.Errorf("allowed redirect origin %q is duplicated", origin)
		}
		origins[origin] = struct{}{}
	}
	if artifact.Size <= 0 || artifact.Size > 2<<30 {
		return fmt.Errorf("artifact size is outside the hard limit")
	}
	if err := validateSHA(artifact.SHA256); err != nil {
		return fmt.Errorf("artifact SHA-256: %w", err)
	}
	if err := validateHTTPS(artifact.Source.URL); err != nil || artifact.Source.Revision == "" {
		return fmt.Errorf("source metadata is invalid")
	}
	if artifact.License.ID == "" {
		return fmt.Errorf("license ID is empty")
	}
	if err := validateHTTPS(artifact.License.URL); err != nil {
		return fmt.Errorf("license URL: %w", err)
	}
	if artifact.Extraction.Kind != "tar.gz" {
		return fmt.Errorf("only tar.gz extraction is supported")
	}
	if _, err := safepath.Validate(artifact.Extraction.RootDirectory, false); err != nil {
		return fmt.Errorf("archive root is invalid: %w", err)
	}
	if artifact.Extraction.MaximumEntries < 1 || artifact.Extraction.MaximumEntries > 1_000_000 ||
		artifact.Extraction.MaximumBytes < 1 || artifact.Extraction.MaximumBytes > 8<<30 ||
		artifact.Extraction.MaximumEntrySize < 1 || artifact.Extraction.MaximumEntrySize > artifact.Extraction.MaximumBytes ||
		artifact.Extraction.MaximumCompressionRatio < 1 || artifact.Extraction.MaximumCompressionRatio > 1000 {
		return fmt.Errorf("archive bounds are invalid")
	}
	if len(artifact.Executables) == 0 || len(artifact.Executables) > 32 {
		return fmt.Errorf("executables list is invalid")
	}
	seen := map[string]struct{}{}
	for _, executable := range artifact.Executables {
		if _, err := safepath.Validate(executable, false); err != nil {
			return fmt.Errorf("executable path is invalid: %w", err)
		}
		key := safepath.CollisionKey(executable)
		if _, exists := seen[key]; exists {
			return fmt.Errorf("executable path %q is duplicated", executable)
		}
		seen[key] = struct{}{}
	}
	if err := validateSHA(artifact.TreeSHA256); err != nil {
		return fmt.Errorf("tree SHA-256: %w", err)
	}
	return nil
}

func validID(value string) bool {
	if value == "" || len(value) > 64 {
		return false
	}
	for _, r := range value {
		if !((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-') {
			return false
		}
	}
	return true
}

func validateHTTPS(value string) error {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" || parsed.Port() != "" {
		return fmt.Errorf("must be an HTTPS URL without credentials, a fragment, or an explicit port")
	}
	return nil
}

func validateOrigin(value string) error {
	if err := validateHTTPS(value); err != nil {
		return err
	}
	parsed, _ := url.Parse(value)
	if parsed.Path != "" || parsed.RawQuery != "" {
		return fmt.Errorf("must contain only an HTTPS scheme and host")
	}
	return nil
}

func validateSHA(value string) error {
	if len(value) != 64 || strings.ToLower(value) != value {
		return fmt.Errorf("must be 64 lowercase hexadecimal characters")
	}
	decoded, err := hex.DecodeString(value)
	if err != nil || len(decoded) != 32 {
		return fmt.Errorf("must be 64 lowercase hexadecimal characters")
	}
	return nil
}

func (document *Document) Target(id string) (*Target, error) {
	for index := range document.Targets {
		if document.Targets[index].ID == id {
			return &document.Targets[index], nil
		}
	}
	return nil, fmt.Errorf("manifest has no target %q", id)
}
