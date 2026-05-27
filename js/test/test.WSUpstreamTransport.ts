// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_WSUpstreamTransport.py
// - ./go/modcdp/transport/WSUpstreamTransport_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import { test } from "vitest";

import { LocalBrowserLauncher } from "../src/launcher/LocalBrowserLauncher.js";
import { WSUpstreamTransport } from "../src/transport/WSUpstreamTransport.js";

test("ws upstream constructor, update, server config, and unconnected errors match the transport surface", async () => {
  const transport = new WSUpstreamTransport();
  assert.equal(transport.config.upstream_ws_cdp_url, undefined);
  assert.equal(transport.update({ upstream_ws_cdp_url: "ws://127.0.0.1:1/devtools/browser/test" }), transport);
  assert.equal(transport.config.upstream_ws_cdp_url, "ws://127.0.0.1:1/devtools/browser/test");
  const unconfigured = new WSUpstreamTransport();
  await assert.rejects(() => unconfigured.connect(), /WSUpstreamTransport requires/);
  assert.throws(() => unconfigured.send({ id: 1, method: "Browser.getVersion" }), /CDP websocket is not connected/);
});

test("ws upstream launches a real browser and speaks raw CDP", async () => {
  const chrome = await new LocalBrowserLauncher({ launcher_local_headless: true }).launch();
  const transport = new WSUpstreamTransport({ upstream_ws_cdp_url: chrome.cdp_url });

  try {
    await transport.connect();
    assert.match(transport.config.upstream_ws_cdp_url ?? "", /^ws:\/\//);
    const version = (await transport.send("Browser.getVersion")) as Record<string, unknown>;
    assert.equal(typeof version.product, "string");
  } finally {
    await transport.close();
    await chrome.close();
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
    assert.match(transport.config.upstream_ws_cdp_url ?? "", /^ws:\/\//);
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
