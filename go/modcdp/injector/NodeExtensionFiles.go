// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/injector/NodeExtensionFiles.ts
// - ./python/modcdp/injector/NodeExtensionFiles.py
package injector

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

//go:embed extension.zip
var bundledExtensionZip []byte

type PreparedExtension struct {
	UnpackedExtensionPath string
	CleanupPath           string
}

func DefaultModCDPExtensionPath() string {
	return ""
}

func PrepareUnpackedExtension(extensionPath string) (*PreparedExtension, error) {
	dir, err := os.MkdirTemp("", "modcdp-extension-")
	if err != nil {
		return nil, err
	}
	if extensionPath == "" {
		reader, err := zip.NewReader(bytes.NewReader(bundledExtensionZip), int64(len(bundledExtensionZip)))
		if err != nil {
			_ = os.RemoveAll(dir)
			return nil, err
		}
		if err := extractZipFiles(reader.File, dir); err != nil {
			_ = os.RemoveAll(dir)
			return nil, err
		}
		return &PreparedExtension{UnpackedExtensionPath: extensionRoot(dir), CleanupPath: dir}, nil
	}
	if !strings.HasSuffix(extensionPath, ".zip") {
		if err := copyDir(extensionPath, dir); err != nil {
			_ = os.RemoveAll(dir)
			return nil, err
		}
		return &PreparedExtension{UnpackedExtensionPath: extensionRoot(dir), CleanupPath: dir}, nil
	}
	reader, err := zip.OpenReader(extensionPath)
	if err != nil {
		_ = os.RemoveAll(dir)
		return nil, err
	}
	defer reader.Close()
	if err := extractZipFiles(reader.File, dir); err != nil {
		_ = os.RemoveAll(dir)
		return nil, err
	}
	return &PreparedExtension{UnpackedExtensionPath: extensionRoot(dir), CleanupPath: dir}, nil
}

func ExtensionIDFromManifestKey(extensionPath string) (string, error) {
	manifestBytes, err := os.ReadFile(filepath.Join(extensionPath, "manifest.json"))
	if err != nil {
		return "", nil
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		return "", err
	}
	key, _ := manifest["key"].(string)
	if strings.TrimSpace(key) == "" {
		return "", nil
	}
	keyBytes, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(keyBytes)
	alphabet := "abcdefghijklmnop"
	result := strings.Builder{}
	for _, value := range digest[:16] {
		result.WriteByte(alphabet[value>>4])
		result.WriteByte(alphabet[value&0x0f])
	}
	return result.String(), nil
}

func extractZipFiles(files []*zip.File, dir string) error {
	root, err := filepath.Abs(dir)
	if err != nil {
		return err
	}
	for _, file := range files {
		targetPath, err := safeZipTarget(root, file.Name)
		if err != nil {
			return err
		}
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return err
		}
		src, err := file.Open()
		if err != nil {
			return err
		}
		dst, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, file.FileInfo().Mode())
		if err != nil {
			_ = src.Close()
			return err
		}
		_, copyErr := io.Copy(dst, src)
		srcErr := src.Close()
		dstErr := dst.Close()
		if copyErr != nil {
			return copyErr
		}
		if srcErr != nil {
			return srcErr
		}
		if dstErr != nil {
			return dstErr
		}
	}
	return nil
}

func safeZipTarget(root string, name string) (string, error) {
	cleanName := filepath.Clean(name)
	if filepath.IsAbs(cleanName) || cleanName == "." || cleanName == ".." || strings.HasPrefix(cleanName, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("zip entry %q escapes extension extraction directory", name)
	}
	targetPath := filepath.Join(root, cleanName)
	targetAbs, err := filepath.Abs(targetPath)
	if err != nil {
		return "", err
	}
	if targetAbs != root && !strings.HasPrefix(targetAbs, root+string(os.PathSeparator)) {
		return "", fmt.Errorf("zip entry %q escapes extension extraction directory", name)
	}
	return targetAbs, nil
}

func extensionRoot(unpackedPath string) string {
	if _, err := os.Stat(filepath.Join(unpackedPath, "manifest.json")); err == nil {
		return unpackedPath
	}
	nested := filepath.Join(unpackedPath, "extension")
	if _, err := os.Stat(filepath.Join(nested, "manifest.json")); err == nil {
		return nested
	}
	return unpackedPath
}

func copyDir(src string, dst string) error {
	return filepath.WalkDir(src, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, relative)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		sourceFile, err := os.Open(path)
		if err != nil {
			return err
		}
		defer sourceFile.Close()
		targetFile, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, info.Mode())
		if err != nil {
			return err
		}
		defer targetFile.Close()
		_, err = io.Copy(targetFile, sourceFile)
		return err
	})
}
