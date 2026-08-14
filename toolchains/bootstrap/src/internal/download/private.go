package download

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
)

func origin(value *url.URL) string {
	return value.Scheme + "://" + value.Host
}

func ensurePrivateDirectory(path string) error {
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		parentInfo, parentErr := os.Lstat(filepath.Dir(path))
		if parentErr != nil {
			return parentErr
		}
		if parentInfo.Mode()&os.ModeSymlink != 0 || !parentInfo.IsDir() {
			return fmt.Errorf("directory parent %q is not a real directory", filepath.Dir(path))
		}
		if err := os.Mkdir(path, 0o700); err != nil {
			return err
		}
		return nil
	}
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return fmt.Errorf("path %q is not a real directory", path)
	}
	if info.Mode().Perm() != 0o700 {
		if err := os.Chmod(path, 0o700); err != nil {
			return err
		}
	}
	return nil
}
