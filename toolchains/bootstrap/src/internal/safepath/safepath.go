package safepath

import (
	"fmt"
	"path"
	"strings"
)

// Validate returns a clean portable relative path. Bootstrap paths are ASCII
// by design, which prevents Unicode-normalization collisions without an
// external normalization library.
func Validate(value string, allowTrailingSlash bool) (string, error) {
	if value == "" {
		return "", fmt.Errorf("path is empty")
	}
	if strings.Contains(value, "\\") {
		return "", fmt.Errorf("path %q contains a backslash", value)
	}
	if strings.HasPrefix(value, "/") {
		return "", fmt.Errorf("path %q is absolute", value)
	}
	for _, r := range value {
		if r < 0x20 || r > 0x7e {
			return "", fmt.Errorf("path %q is not portable ASCII", value)
		}
	}
	trimmed := value
	if allowTrailingSlash {
		trimmed = strings.TrimSuffix(trimmed, "/")
	}
	if trimmed == "" || path.Clean(trimmed) != trimmed || trimmed == "." {
		return "", fmt.Errorf("path %q is not a clean relative path", value)
	}
	for _, segment := range strings.Split(trimmed, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return "", fmt.Errorf("path %q has an unsafe segment", value)
		}
		if strings.HasSuffix(segment, ".") || strings.HasSuffix(segment, " ") {
			return "", fmt.Errorf("path %q has a nonportable segment", value)
		}
	}
	return trimmed, nil
}

func CollisionKey(value string) string {
	return strings.ToLower(strings.TrimSuffix(value, "/"))
}

func JoinWithin(root, relative string) (string, error) {
	clean, err := Validate(relative, false)
	if err != nil {
		return "", err
	}
	return path.Join(root, clean), nil
}
