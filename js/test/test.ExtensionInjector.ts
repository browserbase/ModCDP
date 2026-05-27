// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_ExtensionInjector.py
// - ./go/modcdp/injector/ExtensionInjector_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import { test } from "vitest";

import { ExtensionInjector } from "../src/injector/ExtensionInjector.js";

class ProbeExtensionInjector extends ExtensionInjector {
  matches(target: { type?: string; url?: string }) {
    return this.serviceWorkerTargetMatches(target);
  }
}

test("ExtensionInjector owns shared injector config", async () => {
  const injector = new ProbeExtensionInjector({
    injector_service_worker_extension_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
  });

  try {
    assert.equal(injector.config.injector_service_worker_extension_id, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.deepEqual(injector.extra_args, []);
    assert.equal(
      injector.matches({
        type: "service_worker",
        url: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/modcdp/service_worker.js",
      }),
      true,
    );
    assert.equal(
      injector.matches({
        type: "service_worker",
        url: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/background.js",
      }),
      false,
    );
  } finally {
    await injector.close();
  }
});

test("ExtensionInjector base inject reports the subclass name", async () => {
  await assert.rejects(() => new ExtensionInjector().inject(), /ExtensionInjector\.inject is not implemented/);
});
