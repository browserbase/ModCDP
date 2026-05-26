import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { LocalBrowserLauncher } from "../src/launcher/LocalBrowserLauncher.js";
import { WSUpstreamTransport } from "../src/transport/WSUpstreamTransport.js";
import { ModCDPClient } from "../src/client/ModCDPClient.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, "..", "..", "dist", "extension");

test("ws upstream constructor, update, server config, and unconnected errors match the transport surface", async () => {
  const transport = new WSUpstreamTransport();
  assert.equal(transport.upstream_ws_cdp_url, "");
  assert.equal(transport.update({ upstream_ws_cdp_url: "ws://127.0.0.1:1/devtools/browser/test" }), transport);
  assert.equal(transport.upstream_ws_cdp_url, "ws://127.0.0.1:1/devtools/browser/test");
  const unconfigured = new WSUpstreamTransport();
  await assert.rejects(() => unconfigured.connect(), /WSUpstreamTransport requires/);
  assert.throws(() => unconfigured.send({ id: 1, method: "Browser.getVersion" }), /CDP websocket is not connected/);
});

test("ws upstream launches a real browser and speaks raw CDP", async () => {
  const cdp = new ModCDPClient({
    launcher: {
      launcher_mode: "local",
      launcher_local_headless: true,
    },
    upstream: { upstream_mode: "ws" },
    injector: {
      injector_mode: "cdp",
      injector_cli_extension_path: EXTENSION_PATH,
      injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
      injector_trust_service_worker_target: true,
    },
  });

  try {
    await cdp.connect();
    assert.equal(cdp.upstream?.upstream_mode, "ws");
    assert.equal(cdp.connect_timing?.upstream_mode, "ws");
    const connect_timing = cdp.connect_timing as
      | {
          transport_connected_at: number;
          transport_duration_ms: number;
          transport_started_at: number;
        }
      | undefined;
    assert.equal(
      connect_timing?.transport_duration_ms,
      (connect_timing?.transport_connected_at ?? 0) - (connect_timing?.transport_started_at ?? 0),
    );
    assert.match(cdp.upstream.upstream_ws_cdp_url ?? "", /^ws:\/\//);
    const version = (await cdp.upstream.send("Browser.getVersion")) as Record<string, unknown>;
    assert.equal(typeof version.product, "string");
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const target_infos = (
      (await cdp.upstream.send("Target.getTargets")) as { targetInfos?: { type?: string; url?: string }[] }
    ).targetInfos;
    assert.equal(
      target_infos?.some(
        (target) => target.type === "service_worker" && target.url?.endsWith("/modcdp/service_worker.js"),
      ),
      true,
    );
    assert.equal(
      await cdp.Mod.evaluate({
        expression: "Boolean(globalThis.ModCDP?.handleCommand && chrome.runtime.getURL('modcdp/service_worker.js'))",
      }),
      true,
    );
  } finally {
    await cdp.close();
  }
}, 60_000);

test("ws upstream resolves a bare host:port CDP endpoint to the browser websocket", async () => {
  const chrome = await new LocalBrowserLauncher({
    launcher_local_headless: true,
  }).launch();
  const transport = new WSUpstreamTransport({ upstream_ws_cdp_url: `127.0.0.1:${chrome.cdp_listen_port}` });

  try {
    const response = new Promise<Record<string, unknown>>((resolve) => {
      transport.onRecv((message) => {
        if ("id" in message && message.id === 1) resolve(message as Record<string, unknown>);
      });
    });
    await transport.connect();
    assert.match(transport.upstream_ws_cdp_url ?? "", /^ws:\/\//);
    transport.send({ id: 1, method: "Browser.getVersion", params: {} });
    const message = await response;
    assert.equal(typeof (message.result as Record<string, unknown>).product, "string");
  } finally {
    await transport.close();
    await chrome.close();
  }
}, 60_000);

test("ws upstream close clears connection state", async () => {
  const chrome = await new LocalBrowserLauncher({
    launcher_local_headless: true,
  }).launch();
  const transport = new WSUpstreamTransport({ upstream_ws_cdp_url: chrome.cdp_url });

  try {
    await transport.connect();
    assert.ok(transport.ws);
    await transport.close();
    assert.equal(transport.ws, null);
    assert.throws(() => transport.send({ id: 1, method: "Browser.getVersion" }), /CDP websocket is not connected/);
  } finally {
    await transport.close();
    await chrome.close();
  }
}, 60_000);
