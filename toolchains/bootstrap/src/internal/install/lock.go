package install

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const staleLockAge = 30 * time.Minute

func acquireLock(toolsDirectory string) (func() error, error) {
	lockPath := filepath.Join(toolsDirectory, ".orbital-bootstrap.lock")
	for attempt := 0; attempt < 2; attempt++ {
		if err := os.Mkdir(lockPath, 0o700); err == nil {
			owner := []byte(fmt.Sprintf("pid=%d\n", os.Getpid()))
			if err := os.WriteFile(filepath.Join(lockPath, "owner"), owner, 0o600); err != nil {
				_ = os.RemoveAll(lockPath)
				return nil, err
			}
			return func() error { return os.RemoveAll(lockPath) }, nil
		} else if !os.IsExist(err) {
			return nil, fmt.Errorf("acquire bootstrap lock: %w", err)
		}
		info, err := os.Lstat(lockPath)
		if err != nil || info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return nil, fmt.Errorf("bootstrap lock path is unsafe")
		}
		alive, known := lockOwnerAlive(filepath.Join(lockPath, "owner"))
		if alive || (!known && time.Since(info.ModTime()) < staleLockAge) {
			return nil, fmt.Errorf("another bootstrap process holds %s", lockPath)
		}
		stalePath := fmt.Sprintf("%s.stale-%d", lockPath, time.Now().UnixNano())
		if err := os.Rename(lockPath, stalePath); err != nil {
			return nil, fmt.Errorf("recover stale bootstrap lock: %w", err)
		}
		defer os.RemoveAll(stalePath)
	}
	return nil, fmt.Errorf("could not acquire bootstrap lock after stale-lock recovery")
}

func lockOwnerAlive(path string) (bool, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return false, false
	}
	text := strings.TrimSpace(string(data))
	if !strings.HasPrefix(text, "pid=") {
		return false, false
	}
	pid, err := strconv.Atoi(strings.TrimPrefix(text, "pid="))
	if err != nil || pid <= 0 {
		return false, false
	}
	err = syscall.Kill(pid, 0)
	if err == nil || errors.Is(err, syscall.EPERM) {
		return true, true
	}
	if errors.Is(err, syscall.ESRCH) {
		return false, true
	}
	return true, true
}
