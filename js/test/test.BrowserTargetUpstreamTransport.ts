// MODCDP_TS_ONLY_TEST: DO NOT TRANSLATE THIS TEST FILE TO OTHER LANGUAGES.
// BrowserTargetUpstreamTransport: TS-only browser-target upstream transport coverage.
// If a translated sibling is added, all test cases, descriptions, covered edge cases, and setup must be kept perfectly 1:1 in sync.
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { ModCDPClient } from "../src/index.js";
import { loadExtensionTestBrowserPath } from "./browserPaths.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, "..", "..", "dist", "extension");
const LOAD_EXTENSION_TEST_BROWSER_PATH = loadExtensionTestBrowserPath();

test("loopback browser-target upstream routes commands, events, and topology through one transport", async () => {
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
  await owner.connect();

  const cdp = new ModCDPClient({
    launcher: { launcher_mode: "remote", launcher_remote_cdp_url: owner.upstream.config.upstream_ws_cdp_url },
    upstream: { upstream_mode: "ws", upstream_ws_cdp_url: owner.upstream.config.upstream_ws_cdp_url },
    injector: {
      injector_mode: "discover",
      injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
      injector_trust_service_worker_target: true,
    },
    server_config: {
      upstream: { upstream_ws_cdp_url: owner.upstream.config.upstream_ws_cdp_url },
      router: { router_routes: { "*.*": "loopback_cdp" } },
    },
  });

  let targetId: string | null = null;
  try {
    await cdp.connect();
    const created = (await cdp.send("Target.createTarget", { url: topologyTestUrl("loopback") })) as {
      targetId?: string;
    };
    assert.equal(typeof created.targetId, "string");
    targetId = created.targetId;
    await assertPageMarker(cdp, targetId, "loopback");

    const topology = await cdp.Mod.getTopology({ targetId });
    assertTopology(topology, targetId);
    assert.equal(
      Object.values(topology.targets).some((target) => target.sessionId),
      true,
    );
  } finally {
    if (targetId) await cdp.send("Target.closeTarget", { targetId }).catch(() => ({}));
    await cdp.close();
    await owner.close();
  }
}, 90_000);

test("chrome.debugger browser-target upstream routes commands, events, and topology through one transport", async () => {
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
  await owner.connect();

  const cdp = new ModCDPClient({
    launcher: { launcher_mode: "remote", launcher_remote_cdp_url: owner.upstream.config.upstream_ws_cdp_url },
    upstream: { upstream_mode: "ws", upstream_ws_cdp_url: owner.upstream.config.upstream_ws_cdp_url },
    injector: {
      injector_mode: "discover",
      injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
      injector_trust_service_worker_target: true,
    },
    server_config: {
      router: { router_routes: { "*.*": "chromedebugger" } },
    },
  });

  let targetId: string | null = null;
  try {
    await cdp.connect();
    const created = (await cdp.send("Target.createTarget", { url: topologyTestUrl("debugger") })) as {
      targetId?: string;
    };
    assert.equal(typeof created.targetId, "string");
    targetId = created.targetId;
    await assertPageMarker(cdp, targetId, "debugger");

    const topology = await cdp.Mod.getTopology({ targetId });
    assertTopology(topology, targetId);
    assert.ok(topology.targets[targetId], "topology should include the created target");
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

function assertTopology(topology: Awaited<ReturnType<ModCDPClient["Mod"]["getTopology"]>>, targetId: string) {
  assert.equal(typeof topology.objectGroup, "string");
  assert.equal(typeof topology.rootFrameId, "string");
  assert.ok(topology.frames[topology.rootFrameId], "topology should include the root frame");
  assert.equal(topology.frames[topology.rootFrameId]?.targetId, targetId);
  assert.ok(topology.targets[targetId], "topology should include the requested page target");

  const contexts = Object.values(topology.contexts);
  assert.ok(
    contexts.some((context) => context.frameId === topology.rootFrameId && context.world === "piercer"),
    "topology should include a piercer execution context for the root frame",
  );

  const roots = Object.values(topology.roots);
  assert.ok(
    roots.some((root) => root.kind === "document" && root.frameId === topology.rootFrameId),
    "topology should include the root document",
  );
  assert.ok(
    roots.some((root) => root.kind === "shadow" && root.mode === "open"),
    "topology should include open shadow roots",
  );
  assert.ok(
    roots.some((root) => root.kind === "shadow" && root.mode === "closed"),
    "topology should include closed shadow roots",
  );
}

function topologyTestUrl(label: string) {
  const html = `<!doctype html>
    <html>
      <body data-modcdp-marker="${label}">
        <div id="open-host"></div>
        <div id="closed-host"></div>
        <iframe srcdoc="<button id='frame-button'>Frame button</button>"></iframe>
        <script>
          document.getElementById("open-host").attachShadow({mode: "open"}).innerHTML = "<button>Open shadow</button>";
          document.getElementById("closed-host").attachShadow({mode: "closed"}).innerHTML = "<button>Closed shadow</button>";
        </script>
      </body>
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
