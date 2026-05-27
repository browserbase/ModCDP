// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_AutoSessionRouter.py
// - ./go/modcdp/router/AutoSessionRouter_test.go
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

test("AutoSessionRouter tracks real target sessions and execution contexts from live CDP events", async () => {
  const cdp = new ModCDPClient({
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
    router: {
      router_routes: {
        "Mod.*": "service_worker",
        "Custom.*": "service_worker",
        "*.*": "direct_cdp",
      },
    },
  });

  let targetId: string | null = null;
  let pendingTargetId: string | null = null;
  try {
    await cdp.connect();
    const created = await cdp.Target.createTarget({ url: "about:blank#modcdp-auto-session-router" });
    targetId = created.targetId;
    await expectEventually(() => {
      assert.equal(typeof cdp.router.sessionId_from_targetId.get(targetId!), "string");
    });
    const sessionId = cdp.router.sessionId_from_targetId.get(targetId);
    assert.equal(typeof sessionId, "string");

    const contextPromise = cdp.router.waitForExecutionContext(sessionId, {
      timeout_ms: 30_000,
    });
    await cdp.send("Runtime.enable", {}, sessionId);
    const contextId = await contextPromise;
    assert.equal(typeof contextId, "number");
    assert.equal(
      [...cdp.router.contexts.values()].some((context) => context.sessionId === sessionId && context.id === contextId),
      true,
    );

    await cdp.Target.detachFromTarget({ sessionId });
    await expectEventually(() => {
      assert.equal(cdp.router.sessionId_from_targetId.get(targetId!), undefined);
    });
    assert.equal(
      [...cdp.router.contexts.values()].some((context) => context.sessionId === sessionId),
      false,
    );
    await cdp.Target.closeTarget({ targetId }).catch(() => ({}));
    targetId = null;

    const pendingCreated = await cdp.Target.createTarget({
      url: "about:blank#modcdp-auto-session-router-pending-context",
    });
    pendingTargetId = pendingCreated.targetId;
    await expectEventually(() => {
      assert.equal(typeof cdp.router.sessionId_from_targetId.get(pendingTargetId!), "string");
    });
    const pendingSessionId = cdp.router.sessionId_from_targetId.get(pendingTargetId);
    assert.equal(typeof pendingSessionId, "string");
    const cancelledContextPromise = cdp.router.waitForExecutionContext(pendingSessionId, {
      timeout_ms: 30_000,
    });
    const cancelledContextAssertion = assert.rejects(
      cancelledContextPromise,
      new RegExp(`Runtime execution context wait cancelled because session ${pendingSessionId} detached\\.`),
    );
    await cdp.Target.detachFromTarget({ sessionId: pendingSessionId });
    await cancelledContextAssertion;
    await expectEventually(() => {
      assert.equal(cdp.router.sessionId_from_targetId.get(pendingTargetId!), undefined);
    });
    await cdp.Target.closeTarget({ targetId: pendingTargetId }).catch(() => ({}));
    pendingTargetId = null;
  } finally {
    if (targetId) await cdp.Target.closeTarget({ targetId }).catch(() => ({}));
    if (pendingTargetId) await cdp.Target.closeTarget({ targetId: pendingTargetId }).catch(() => ({}));
    await cdp.close();
  }
}, 60_000);

async function expectEventually(assertion: () => void, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
