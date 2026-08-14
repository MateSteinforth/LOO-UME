package archive

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"

	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/manifest"
	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/safepath"
)

type entryKind byte

const ReceiptFileName = ".orbital-bootstrap-receipt.json"

const (
	directory entryKind = iota
	regular
	symlink
	hardlink
)

type entry struct {
	name       string
	kind       entryKind
	mode       os.FileMode
	size       int64
	linkTarget string
}

type plan struct {
	entries map[string]entry
	ordered []entry
}

func ExtractTarGz(archivePath, destination string, policy manifest.Extraction) error {
	installPlan, err := inspect(archivePath, policy)
	if err != nil {
		return err
	}
	if err := os.Mkdir(destination, 0o700); err != nil {
		return fmt.Errorf("create extraction root: %w", err)
	}
	if err := extractRegularContent(archivePath, destination, policy, installPlan); err != nil {
		return err
	}
	if err := createLinks(destination, installPlan); err != nil {
		return err
	}
	return nil
}

func inspect(archivePath string, policy manifest.Extraction) (*plan, error) {
	reader, closeReader, err := openTarGz(archivePath)
	if err != nil {
		return nil, err
	}
	defer closeReader()
	result := &plan{entries: map[string]entry{}}
	collisionNames := map[string]string{}
	var expanded int64
	for count := 0; ; count++ {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read tar header: %w", err)
		}
		if len(header.PAXRecords) != 0 || len(header.Xattrs) != 0 {
			return nil, fmt.Errorf("archive entry %q uses PAX or extended attributes", header.Name)
		}
		if count >= policy.MaximumEntries {
			return nil, fmt.Errorf("archive exceeds the %d-entry limit", policy.MaximumEntries)
		}
		name, skip, err := stripRoot(header.Name, policy.RootDirectory)
		if err != nil {
			return nil, err
		}
		if skip {
			if header.Typeflag != tar.TypeDir {
				return nil, fmt.Errorf("archive root is not a directory")
			}
			continue
		}
		if safepath.CollisionKey(name) == ReceiptFileName {
			return nil, fmt.Errorf("archive entry %q uses the reserved receipt path", header.Name)
		}
		if header.Mode&0o7000 != 0 {
			return nil, fmt.Errorf("archive entry %q has privileged mode bits", header.Name)
		}
		item := entry{name: name, size: header.Size}
		switch header.Typeflag {
		case tar.TypeDir:
			item.kind = directory
			item.mode = 0o755
			if header.Size != 0 {
				return nil, fmt.Errorf("archive directory %q contains data", header.Name)
			}
		case tar.TypeReg, tar.TypeRegA:
			item.kind = regular
			item.mode = 0o644
			if header.Size < 0 || header.Size > policy.MaximumEntrySize {
				return nil, fmt.Errorf("archive entry %q exceeds its size limit", header.Name)
			}
			expanded += header.Size
			if expanded < 0 || expanded > policy.MaximumBytes {
				return nil, fmt.Errorf("archive exceeds its expanded-size limit")
			}
		case tar.TypeSymlink:
			item.kind = symlink
			item.linkTarget, err = resolveSymlink(name, header.Linkname)
			if err != nil {
				return nil, fmt.Errorf("unsafe symbolic link %q: %w", header.Name, err)
			}
		case tar.TypeLink:
			item.kind = hardlink
			item.linkTarget, err = stripHardlinkRoot(header.Linkname, policy.RootDirectory)
			if err != nil {
				return nil, fmt.Errorf("unsafe hard link %q: %w", header.Name, err)
			}
		default:
			return nil, fmt.Errorf("archive entry %q has unsupported type %d", header.Name, header.Typeflag)
		}
		key := safepath.CollisionKey(name)
		if previous, exists := collisionNames[key]; exists {
			return nil, fmt.Errorf("archive paths %q and %q collide", previous, name)
		}
		collisionNames[key] = name
		result.entries[name] = item
		result.ordered = append(result.ordered, item)
	}
	archiveInfo, err := os.Stat(archivePath)
	if err != nil || archiveInfo.Size() <= 0 {
		return nil, fmt.Errorf("read archive size for compression bound: %w", err)
	}
	ratioLimit := archiveInfo.Size() * int64(policy.MaximumCompressionRatio)
	if ratioLimit < archiveInfo.Size() || expanded > ratioLimit {
		return nil, fmt.Errorf("archive exceeds its %d:1 compression-ratio limit", policy.MaximumCompressionRatio)
	}
	if len(result.ordered) == 0 {
		return nil, fmt.Errorf("archive contains no installable entries")
	}
	for _, item := range result.ordered {
		for parent := path.Dir(item.name); parent != "."; parent = path.Dir(parent) {
			if ancestor, exists := result.entries[parent]; exists && ancestor.kind != directory {
				return nil, fmt.Errorf("archive path %q is below a non-directory", item.name)
			}
		}
		if item.kind == symlink || item.kind == hardlink {
			if _, exists := result.entries[item.linkTarget]; !exists {
				return nil, fmt.Errorf("archive link %q has missing target %q", item.name, item.linkTarget)
			}
			if _, err := resolveFinalTarget(item.name, result.entries, map[string]bool{}); err != nil {
				return nil, err
			}
		}
	}
	return result, nil
}

func openTarGz(archivePath string) (*tar.Reader, func(), error) {
	file, err := os.Open(archivePath)
	if err != nil {
		return nil, nil, fmt.Errorf("open tar.gz archive: %w", err)
	}
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		file.Close()
		return nil, nil, fmt.Errorf("open gzip stream: %w", err)
	}
	gzipReader.Multistream(false)
	return tar.NewReader(gzipReader), func() {
		gzipReader.Close()
		file.Close()
	}, nil
}

func stripRoot(name, root string) (string, bool, error) {
	cleanName, err := safepath.Validate(name, true)
	if err != nil {
		return "", false, fmt.Errorf("unsafe archive path %q: %w", name, err)
	}
	if cleanName == root {
		return "", true, nil
	}
	prefix := root + "/"
	if !strings.HasPrefix(cleanName, prefix) {
		return "", false, fmt.Errorf("archive path %q is outside root %q", name, root)
	}
	relative := strings.TrimPrefix(cleanName, prefix)
	if _, err := safepath.Validate(relative, false); err != nil {
		return "", false, fmt.Errorf("unsafe stripped archive path %q: %w", relative, err)
	}
	return relative, false, nil
}

func resolveSymlink(name, target string) (string, error) {
	if target == "" || strings.HasPrefix(target, "/") || strings.Contains(target, "\\") {
		return "", fmt.Errorf("target is empty, absolute, or uses a backslash")
	}
	for _, r := range target {
		if r < 0x20 || r > 0x7e {
			return "", fmt.Errorf("target is not portable ASCII")
		}
	}
	resolved := path.Clean(path.Join(path.Dir(name), target))
	if resolved == "." || resolved == ".." || strings.HasPrefix(resolved, "../") {
		return "", fmt.Errorf("target escapes the archive root")
	}
	if _, err := safepath.Validate(resolved, false); err != nil {
		return "", err
	}
	return resolved, nil
}

func stripHardlinkRoot(target, root string) (string, error) {
	relative, skip, err := stripRoot(target, root)
	if err != nil {
		return "", err
	}
	if skip {
		return "", fmt.Errorf("hard link targets the archive root")
	}
	return relative, nil
}

func resolveFinalTarget(name string, entries map[string]entry, visiting map[string]bool) (entry, error) {
	if visiting[name] {
		return entry{}, fmt.Errorf("archive link cycle includes %q", name)
	}
	visiting[name] = true
	item := entries[name]
	if item.kind == symlink || item.kind == hardlink {
		resolved, err := resolveFinalTarget(item.linkTarget, entries, visiting)
		delete(visiting, name)
		return resolved, err
	}
	delete(visiting, name)
	return item, nil
}

func extractRegularContent(archivePath, destination string, policy manifest.Extraction, installPlan *plan) error {
	for _, item := range installPlan.ordered {
		if item.kind == directory {
			if err := ensureArchiveDirectory(destination, item.name); err != nil {
				return fmt.Errorf("create archive directory %q: %w", item.name, err)
			}
		}
	}
	reader, closeReader, err := openTarGz(archivePath)
	if err != nil {
		return err
	}
	defer closeReader()
	for {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("read tar content: %w", err)
		}
		name, skip, err := stripRoot(header.Name, policy.RootDirectory)
		if err != nil {
			return err
		}
		if skip || installPlan.entries[name].kind != regular {
			continue
		}
		item := installPlan.entries[name]
		filePath := localPath(destination, name)
		if err := ensureArchiveDirectory(destination, path.Dir(name)); err != nil {
			return fmt.Errorf("create parent for %q: %w", name, err)
		}
		file, err := os.OpenFile(filePath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, item.mode)
		if err != nil {
			return fmt.Errorf("create archive file %q: %w", name, err)
		}
		written, copyErr := io.Copy(file, io.LimitReader(reader, item.size+1))
		closeErr := file.Close()
		if copyErr != nil || written != item.size || closeErr != nil {
			return fmt.Errorf("write archive file %q: copied %d of %d bytes: %v %v", name, written, item.size, copyErr, closeErr)
		}
		if err := os.Chmod(filePath, item.mode); err != nil {
			return fmt.Errorf("set archive file mode %q: %w", name, err)
		}
	}
	return nil
}

func createLinks(destination string, installPlan *plan) error {
	for _, item := range installPlan.ordered {
		if item.kind != hardlink {
			continue
		}
		final, err := resolveFinalTarget(item.name, installPlan.entries, map[string]bool{})
		if err != nil || final.kind != regular {
			return fmt.Errorf("hard link %q does not resolve to a regular file", item.name)
		}
		if err := ensureArchiveDirectory(destination, path.Dir(item.name)); err != nil {
			return err
		}
		if err := os.Link(localPath(destination, final.name), localPath(destination, item.name)); err != nil {
			return fmt.Errorf("create hard link %q: %w", item.name, err)
		}
	}
	for _, item := range installPlan.ordered {
		if item.kind != symlink {
			continue
		}
		if err := ensureArchiveDirectory(destination, path.Dir(item.name)); err != nil {
			return err
		}
		relativeTarget, err := filepath.Rel(filepath.Dir(localPath(destination, item.name)), localPath(destination, item.linkTarget))
		if err != nil {
			return err
		}
		if err := os.Symlink(relativeTarget, localPath(destination, item.name)); err != nil {
			return fmt.Errorf("create symbolic link %q: %w", item.name, err)
		}
	}
	return nil
}

func ensureArchiveDirectory(root, relative string) error {
	if relative == "." || relative == "" {
		return nil
	}
	current := root
	for _, segment := range strings.Split(relative, "/") {
		current = filepath.Join(current, segment)
		info, err := os.Lstat(current)
		if os.IsNotExist(err) {
			if err := os.Mkdir(current, 0o755); err != nil {
				return err
			}
			info, err = os.Lstat(current)
		}
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return fmt.Errorf("archive parent %q is not a real directory", relative)
		}
		if err := os.Chmod(current, 0o755); err != nil {
			return err
		}
	}
	return nil
}

func localPath(root, relative string) string {
	return filepath.Join(root, filepath.FromSlash(relative))
}

func TreeSHA256(root string) (string, error) {
	type item struct {
		path string
		info os.FileInfo
	}
	items := []item{}
	collisions := map[string]string{}
	err := filepath.Walk(root, func(current string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if current == root {
			return nil
		}
		relative, err := filepath.Rel(root, current)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		if relative == ".orbital-bootstrap-receipt.json" {
			return nil
		}
		if _, err := safepath.Validate(relative, false); err != nil {
			return err
		}
		key := safepath.CollisionKey(relative)
		if previous, exists := collisions[key]; exists {
			return fmt.Errorf("installed paths %q and %q collide", previous, relative)
		}
		collisions[key] = relative
		if !(info.Mode().IsRegular() || info.IsDir() || info.Mode()&os.ModeSymlink != 0) {
			return fmt.Errorf("installed path %q has unsupported type", relative)
		}
		items = append(items, item{path: relative, info: info})
		return nil
	})
	if err != nil {
		return "", err
	}
	sort.Slice(items, func(i, j int) bool { return items[i].path < items[j].path })
	treeHash := sha256.New()
	for _, item := range items {
		kind := "f"
		var payload string
		mode := item.info.Mode().Perm()
		switch {
		case item.info.IsDir():
			kind = "d"
		case item.info.Mode()&os.ModeSymlink != 0:
			kind = "l"
			mode = 0
			target, err := os.Readlink(localPath(root, item.path))
			if err != nil {
				return "", err
			}
			payload = filepath.ToSlash(target)
		default:
			file, err := os.Open(localPath(root, item.path))
			if err != nil {
				return "", err
			}
			fileHash := sha256.New()
			_, copyErr := io.Copy(fileHash, file)
			closeErr := file.Close()
			if copyErr != nil || closeErr != nil {
				return "", fmt.Errorf("hash installed file %q: %v %v", item.path, copyErr, closeErr)
			}
			payload = hex.EncodeToString(fileHash.Sum(nil))
		}
		fmt.Fprintf(treeHash, "%s\x00%s\x00%03o\x00%s\x00", kind, item.path, mode, payload)
	}
	return hex.EncodeToString(treeHash.Sum(nil)), nil
}
