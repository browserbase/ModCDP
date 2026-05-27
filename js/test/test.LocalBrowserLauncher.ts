// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_LocalBrowserLauncher.py
// - ./go/modcdp/launcher/LocalBrowserLauncher_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { LocalBrowserLauncher } from "../src/launcher/LocalBrowserLauncher.js";
import { WSUpstreamTransport } from "../src/transport/WSUpstreamTransport.js";

const LIVE_BROWSER_TIMEOUT_MS = 60_000;

describe("LocalBrowserLauncher", () => {
  it("class helpers match the local launcher surface", async () => {
    expect(LocalBrowserLauncher.findChromeBinary()).toEqual(expect.any(String));
    expect(await LocalBrowserLauncher.freePort()).toEqual(expect.any(Number));
  });

  it(
    "launches a real browser over a chosen CDP port and explicit profile dir",
    { timeout: LIVE_BROWSER_TIMEOUT_MS },
    async () => {
      const userDataDir = await mkdtemp(path.join(tmpdir(), "modcdp-local-profile-"));
      const port = await LocalBrowserLauncher.freePort();
      const chrome = await new LocalBrowserLauncher({
        launcher_local_headless: true,
        launcher_local_chrome_ready_timeout_ms: 45_000,
        launcher_local_chrome_ready_poll_interval_ms: 50,
      }).launch({
        launcher_local_cdp_listen_port: port,
        launcher_local_user_data_dir: userDataDir,
      });
      const cdp = new WSUpstreamTransport({ upstream_ws_cdp_url: chrome.cdp_url });

      try {
        expect(chrome.cdp_listen_port).toBe(port);
        expect(chrome.cdp_url).toEqual(expect.stringMatching(new RegExp(`^ws://127\\.0\\.0\\.1:${port}/`)));
        expect(chrome.profile_dir).toBe(userDataDir);
        await expect(stat(userDataDir)).resolves.toBeTruthy();
        await cdp.connect();
        await expectCdpBrowserSurface(cdp);
      } finally {
        await cdp.close();
        await chrome.close();
        await chrome.close();
        await expectHttpEndpointDown(`http://127.0.0.1:${port}`);
        await expect(stat(userDataDir)).resolves.toBeTruthy();
        await rm(userDataDir, { recursive: true, force: true });
      }
    },
  );

  it(
    "removes an explicit user data dir when cleanup_user_data_dir is set",
    { timeout: LIVE_BROWSER_TIMEOUT_MS },
    async () => {
      const userDataDir = await mkdtemp(path.join(tmpdir(), "modcdp-local-profile-"));
      const chrome = await new LocalBrowserLauncher({
        launcher_local_headless: true,
        launcher_local_chrome_ready_timeout_ms: 45_000,
      }).launch({
        launcher_local_user_data_dir: userDataDir,
        launcher_local_cleanup_user_data_dir: true,
      });

      try {
        expect(chrome.profile_dir).toBe(userDataDir);
        await expect(stat(userDataDir)).resolves.toBeTruthy();
      } finally {
        await chrome.close();
      }

      await expect(stat(userDataDir)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );
});

// MODCDP_TEST_SUPPORT: LANGUAGE-SPECIFIC TEST SUPPORT ONLY.
// Keep the setup semantics above 1:1 with translated tests; helpers here only use real ModCDP transports against real browser endpoints.
async function expectCdpBrowserSurface(cdp: WSUpstreamTransport) {
  const version = await cdp.send("Browser.getVersion");
  expect(version.product).toEqual(expect.stringMatching(/Chrome|Chromium/));
  expect(version.protocolVersion).toEqual(expect.any(String));

  const created = await cdp.send("Target.createTarget", { url: "about:blank#modcdp-launcher-test" });
  expect(created.targetId).toEqual(expect.any(String));
  const targetId = created.targetId as string;

  try {
    const attached = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    expect(attached.sessionId).toEqual(expect.any(String));
    const sessionId = attached.sessionId as string;
    await cdp.send("Runtime.enable", {}, sessionId);
    const evaluated = await cdp.send(
      "Runtime.evaluate",
      { expression: "(() => ({ ok: true, value: 42 }))()", returnByValue: true },
      sessionId,
    );
    expect(evaluated.result).toMatchObject({ type: "object", value: { ok: true, value: 42 } });
  } finally {
    await cdp.send("Target.closeTarget", { targetId }).catch(() => ({}));
  }
}

async function expectHttpEndpointDown(url: string) {
  await expect
    .poll(
      async () => {
        try {
          await fetch(`${url}/json/version`);
          return false;
        } catch {
          return true;
        }
      },
      { timeout: 5_000, interval: 100 },
    )
    .toBe(true);
}
