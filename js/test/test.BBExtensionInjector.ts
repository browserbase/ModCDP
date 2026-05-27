// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_BBExtensionInjector.py
// - ./go/modcdp/injector/BBExtensionInjector_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import { ModCDPClient } from "../src/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, "..", "..", "dist", "extension");

describe("BBExtensionInjector", () => {
  it(
    "uploads the real extension and launches a Browserbase browser with it installed",
    { timeout: 180_000 },
    async () => {
      assert.ok(process.env.BROWSERBASE_API_KEY?.trim(), "BROWSERBASE_API_KEY is required for live Browserbase tests");
      const cdp = new ModCDPClient({
        launcher: {
          launcher_mode: "bb",
          launcher_bb_timeout: 120,
          ...(process.env.BROWSERBASE_REGION ? { launcher_bb_region: process.env.BROWSERBASE_REGION } : {}),
        },
        upstream: { upstream_mode: "ws" },
        injector: {
          injector_mode: "bb",
          injector_bb_extension_path: EXTENSION_PATH,
          injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
          injector_trust_service_worker_target: true,
        },
      });

      try {
        await cdp.connect();
        assert.equal(cdp.connect_timing?.injector_source, "bb");
        assert.equal(typeof cdp.injector?.extension_id, "string");
        const service_worker_url = await cdp.Mod.evaluate({
          expression: "chrome.runtime.getURL('modcdp/service_worker.js')",
        });
        assert.match(String(service_worker_url), /^chrome-extension:\/\/[a-z]{32}\/modcdp\/service_worker\.js$/);
      } finally {
        await cdp.close();
      }
    },
  );
});
