// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.CLIExtensionInjector.ts
// - ./python/tests/test_CLIExtensionInjector.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package injector_test

import (
	"archive/zip"
	. "github.com/browserbase/modcdp/go/modcdp/injector"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCLIExtensionInjectorRejectsZipEntriesOutsideExtractionDir(t *testing.T) {
	tempDir := t.TempDir()
	zipPath := filepath.Join(tempDir, "extension.zip")
	file, err := os.Create(zipPath)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(file)
	entry, err := writer.Create("../evil.txt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := entry.Write([]byte("evil")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	injector := NewCLIExtensionInjector(InjectorConfig{InjectorCLIExtensionPath: zipPath})
	if err := injector.Prepare(); err == nil || !strings.Contains(err.Error(), "escapes extension extraction directory") {
		t.Fatalf("Prepare error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(tempDir, "evil.txt")); !os.IsNotExist(err) {
		t.Fatalf("outside file was created: %v", err)
	}
}

func TestCLIExtensionInjectorPreparesUnpackedExtensionDirectoryForLoadExtension(t *testing.T) {
	extensionPath, err := filepath.Abs(filepath.Join("..", "..", "..", "dist", "extension"))
	if err != nil {
		t.Fatal(err)
	}
	injector := NewCLIExtensionInjector(InjectorConfig{InjectorCLIExtensionPath: extensionPath})
	if err := injector.Prepare(); err != nil {
		t.Fatal(err)
	}
	defer injector.Close()

	if injector.UnpackedExtensionPath == "" {
		t.Fatal("expected UnpackedExtensionPath")
	}
	if injector.UnpackedExtensionPath == extensionPath {
		t.Fatalf("UnpackedExtensionPath = %q", injector.UnpackedExtensionPath)
	}
	if _, err := os.Stat(filepath.Join(injector.UnpackedExtensionPath, "manifest.json")); err != nil {
		t.Fatalf("expected unpacked manifest: %v", err)
	}
	if len(injector.ExtraArgs) != 1 || injector.ExtraArgs[0] != "--load-extension="+injector.UnpackedExtensionPath {
		t.Fatalf("ExtraArgs = %#v", injector.ExtraArgs)
	}
	if injector.Config.InjectorServiceWorkerExtensionID != DefaultModCDPExtensionID {
		t.Fatalf("InjectorServiceWorkerExtensionID = %q", injector.Config.InjectorServiceWorkerExtensionID)
	}
}

func TestCLIExtensionInjectorPreparesDefaultExtensionZipForLoadExtension(t *testing.T) {
	injector := NewCLIExtensionInjector(InjectorConfig{})
	if err := injector.Prepare(); err != nil {
		t.Fatal(err)
	}
	defer injector.Close()

	if injector.UnpackedExtensionPath == "" {
		t.Fatal("expected UnpackedExtensionPath")
	}
	if !strings.Contains(injector.UnpackedExtensionPath, "modcdp-extension-") {
		t.Fatalf("UnpackedExtensionPath = %q", injector.UnpackedExtensionPath)
	}
	if _, err := os.Stat(filepath.Join(injector.UnpackedExtensionPath, "manifest.json")); err != nil {
		t.Fatalf("expected unpacked manifest: %v", err)
	}
	if len(injector.ExtraArgs) != 1 || injector.ExtraArgs[0] != "--load-extension="+injector.UnpackedExtensionPath {
		t.Fatalf("ExtraArgs = %#v", injector.ExtraArgs)
	}
	if injector.Config.InjectorServiceWorkerExtensionID != DefaultModCDPExtensionID {
		t.Fatalf("InjectorServiceWorkerExtensionID = %q", injector.Config.InjectorServiceWorkerExtensionID)
	}
}

func TestCLIExtensionInjectorReturnsImmediatelyWhenLaunchedExtensionTargetIsAbsent(t *testing.T) {
	extensionPath, err := filepath.Abs(filepath.Join("..", "..", "..", "dist", "extension"))
	if err != nil {
		t.Fatal(err)
	}
	methods := []string{}
	injector := NewCLIExtensionInjector(InjectorConfig{
		InjectorCLIExtensionPath:            extensionPath,
		InjectorTrustServiceWorkerTarget:    true,
		InjectorServiceWorkerReadyTimeoutMS: 50,
		InjectorServiceWorkerPollIntervalMS: 10,
		Send: func(method string, params map[string]any, sessionID string) (map[string]any, error) {
			methods = append(methods, method)
			if method == "Target.getTargets" {
				return map[string]any{"targetInfos": []any{}}, nil
			}
			t.Fatalf("unexpected %s", method)
			return nil, nil
		},
	})
	if err := injector.Prepare(); err != nil {
		t.Fatal(err)
	}
	defer injector.Close()

	startedAt := time.Now()
	result, err := injector.Inject()
	if err != nil {
		t.Fatal(err)
	}
	elapsed := time.Since(startedAt)
	if result != nil {
		t.Fatalf("result = %#v", result)
	}
	uniqueMethods := map[string]bool{}
	for _, method := range methods {
		uniqueMethods[method] = true
	}
	if len(methods) == 0 || len(uniqueMethods) != 1 || !uniqueMethods["Target.getTargets"] {
		t.Fatalf("methods = %#v", methods)
	}
	if elapsed >= 200*time.Millisecond {
		t.Fatalf("Inject took %s", elapsed)
	}
}
