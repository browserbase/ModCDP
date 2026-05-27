// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.CDPExtensionInjector.ts
// - ./python/tests/test_CDPExtensionInjector.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package injector_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	. "github.com/browserbase/modcdp/go/modcdp/injector"
)

func TestCDPExtensionInjectorPreparesTheDefaultPackagedExtensionZip(t *testing.T) {
	injector := NewCDPExtensionInjector(InjectorConfig{})
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
}
