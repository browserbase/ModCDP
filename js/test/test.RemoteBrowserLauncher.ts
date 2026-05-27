// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_RemoteBrowserLauncher.py
// - ./go/modcdp/launcher/RemoteBrowserLauncher_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import { describe, expect, it } from "vitest";

import { LocalBrowserLauncher } from "../src/launcher/LocalBrowserLauncher.js";
import { RemoteBrowserLauncher } from "../src/launcher/RemoteBrowserLauncher.js";
import { WSUpstreamTransport } from "../src/transport/WSUpstreamTransport.js";

const LIVE_BROWSER_TIMEOUT_MS = 60_000;

describe("RemoteBrowserLauncher", () => {
  it("requires launcher_remote_cdp_url", async () => {
    await expect(new RemoteBrowserLauncher().launch()).rejects.toThrow(
      "launcher_mode=remote requires launcher_remote_cdp_url.",
    );
  });

  it(
    "connects to a real browser from both HTTP discovery and websocket CDP endpoints",
    { timeout: LIVE_BROWSER_TIMEOUT_MS },
    async () => {
      const local = await new LocalBrowserLauncher().launch({
        launcher_local_cdp_listen_port: await LocalBrowserLauncher.freePort(),
        launcher_local_headless: true,
        launcher_local_chrome_ready_timeout_ms: 45_000,
      });
      const cdp = new WSUpstreamTransport();

      try {
        const http_endpoint = `http://127.0.0.1:${local.cdp_listen_port}`;
        const bare_endpoint = `127.0.0.1:${local.cdp_listen_port}`;
        const fromHttp = await new RemoteBrowserLauncher({ launcher_remote_cdp_url: http_endpoint }).launch();
        expect(fromHttp.cdp_url).toBe(local.cdp_url);
        cdp.update({ upstream_ws_cdp_url: fromHttp.cdp_url });
        await cdp.connect();
        await expectCdpBrowserSurface(cdp);
        await fromHttp.close();

        const fromBare = await new RemoteBrowserLauncher({ launcher_remote_cdp_url: bare_endpoint }).launch();
        expect(fromBare.cdp_url).toBe(local.cdp_url);
        await fromBare.close();

        const fromConfig = await new RemoteBrowserLauncher({
          launcher_remote_cdp_url: local.cdp_url,
        }).launch();
        expect(fromConfig.cdp_url).toBe(local.cdp_url);
        await fromConfig.close();

        const fromWs = await new RemoteBrowserLauncher().launch({
          launcher_remote_cdp_url: local.cdp_url,
        });
        expect(fromWs.cdp_url).toBe(local.cdp_url);
        await expectCdpBrowserSurface(cdp);
        await fromWs.close();
      } finally {
        await cdp.close();
        await local.close();
      }
    },
  );

  it("lets launch config override constructor cdp_url", { timeout: LIVE_BROWSER_TIMEOUT_MS }, async () => {
    const first = await new LocalBrowserLauncher().launch({
      launcher_local_cdp_listen_port: await LocalBrowserLauncher.freePort(),
      launcher_local_headless: true,
    });
    const second = await new LocalBrowserLauncher().launch({
      launcher_local_cdp_listen_port: await LocalBrowserLauncher.freePort(),
      launcher_local_headless: true,
    });

    try {
      const launched = await new RemoteBrowserLauncher({ launcher_remote_cdp_url: first.cdp_url }).launch({
        launcher_remote_cdp_url: `127.0.0.1:${second.cdp_listen_port}`,
      });
      expect(launched.cdp_url).toBe(second.cdp_url);
      await launched.close();
    } finally {
      await first.close();
      await second.close();
    }
  });
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
