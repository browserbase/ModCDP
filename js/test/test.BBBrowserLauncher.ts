// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_BBBrowserLauncher.py
// - ./go/modcdp/launcher/BBBrowserLauncher_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import { describe, expect, it } from "vitest";

import { BBBrowserLauncher } from "../src/launcher/BBBrowserLauncher.js";
import { WSUpstreamTransport } from "../src/transport/WSUpstreamTransport.js";

const LIVE_BROWSERBASE_TIMEOUT_MS = 120_000;

describe("BBBrowserLauncher", () => {
  it(
    "creates, verifies, resumes, and releases a real Browserbase browser session",
    { timeout: LIVE_BROWSERBASE_TIMEOUT_MS },
    async () => {
      expect(
        process.env.BROWSERBASE_API_KEY?.trim(),
        "BROWSERBASE_API_KEY is required for live Browserbase tests",
      ).toBeTruthy();
      const launcher = new BBBrowserLauncher({
        launcher_bb_timeout: 120,
        ...(process.env.BROWSERBASE_REGION ? { launcher_bb_region: process.env.BROWSERBASE_REGION } : {}),
        launcher_bb_browser_settings: {
          viewport: { width: 900, height: 700 },
          recordSession: false,
        },
        launcher_bb_user_metadata: {
          modcdp_launcher_test: "BBBrowserLauncher",
        },
      });
      const browser = await launcher.launch();
      const cdp = new WSUpstreamTransport({ upstream_ws_cdp_url: browser.cdp_url });
      let resumed: Awaited<ReturnType<BBBrowserLauncher["launch"]>> | null = null;
      const session_id = browser.browserbase_session_id;

      try {
        expect(session_id).toEqual(expect.any(String));
        expect(browser.browserbase_session_url).toContain(session_id);
        expect(browser.cdp_url).toEqual(expect.stringMatching(/^wss:\/\//));
        await cdp.connect();
        await expectCdpBrowserSurface(cdp);

        const retrieved = await retrieveBrowserbaseSession(session_id!);
        expect(retrieved.id).toBe(session_id);
        expect(retrieved.status).toBe("RUNNING");

        resumed = await new BBBrowserLauncher({
          launcher_bb_session_id: session_id,
          launcher_bb_close_session_on_close: false,
        }).launch();
        expect(resumed.browserbase_session_id).toBe(session_id);
        expect(resumed.cdp_url).toEqual(expect.stringMatching(/^wss:\/\//));
        await expectCdpBrowserSurface(cdp);
      } finally {
        await cdp.close();
        await resumed?.close();
        await browser.close();
        await browser.close();
      }

      await expect
        .poll(async () => (await retrieveBrowserbaseSession(session_id!)).status, { timeout: 30_000, interval: 1_000 })
        .not.toBe("RUNNING");
    },
  );
});

// MODCDP_TEST_SUPPORT: LANGUAGE-SPECIFIC TEST SUPPORT ONLY.
// Keep the setup semantics above 1:1 with translated tests; helpers here only use real ModCDP transports and real Browserbase APIs.
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

function browserbaseApiUrl(pathname: string) {
  return new URL(
    pathname,
    `${(process.env.BROWSERBASE_BASE_URL ?? "https://api.browserbase.com").replace(/\/$/, "")}/`,
  );
}

async function retrieveBrowserbaseSession(session_id: string) {
  const response = await fetch(browserbaseApiUrl(`/v1/sessions/${session_id}`), {
    headers: { "x-bb-api-key": process.env.BROWSERBASE_API_KEY! },
  });
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
  return (await response.json()) as Record<string, unknown>;
}
