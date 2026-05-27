// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_BrowserLauncher.py
// - ./go/modcdp/launcher/BrowserLauncher_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import { describe, expect, it } from "vitest";

import { BrowserLauncher } from "../src/launcher/BrowserLauncher.js";

describe("BrowserLauncher", () => {
  it("merges config and exposes upstream config", async () => {
    const launcher = new BrowserLauncher({
      launcher_remote_cdp_url: "ws://127.0.0.1:9222/devtools/browser/initial",
      launcher_local_user_data_dir: "/tmp/modcdp-browser-launcher",
    });
    launcher.update({
      launcher_remote_cdp_url: "ws://127.0.0.1:9222/devtools/browser/updated",
    });

    expect(launcher.configForUpstream().upstream_ws_cdp_url).toBe("ws://127.0.0.1:9222/devtools/browser/updated");
    expect(launcher.config.launcher_local_user_data_dir).toEqual("/tmp/modcdp-browser-launcher");
    await expect(launcher.launch()).rejects.toThrow("BrowserLauncher.launch is not implemented.");
  });

  it("carries remote CDP config separately from launch args", async () => {
    const launcher = new BrowserLauncher({
      launcher_remote_cdp_url: "ws://127.0.0.1:9222/devtools/browser/initial",
    });
    launcher.update({
      launcher_remote_cdp_url: "ws://127.0.0.1:9222/devtools/browser/updated",
    });

    expect(launcher.config.launcher_remote_cdp_url).toEqual("ws://127.0.0.1:9222/devtools/browser/updated");
  });
});
