import { once } from "node:events";
import WebSocket from "ws";
import { expect, test } from "vitest";

import { LocalBrowserLauncher } from "../src/launcher/LocalBrowserLauncher.js";
import { AutoSessionRouter } from "../src/router/AutoSessionRouter.js";
import { CdpEventMessageSchema } from "../src/types/modcdp.js";

test("AutoSessionRouter tracks real target sessions and execution contexts", async () => {
  const chrome = await new LocalBrowserLauncher({
    headless: true,
  }).launch();
  const ws = new WebSocket(chrome.cdp_url!);
  await once(ws, "open");
  let next_id = 1;
  const pending = new Map<number, (message: Record<string, unknown>) => void>();
  const router = new AutoSessionRouter(
    (method, params = {}, session_id = null) =>
      send(method, params as Record<string, unknown>, session_id) as Promise<Record<string, unknown>>,
    () => 30_000,
  );
  const router_event_listeners = new Set<
    (method: string, payload: Record<string, unknown>, cdpSessionId: string | null) => void
  >();
  const router_subscription = router.listenTo({
    on(listener) {
      router_event_listeners.add(listener);
      return { remove: () => router_event_listeners.delete(listener) };
    },
  });

  function send(method: string, params: Record<string, unknown> = {}, session_id: string | null = null) {
    const id = next_id++;
    ws.send(
      JSON.stringify({
        id,
        method,
        params,
        ...(session_id ? { sessionId: session_id } : {}),
      }),
    );
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      pending.set(id, (message) => {
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve((message.result ?? {}) as Record<string, unknown>);
      });
    });
  }

  ws.on("message", (data) => {
    const message = JSON.parse(data.toString()) as Record<string, unknown>;
    if (typeof message.id === "number") {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
      return;
    }
    const cdpEvent = CdpEventMessageSchema.parse(message);
    for (const listener of router_event_listeners) {
      listener(cdpEvent.method, (cdpEvent.params ?? {}) as Record<string, unknown>, cdpEvent.sessionId ?? null);
    }
  });

  try {
    await send("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    });
    await send("Target.setDiscoverTargets", { discover: true });
    const created = await send("Target.createTarget", {
      url: "about:blank#modcdp-auto-session-router",
    });
    const target_id = created.targetId as string;
    await expect
      .poll(() => router.sessionIdFromTargetId.get(target_id), { timeout: 5_000 })
      .toEqual(expect.any(String));
    const session_id = router.sessionIdFromTargetId.get(target_id)!;

    const context_promise = router.waitForExecutionContext(session_id, {
      timeout_ms: 30_000,
    });
    await send("Runtime.enable", {}, session_id);
    await expect(context_promise).resolves.toEqual(expect.any(Number));
    expect(router.execution_contexts.get(session_id)).toEqual(expect.any(Number));

    await send("Target.detachFromTarget", { sessionId: session_id });
    await expect.poll(() => router.sessionIdFromTargetId.get(target_id), { timeout: 5_000 }).toBeUndefined();
    expect(router.execution_contexts.get(session_id)).toBeUndefined();
    await send("Target.closeTarget", { targetId: target_id }).catch(() => ({}));

    const pending_created = await send("Target.createTarget", {
      url: "about:blank#modcdp-auto-session-router-pending-context",
    });
    const pending_target_id = pending_created.targetId as string;
    await expect
      .poll(() => router.sessionIdFromTargetId.get(pending_target_id), { timeout: 5_000 })
      .toEqual(expect.any(String));
    const pending_session_id = router.sessionIdFromTargetId.get(pending_target_id)!;
    const cancelled_context_promise = router.waitForExecutionContext(pending_session_id, {
      timeout_ms: 30_000,
    });
    const cancelled_context_assertion = expect(cancelled_context_promise).rejects.toThrow(
      `Runtime execution context wait cancelled because session ${pending_session_id} detached.`,
    );
    await send("Target.detachFromTarget", { sessionId: pending_session_id });
    await cancelled_context_assertion;
    await expect.poll(() => router.sessionIdFromTargetId.get(pending_target_id), { timeout: 5_000 }).toBeUndefined();
    await send("Target.closeTarget", { targetId: pending_target_id }).catch(() => ({}));
  } finally {
    router_subscription.remove();
    ws.close();
    await once(ws, "close").catch(() => {});
    await chrome.close();
  }
}, 60_000);
