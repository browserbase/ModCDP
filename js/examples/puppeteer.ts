// Puppeteer through the standalone ModCDP proxy.
//
// This is intentionally a normal Puppeteer connect flow. The proxy endpoint
// exposes the regular CDP discovery endpoints while adding Mod.* and Custom.*
// support to every CDPSession.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { LocalBrowserLauncher } from "../src/launcher/LocalBrowserLauncher.js";
import { startProxy } from "../src/proxy/proxy.js";
import { loadExtensionBrowserPath } from "./browserPaths.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const extension_path =
  [path.resolve(here, "../../extension"), path.resolve(here, "../../dist/extension")].find((candidate) =>
    existsSync(path.join(candidate, "modcdp/service_worker.js")),
  ) ?? path.resolve(here, "../../extension");
const DEFAULT_CUSTOM_PROXY_EVENT_TIMEOUT_MS = 10_000;

let proxy: Awaited<ReturnType<typeof startProxy>> | null = null;
let chrome: Awaited<ReturnType<LocalBrowserLauncher["launch"]>> | null = null;
let browser: Awaited<ReturnType<typeof puppeteer.connect>> | null = null;

try {
  chrome = await new LocalBrowserLauncher().launch({
    launcher_local_chrome_ready_timeout_ms: 60_000,
    launcher_local_headless: process.platform === "linux" && !process.env.DISPLAY,
    launcher_local_sandbox: process.platform !== "linux",
    launcher_local_executable_path: loadExtensionBrowserPath(),
    launcher_local_extra_args: [`--load-extension=${extension_path}`],
  });
  proxy = await startProxy({
    proxy_listen_port: await LocalBrowserLauncher.freePort(),
    launcher: { launcher_mode: "remote", launcher_remote_cdp_url: chrome.cdp_url },
    upstream: { upstream_mode: "ws" },
    injector: {
      injector_mode: "discover",
      injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
      injector_trust_service_worker_target: true,
    },
  });

  browser = await puppeteer.connect({ browserURL: proxy.url });
  const page = (await browser.pages())[0] ?? (await browser.newPage());
  const cdp = (await page.createCDPSession()) as any;

  const version = await cdp.send("Browser.getVersion");
  assert.equal(typeof version.product, "string");
  console.log("Browser.getVersion ->", version.product);

  const worker_info = await cdp.send("Mod.evaluate", {
    expression:
      "({ extension_id: chrome.runtime.id, service_worker_url: chrome.runtime.getURL('modcdp/service_worker.js') })",
  });
  assert.equal(typeof worker_info.extension_id, "string");
  console.log("Mod.evaluate ->", worker_info);

  await cdp.send("Mod.addCustomEvent", { name: "Custom.proxyEvent" });
  const event_received = new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for Custom.proxyEvent")),
      DEFAULT_CUSTOM_PROXY_EVENT_TIMEOUT_MS,
    );
    cdp.on("Custom.proxyEvent", (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });

  await cdp.send("Mod.addCustomCommand", {
    name: "Custom.proxyEcho",
    expression: `async (params) => {
      const event = { method: "Custom.proxyEvent", params: { source: "puppeteer", value: params.value } };
      if (cdpSessionId) event.sessionId = cdpSessionId;
      downstream.sendEvent(event);
      return { source: "puppeteer", value: params.value };
    }`,
  });

  const echo_result = await cdp.send("Custom.proxyEcho", {
    value: "hello-from-puppeteer",
  });
  const event_result = await event_received;
  assert.deepEqual(echo_result, {
    source: "puppeteer",
    value: "hello-from-puppeteer",
  });
  assert.deepEqual(event_result, {
    source: "puppeteer",
    value: "hello-from-puppeteer",
  });
  console.log("Custom.proxyEcho ->", echo_result);
  console.log("Custom.proxyEvent ->", event_result);
} finally {
  await browser?.close().catch(() => {});
  await proxy?.close().catch(() => {});
  await Promise.resolve(chrome?.close()).catch(() => {});
}
