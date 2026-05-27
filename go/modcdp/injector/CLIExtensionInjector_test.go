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
	"github.com/browserbase/modcdp/go/modcdp/launcher"
	"github.com/browserbase/modcdp/go/modcdp/transport"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const doesNotExistExtensionID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func TestCLIExtensionInjectorRejectsZipEntriesOutsideExtractionDirectory(t *testing.T) {
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

func TestCLIExtensionInjectorPreparesAnUnpackedExtensionDirectoryForLoadExtension(t *testing.T) {
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

func TestCLIExtensionInjectorPreparesTheDefaultExtensionZipForLoadExtension(t *testing.T) {
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

func TestCLIExtensionInjectorReturnsNullWhenATrustedDoesNotExistExtensionIDIsAbsentInARealBrowser(t *testing.T) {
	extensionPath, err := filepath.Abs(filepath.Join("..", "..", "..", "dist", "extension"))
	if err != nil {
		t.Fatal(err)
	}
	headless := true
	injector := NewCLIExtensionInjector(InjectorConfig{
		InjectorCLIExtensionPath:            extensionPath,
		InjectorCLIExtensionID:              doesNotExistExtensionID,
		InjectorTrustServiceWorkerTarget:    true,
		InjectorServiceWorkerReadyTimeoutMS: 250,
		InjectorServiceWorkerPollIntervalMS: 25,
	})
	if err := injector.Prepare(); err != nil {
		t.Fatal(err)
	}
	defer injector.Close()

	browserLauncher := launcher.NewLocalBrowserLauncher(launcher.LauncherConfig{
		LauncherLocalHeadless:       &headless,
		LauncherLocalExecutablePath: loadExtensionTestBrowserPath(t),
	})
	browserLauncher.Update(injector.ConfigForLauncher())
	if _, err := browserLauncher.Launch(launcher.LauncherConfig{}); err != nil {
		t.Fatal(err)
	}
	defer browserLauncher.Close()

	upstream := transport.NewWSUpstreamTransport(transport.UpstreamTransportConfig{})
	upstream.Update(browserLauncher.ConfigForUpstream())
	if err := upstream.Connect(); err != nil {
		t.Fatal(err)
	}
	defer upstream.Close()
	injector.Update(InjectorConfig{
		Send: func(method string, params map[string]any, sessionID string) (map[string]any, error) {
			return upstream.Send(method, params, sessionID)
		},
	})

	targets, err := upstream.Send("Target.getTargets", map[string]any{}, "")
	if err != nil {
		t.Fatal(err)
	}
	targetInfos, _ := targets["targetInfos"].([]any)
	for _, rawTarget := range targetInfos {
		target, _ := rawTarget.(map[string]any)
		if target == nil {
			continue
		}
		targetURL, _ := target["url"].(string)
		if strings.HasPrefix(targetURL, "chrome-extension://"+doesNotExistExtensionID+"/") {
			t.Fatalf("found does-not-exist extension target: %#v", target)
		}
	}

	result, err := injector.Inject()
	if err != nil {
		t.Fatal(err)
	}
	if result != nil {
		t.Fatalf("result = %#v", result)
	}
}
