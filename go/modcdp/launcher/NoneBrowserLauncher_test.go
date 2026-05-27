// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./js/test/test.NoneBrowserLauncher.ts
// - ./python/tests/test_NoneBrowserLauncher.py
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
package launcher

import "testing"

func TestNoneBrowserLauncherRecordsAnEmptyLaunchedBrowser(t *testing.T) {
	launcher := NewNoneBrowserLauncher(LauncherConfig{})

	launched, err := launcher.Launch(LauncherConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if launched.CDPURL != "" {
		t.Fatalf("launched.CDPURL = %q", launched.CDPURL)
	}
	if launcher.Launched != launched {
		t.Fatal("expected launcher to retain launched browser")
	}
	launched.Close()
}
