import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { ModCDPClient } from "../src/client/ModCDPClient.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, "..", "..", "dist", "extension");

test("AutoSessionRouter tracks real target sessions and execution contexts from live CDP events", async () => {
  const cdp = new ModCDPClient({
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
    client: {
      client_routes: {
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
      assert.equal(typeof cdp.auto_sessions.sessionId_from_targetId.get(targetId!), "string");
    });
    const sessionId = cdp.auto_sessions.sessionId_from_targetId.get(targetId);
    assert.equal(typeof sessionId, "string");

    const contextPromise = cdp.auto_sessions.waitForExecutionContext(sessionId, {
      timeout_ms: 30_000,
    });
    await cdp.send("Runtime.enable", {}, sessionId);
    const contextId = await contextPromise;
    assert.equal(typeof contextId, "number");
    assert.equal(cdp.auto_sessions.execution_contexts.get(sessionId), contextId);

    await cdp.Target.detachFromTarget({ sessionId });
    await expectEventually(() => {
      assert.equal(cdp.auto_sessions.sessionId_from_targetId.get(targetId!), undefined);
    });
    assert.equal(cdp.auto_sessions.execution_contexts.get(sessionId), undefined);
    await cdp.Target.closeTarget({ targetId }).catch(() => ({}));
    targetId = null;

    const pendingCreated = await cdp.Target.createTarget({
      url: "about:blank#modcdp-auto-session-router-pending-context",
    });
    pendingTargetId = pendingCreated.targetId;
    await expectEventually(() => {
      assert.equal(typeof cdp.auto_sessions.sessionId_from_targetId.get(pendingTargetId!), "string");
    });
    const pendingSessionId = cdp.auto_sessions.sessionId_from_targetId.get(pendingTargetId);
    assert.equal(typeof pendingSessionId, "string");
    const cancelledContextPromise = cdp.auto_sessions.waitForExecutionContext(pendingSessionId, {
      timeout_ms: 30_000,
    });
    const cancelledContextAssertion = assert.rejects(
      cancelledContextPromise,
      new RegExp(`Runtime execution context wait cancelled because session ${pendingSessionId} detached\\.`),
    );
    await cdp.Target.detachFromTarget({ sessionId: pendingSessionId });
    await cancelledContextAssertion;
    await expectEventually(() => {
      assert.equal(cdp.auto_sessions.sessionId_from_targetId.get(pendingTargetId!), undefined);
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
