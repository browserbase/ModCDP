import { describe, expect, it } from "vitest";

import { LocalBrowserLauncher } from "../src/launcher/LocalBrowserLauncher.js";
import { RemoteBrowserLauncher } from "../src/launcher/RemoteBrowserLauncher.js";
import { CdpSocket, expectCdpBrowserSurface } from "./helpers.BrowserLauncher.js";

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
      let cdp: CdpSocket | null = null;

      try {
        const http_endpoint = `http://127.0.0.1:${local.cdp_listen_port}`;
        const bare_endpoint = `127.0.0.1:${local.cdp_listen_port}`;
        const fromHttp = await new RemoteBrowserLauncher({ launcher_remote_cdp_url: http_endpoint }).launch();
        expect(fromHttp.cdp_url).toBe(local.cdp_url);
        cdp = await CdpSocket.connect(fromHttp.cdp_url!);
        await expectCdpBrowserSurface(cdp);
        await fromHttp.close();

        const fromBare = await new RemoteBrowserLauncher({ launcher_remote_cdp_url: bare_endpoint }).launch();
        expect(fromBare.cdp_url).toBe(local.cdp_url);
        await fromBare.close();

        const fromOptions = await new RemoteBrowserLauncher({
          launcher_remote_cdp_url: local.cdp_url,
        }).launch();
        expect(fromOptions.cdp_url).toBe(local.cdp_url);
        await fromOptions.close();

        const fromWs = await new RemoteBrowserLauncher().launch({
          launcher_remote_cdp_url: local.cdp_url,
        });
        expect(fromWs.cdp_url).toBe(local.cdp_url);
        await expectCdpBrowserSurface(cdp);
        await fromWs.close();
      } finally {
        await cdp?.close();
        await local.close();
      }
    },
  );

  it("lets launch options override constructor cdp_url", { timeout: LIVE_BROWSER_TIMEOUT_MS }, async () => {
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
