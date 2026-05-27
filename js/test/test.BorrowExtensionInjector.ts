// MODCDP_TS_ONLY_TEST: DO NOT TRANSLATE THIS TEST FILE TO OTHER LANGUAGES.
// Reason: not needed by Stagehand.
// If a translated sibling is added, all test cases, descriptions, covered edge cases, and setup must be kept perfectly 1:1 in sync.
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { ModCDPClient } from "../src/index.js";
import { extension_injector_constructors } from "../src/client/ModCDPClient.js";
import { BorrowExtensionInjector } from "../src/injector/BorrowExtensionInjector.js";
import { loadExtensionTestBrowserPath } from "./browserPaths.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, "..", "..", "dist", "extension");
const LOAD_EXTENSION_TEST_BROWSER_PATH = loadExtensionTestBrowserPath();
extension_injector_constructors.set("borrow", BorrowExtensionInjector);

test("BorrowExtensionInjector bootstraps ModCDP inside a live extension service worker", async () => {
  const owner = new ModCDPClient({
    launcher: {
      launcher_mode: "local",
      launcher_local_headless: true,
      launcher_local_executable_path: LOAD_EXTENSION_TEST_BROWSER_PATH,
    },
    upstream: { upstream_mode: "ws" },
    injector: {
      injector_mode: "cli",
      injector_cli_extension_path: EXTENSION_PATH,
      injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
      injector_trust_service_worker_target: true,
    },
  });
  let cdp: ModCDPClient | null = null;

  try {
    await owner.connect();
    cdp = new ModCDPClient({
      launcher: { launcher_mode: "remote", launcher_remote_cdp_url: owner.upstream.config.upstream_ws_cdp_url },
      upstream: { upstream_mode: "ws", upstream_ws_cdp_url: owner.upstream.config.upstream_ws_cdp_url },
      injector: {
        injector_mode: "borrow",
        injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
        injector_trust_service_worker_target: true,
      } as any,
    });
    await cdp.connect();
    assert.equal(cdp.connect_timing?.injector_source, "borrow");
    assert.equal(cdp.injector?.extension_id, "mdedooklbnfejodmnhmkdpkaedafkehf");
    assert.equal(
      await cdp.Mod.evaluate({ expression: "chrome.runtime.getURL('modcdp/service_worker.js')" }),
      "chrome-extension://mdedooklbnfejodmnhmkdpkaedafkehf/modcdp/service_worker.js",
    );
  } finally {
    await cdp?.close();
    await owner.close();
  }
}, 60_000);
