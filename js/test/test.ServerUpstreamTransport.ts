import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { ModCDPClient } from "../src/client/ModCDPClient.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, "..", "..", "dist", "extension");

test("loopback server upstream routes target commands through one transport", async () => {
  const owner = new ModCDPClient({
    launcher: {
      launcher_mode: "local",
      launcher_options: { headless: true },
    },
    upstream: { upstream_mode: "ws" },
    injector: {
      injector_mode: "auto",
      injector_extension_path: EXTENSION_PATH,
      injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
      injector_trust_service_worker_target: true,
    },
  });
  await owner.connect();

  const cdp = new ModCDPClient({
    launcher: { launcher_mode: "remote" },
    upstream: { upstream_mode: "ws", upstream_cdp_url: owner.cdp_url },
    injector: {
      injector_mode: "discover",
      injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
      injector_trust_service_worker_target: true,
    },
    server: {
      server_loopback_cdp_url: owner.cdp_url,
      server_routes: { "*.*": "loopback_cdp" },
    },
  });

  let targetId: string | null = null;
  try {
    await cdp.connect();
    const created = (await cdp.send("Target.createTarget", { url: targetTestUrl("loopback") })) as {
      targetId?: string;
    };
    assert.equal(typeof created.targetId, "string");
    targetId = created.targetId;
    await assertPageMarker(cdp, targetId, "loopback");
  } finally {
    if (targetId) await cdp.send("Target.closeTarget", { targetId }).catch(() => ({}));
    await cdp.close();
    await owner.close();
  }
}, 90_000);

test("chrome.debugger server upstream routes target commands through one transport", async () => {
  const owner = new ModCDPClient({
    launcher: {
      launcher_mode: "local",
      launcher_options: { headless: true },
    },
    upstream: { upstream_mode: "ws" },
    injector: {
      injector_mode: "auto",
      injector_extension_path: EXTENSION_PATH,
      injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
      injector_trust_service_worker_target: true,
    },
  });
  await owner.connect();

  const cdp = new ModCDPClient({
    launcher: { launcher_mode: "remote" },
    upstream: { upstream_mode: "ws", upstream_cdp_url: owner.cdp_url },
    injector: {
      injector_mode: "discover",
      injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
      injector_trust_service_worker_target: true,
    },
    server: {
      server_routes: { "*.*": "chrome_debugger" },
    },
  });

  let targetId: string | null = null;
  try {
    await cdp.connect();
    const created = (await cdp.send("Target.createTarget", { url: targetTestUrl("debugger") })) as {
      targetId?: string;
    };
    assert.equal(typeof created.targetId, "string");
    targetId = created.targetId;
    await assertPageMarker(cdp, targetId, "debugger");
  } finally {
    if (targetId) await cdp.send("Target.closeTarget", { targetId }).catch(() => ({}));
    await cdp.close();
    await owner.close();
  }
}, 90_000);

async function assertPageMarker(cdp: ModCDPClient, targetId: string, label: string) {
  await assert.doesNotReject(async () => {
    await expectEventually(async () => {
      const evaluated = (await cdp.send("Runtime.evaluate", {
        targetId,
        expression: "document.body?.dataset.modcdpMarker",
        returnByValue: true,
      })) as { result?: { value?: unknown } };
      assert.equal(evaluated.result?.value, label);
    });
  });
}

function targetTestUrl(label: string) {
  const html = `<!doctype html>
    <html>
      <body data-modcdp-marker="${label}"></body>
    </html>`;
  return `data:text/html,${encodeURIComponent(html)}`;
}

async function expectEventually(assertion: () => Promise<void> | void, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
