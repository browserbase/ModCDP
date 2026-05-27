// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_ModCDPClientRoutedDefaultOverrides.py
// - ./go/modcdp/client/ModCDPClientRoutedDefaultOverrides_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import { test } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ModCDPClient } from "../src/index.js";
import type { cdp } from "../src/types/generated/cdp.js";
import { loadExtensionTestBrowserPath } from "./browserPaths.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, "..", "..", "dist", "extension");
const DEFAULT_ROUTED_OVERRIDES_TEST_TIMEOUT_MS = 45_000;
const LOAD_EXTENSION_TEST_BROWSER_PATH = loadExtensionTestBrowserPath();

const getTargetsOverride = String.raw`
async (params) => {
  const [upstream, tabs] = await Promise.all([
    cdp.upstream.send("Target.getTargets", params),
    chrome.tabs.query({}),
  ]);

  const tabIdByUrl = new Map();
  for (const tab of tabs) {
    for (const url of [tab.url, tab.pendingUrl].filter(Boolean)) {
      if (!tabIdByUrl.has(url)) tabIdByUrl.set(url, tab.id);
    }
  }

  return {
    ...upstream,
    targetInfos: (upstream.targetInfos || []).map(targetInfo => ({
      ...targetInfo,
      tabId: tabIdByUrl.get(targetInfo.url) ?? null,
    })),
  };
}
`;

const tabIdFromTargetIdCommand = String.raw`
async ({ targetId }) => {
  const targets = await chrome.debugger.getTargets();
  const target = targets.find(target => target.id === targetId);
  if (target?.tabId != null) return { tabId: target.tabId };
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find(tab => target?.url && (tab.url === target.url || tab.pendingUrl === target.url));
  return { tabId: tab?.id ?? null };
}
`;

const addTabIdMiddleware = String.raw`
async (payload, next) => {
  const seen = new WeakSet();
  const visit = async value => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (!Array.isArray(value) && typeof value.targetId === "string" && typeof value.type === "string" && value.tabId == null) {
      const { tabId } = await cdp.send("Custom.tabIdFromTargetId", { targetId: value.targetId });
      if (tabId != null) value.tabId = tabId;
    }
    for (const child of Array.isArray(value) ? value : Object.values(value)) await visit(child);
  };
  await visit(payload);
  return next(payload);
}
`;

test(
  "service-worker routed standard CDP commands and events can be transformed",
  { timeout: DEFAULT_ROUTED_OVERRIDES_TEST_TIMEOUT_MS },
  async () => {
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
      router: {
        router_routes: {
          "Target.getTargets": "service_worker",
          "Target.createTarget": "service_worker",
          "Target.setDiscoverTargets": "service_worker",
        },
      },
      server_config: {
        upstream: { upstream_ws_cdp_url: owner.upstream.config.upstream_ws_cdp_url },
        router: { router_routes: { "*.*": "loopback_cdp" } },
      },
    });

    try {
      await cdp.connect();
      assert.equal(cdp.upstream.config.upstream_ws_cdp_url, owner.upstream.config.upstream_ws_cdp_url);
      assert.equal(cdp.server_config?.upstream?.upstream_ws_cdp_url, owner.upstream.config.upstream_ws_cdp_url);

      const rawTargets = (await cdp.send("Target.getTargets")) as { targetInfos: { type?: string; tabId?: number }[] };
      assert.ok(rawTargets.targetInfos?.length > 0, "expected raw Target.getTargets targetInfos");
      assert.equal(
        rawTargets.targetInfos.some((targetInfo) => targetInfo.tabId != null),
        false,
        "raw CDP TargetInfo should not already contain tabId",
      );

      await cdp.Mod.addCustomCommand({
        name: "Custom.tabIdFromTargetId",
        expression: tabIdFromTargetIdCommand,
      });
      await cdp.Mod.addMiddleware({
        name: "*",
        phase: cdp.RESPONSE,
        expression: addTabIdMiddleware,
      });
      const middlewareTargets = (await cdp.send("Target.getTargets")) as {
        targetInfos: { type?: string; tabId?: number }[];
      };
      assert.ok(
        middlewareTargets.targetInfos.some(
          (targetInfo) => targetInfo.type === "page" && Number.isInteger(targetInfo.tabId),
        ),
        "wildcard response middleware should add tabId next to targetId inside TargetInfo",
      );

      await cdp.Mod.addMiddleware({
        name: "*",
        phase: cdp.EVENT,
        expression: addTabIdMiddleware,
      });

      await cdp.Mod.addCustomCommand({
        name: cdp.Target.getTargets,
        expression: getTargetsOverride,
      });

      const enrichedTargets = (await cdp.send("Target.getTargets")) as {
        targetInfos: { type?: string; tabId?: number }[];
      };
      assert.ok(enrichedTargets.targetInfos?.length > 0, "expected enriched Target.getTargets targetInfos");
      assert.equal(
        enrichedTargets.targetInfos.every((targetInfo) => "tabId" in targetInfo),
        true,
        "the custom Target.getTargets override should add a tabId property",
      );
      assert.ok(
        enrichedTargets.targetInfos.some(
          (targetInfo) => targetInfo.type === "page" && Number.isInteger(targetInfo.tabId),
        ),
        "expected at least one page target to be matched to a chrome.tabs tab id",
      );

      const topology = await cdp.Mod.getTopology();
      assert.equal(typeof topology.rootFrameId, "string");
      assert.ok(topology.frames[topology.rootFrameId], "Mod.getTopology should include its root frame");
      assert.ok(
        Object.values(topology.roots).some((root) => root.kind === "document"),
        "Mod.getTopology should include at least one document root",
      );
      assert.ok(
        Object.values(topology.contexts).some((context) => context.world === "piercer"),
        "Mod.getTopology should include a piercer execution context",
      );

      await cdp.Mod.addCustomEvent({ name: cdp.Target.targetCreated });

      const transformedEvents: cdp.types.ts.Target.TargetCreatedEvent[] = [];
      cdp.on(cdp.Target.targetCreated, (params) => {
        if (params.targetInfo.tabId == null) return;
        transformedEvents.push(params);
      });

      await cdp.Target.setDiscoverTargets({ discover: false });
      await cdp.Target.setDiscoverTargets({ discover: true });
      await cdp.Target.getTargets();

      if (transformedEvents.length === 0) {
        const createdTarget = await cdp.Target.createTarget({ url: "about:blank#modcdp-target-created" });
        await cdp.Target.getTargets();
        assert.ok(
          transformedEvents.some((event) => event.targetInfo.targetId === createdTarget.targetId),
          `expected transformed Target.targetCreated for ${createdTarget.targetId}`,
        );
      }

      assert.ok(
        transformedEvents.some((event) => event.targetInfo.tabId != null),
        "transformed event targetInfo should include tabId",
      );
    } finally {
      try {
        await cdp.Target.setDiscoverTargets({ discover: false });
      } catch {}
      await cdp.close();
      await owner.close();
    }
  },
);
