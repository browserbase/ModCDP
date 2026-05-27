// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_NoneBrowserLauncher.py
// - ./go/modcdp/launcher/NoneBrowserLauncher_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import { test } from "vitest";

import { NoneBrowserLauncher } from "../src/launcher/NoneBrowserLauncher.js";

test("NoneBrowserLauncher records an empty launched browser", async () => {
  const launcher = new NoneBrowserLauncher();
  const launched = await launcher.launch();

  assert.equal(launched.cdp_url, null);
  assert.equal(launcher.launched, launched);
  await launched.close();
});
