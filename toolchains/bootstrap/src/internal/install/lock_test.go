package install

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeLockOwner(t *testing.T, tools string, pid int) string {
	t.Helper()
	lock := filepath.Join(tools, ".orbital-bootstrap.lock")
	if err := os.Mkdir(lock, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(lock, "owner"), []byte(fmt.Sprintf("pid=%d\n", pid)), 0o600); err != nil {
		t.Fatal(err)
	}
	return lock
}

func TestAcquireLockRejectsLiveOwner(t *testing.T) {
	tools := t.TempDir()
	lock := writeLockOwner(t, tools, os.Getpid())
	_, err := acquireLock(tools)
	if err == nil || !strings.Contains(err.Error(), "another bootstrap process") {
		t.Fatalf("acquireLock() error = %v", err)
	}
	if _, err := os.Stat(lock); err != nil {
		t.Fatalf("live lock was changed: %v", err)
	}
}

func TestAcquireLockRecoversDeadOwnerAndReleaseRemovesLock(t *testing.T) {
	tools := t.TempDir()
	lock := writeLockOwner(t, tools, 2_147_483_647)
	release, err := acquireLock(tools)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(lock); err != nil {
		t.Fatalf("replacement lock is absent: %v", err)
	}
	if err := release(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(lock); !os.IsNotExist(err) {
		t.Fatalf("release left lock behind: %v", err)
	}
}
