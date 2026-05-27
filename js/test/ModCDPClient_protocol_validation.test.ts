// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_ModCDPClient_protocol_validation.py
// - ./go/modcdp/client/ModCDPClient_protocol_validation_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import { ModCDPClient } from "../src/index.js";
import { CDPTypes } from "../src/types/CDPTypes.js";
import type { cdp } from "../src/types/generated/cdp.js";

test("native CDP schemas validate method params, return values, and event payloads statically and at runtime", () => {
  const types = new CDPTypes();
  const client = new ModCDPClient({
    launcher: { launcher_mode: "none" },
    upstream: { upstream_mode: "ws" },
    injector: { injector_mode: "none" },
    server_config: null,
  });
  const runtime_params: cdp.types.ts.Runtime.EvaluateParams = {
    expression: "1 + 1",
    returnByValue: true,
  };
  const runtime_result: cdp.types.ts.Runtime.EvaluateResult = {
    result: { type: "number", value: 2, description: "2" },
  };
  const target_event: cdp.types.ts.Target.TargetCreatedEvent = {
    targetInfo: {
      targetId: "target-1",
      type: "page",
      title: "Example",
      url: "https://example.com",
      attached: false,
      canAccessOpener: false,
    },
  };

  if (false) {
    const alias_result: Awaited<ReturnType<typeof client.Runtime.evaluate>> = runtime_result;
    void alias_result;
    client.on(client.Target.targetCreated, (event) => {
      const targetId: string = event.targetInfo.targetId;
      void targetId;
      // @ts-expect-error targetId is a string, not a number.
      const badTargetId: number = event.targetInfo.targetId;
      void badTargetId;
    });
    // @ts-expect-error Runtime.evaluate params require expression.
    client.Runtime.evaluate({ returnByValue: true });
    const badRuntimeResult: cdp.types.ts.Runtime.EvaluateResult = {
      // @ts-expect-error Runtime.evaluate result must be a Runtime.RemoteObject.
      result: { type: 1 },
    };
    void badRuntimeResult;
    const badTargetEvent: cdp.types.ts.Target.TargetCreatedEvent = {
      targetInfo: {
        ...target_event.targetInfo,
        // @ts-expect-error Target.targetCreated targetInfo.targetId is a string.
        targetId: 1,
      },
    };
    void badTargetEvent;
  }

  assert.deepEqual(types.parseCommandParams("Runtime.evaluate", runtime_params), runtime_params);
  assert.deepEqual(types.parseCommandResult("Runtime.evaluate", runtime_result), runtime_result);
  assert.deepEqual(types.parseEventPayload("Target.targetCreated", target_event), target_event);
  assert.throws(() => types.parseCommandParams("Runtime.evaluate", { returnByValue: true }));
  assert.throws(() => types.parseCommandResult("Runtime.evaluate", {}));
  assert.throws(() =>
    types.parseEventPayload("Target.targetCreated", {
      targetInfo: { ...target_event.targetInfo, targetId: 1 },
    }),
  );
});

test("Mod schemas validate method params, return values, event payloads, and middleware registrations statically and at runtime", () => {
  const types = new CDPTypes();
  const client = new ModCDPClient({
    launcher: { launcher_mode: "none" },
    upstream: { upstream_mode: "ws" },
    injector: { injector_mode: "none" },
    server_config: null,
  });
  const ping_params: cdp.types.ts.Mod.PingParams = { sent_at: 123 };
  const ping_result: cdp.types.ts.Mod.PingResponse = { ok: true };
  const pong_event: cdp.types.ts.Mod.PongEvent = {
    sent_at: 123,
    received_at: 124,
    from: "extension-service-worker",
  };
  const middleware_params: cdp.types.ts.Mod.AddMiddlewareParams = {
    name: client.Target.getTargets,
    phase: client.RESPONSE,
    expression: "async (payload, next) => next(payload)",
  };
  const middleware_result: cdp.types.ts.Mod.AddMiddlewareResponse = {
    name: "Target.getTargets",
    phase: "response",
    registered: true,
  };

  if (false) {
    const alias_result: Awaited<ReturnType<typeof client.Mod.ping>> = ping_result;
    void alias_result;
    const alias_middleware_result: Awaited<ReturnType<typeof client.Mod.addMiddleware>> = middleware_result;
    void alias_middleware_result;
    // @ts-expect-error Mod.ping sent_at must be a number.
    client.Mod.ping({ sent_at: "123" });
    client.Mod.addMiddleware({
      name: "Custom.any",
      // @ts-expect-error middleware phase must be request, response, or event.
      phase: "after",
      expression: "async (payload, next) => next(payload)",
    });
    // @ts-expect-error Mod.pong received_at is required.
    const badPongEvent: cdp.types.ts.Mod.PongEvent = {
      sent_at: 123,
      from: "extension-service-worker",
    };
    void badPongEvent;
  }

  assert.deepEqual(types.parseCommandParams("Mod.ping", ping_params), {
    sent_at: 123,
  });
  assert.deepEqual(types.parseCommandResult("Mod.ping", ping_result), {
    ok: true,
  });
  assert.deepEqual(types.parseEventPayload("Mod.pong", pong_event), pong_event);
  assert.deepEqual(types.parseCommandParams("Mod.addMiddleware", middleware_params), middleware_params);
  assert.deepEqual(types.parseCommandResult("Mod.addMiddleware", middleware_result), middleware_result);
  assert.throws(() => types.parseCommandParams("Mod.ping", { sent_at: "123" }));
  assert.throws(() => types.parseCommandResult("Mod.ping", { ok: "true" }));
  assert.throws(() =>
    types.parseEventPayload("Mod.pong", {
      sent_at: 123,
      from: "extension-service-worker",
    }),
  );
  assert.throws(() =>
    types.parseCommandParams("Mod.addMiddleware", {
      name: "Custom.any",
      phase: "after",
      expression: "async (payload, next) => next(payload)",
    }),
  );
  assert.throws(() =>
    types.parseCommandResult("Mod.addMiddleware", {
      name: "Custom.any",
      phase: "after",
      registered: true,
    }),
  );
});

test("constructor custom schemas validate command params, return values, events, and middleware registrations statically and at runtime", () => {
  const SumParams = z.object({ left: z.number(), right: z.number() });
  const SumResult = z.object({ value: z.number() });
  const FinishedEvent = z.object({ total: z.number(), label: z.string() });
  const client = new ModCDPClient({
    launcher: { launcher_mode: "none" },
    upstream: { upstream_mode: "ws" },
    injector: { injector_mode: "none" },
    server_config: null,
    types: {
      custom_commands: {
        "Custom.sum": {
          params_schema: SumParams,
          result_schema: SumResult,
          expression: "async ({ left, right }) => ({ value: left + right })",
        },
      },
      custom_events: {
        "Custom.finished": { event_schema: FinishedEvent },
      },
      custom_middlewares: [
        {
          name: "Custom.sum",
          phase: "response",
          expression: "async (payload, next) => next(payload)",
        },
      ],
    },
  });

  if (false) {
    const params: Parameters<typeof client.Custom.sum>[0] = {
      left: 1,
      right: 2,
    };
    void params;
    const result: Awaited<ReturnType<typeof client.Custom.sum>> = { value: 3 };
    void result;
    client.on("Custom.finished", (event) => {
      const total: number = event.total;
      void total;
      // @ts-expect-error Custom.finished total is a number.
      const badTotal: string = event.total;
      void badTotal;
    });
    // @ts-expect-error Custom.sum requires numeric left/right params.
    client.Custom.sum({ left: "1", right: 2 });
    // @ts-expect-error Custom.sum returns a CDP-style result object.
    const badResult: Awaited<ReturnType<typeof client.Custom.sum>> = 3;
    void badResult;
  }

  assert.deepEqual(client.types.parseCommandParams("Custom.sum", { left: 1, right: 2 }), { left: 1, right: 2 });
  assert.deepEqual(client.types.parseCommandResult("Custom.sum", { value: 3 }), { value: 3 });
  assert.deepEqual(
    client.types.parseEventPayload("Custom.finished", {
      total: 3,
      label: "ok",
    }),
    { total: 3, label: "ok" },
  );
  assert.throws(() => client.types.parseCommandParams("Custom.sum", { left: "1", right: 2 }));
  assert.throws(() => client.types.parseCommandResult("Custom.sum", { value: "3" }));
  assert.throws(() =>
    client.types.parseEventPayload("Custom.finished", {
      total: "3",
      label: "ok",
    }),
  );
  assert.deepEqual(client.types.customMiddlewareWireRegistrations(), [
    {
      name: "Custom.sum",
      phase: "response",
      expression: "async (payload, next) => next(payload)",
    },
  ]);
  assert.throws(
    () =>
      new CDPTypes({
        custom_middlewares: [
          {
            name: "Custom.sum",
            phase: "after",
            expression: "async (payload, next) => next(payload)",
          } as never,
        ],
      }),
  );
});

test("dynamic Mod registration updates custom command, event, and middleware validation", async () => {
  const client = new ModCDPClient({
    launcher: { launcher_mode: "none" },
    upstream: { upstream_mode: "ws" },
    injector: { injector_mode: "none" },
    server_config: null,
  });

  assert.deepEqual(
    await client.Mod.addCustomCommand("Custom.dynamic", {
      params_schema: z.object({ text: z.string().min(1) }),
      result_schema: z.object({ ok: z.boolean() }),
    }),
    { name: "Custom.dynamic", registered: true },
  );
  assert.deepEqual(
    await client.Mod.addCustomEvent("Custom.dynamicReady", {
      event_schema: z.object({ id: z.string().uuid() }),
    }),
    { name: "Custom.dynamicReady", registered: true },
  );
  assert.deepEqual(
    await client.Mod.addMiddleware({
      name: "Custom.dynamic",
      phase: client.RESPONSE,
      expression: "async (payload, next) => next(payload)",
    }),
    { name: "Custom.dynamic", phase: "response", registered: true },
  );

  assert.equal(typeof (client as unknown as { Custom: { dynamic: unknown } }).Custom.dynamic, "function");
  assert.deepEqual(client.types.parseCommandParams("Custom.dynamic", { text: "ok" }), { text: "ok" });
  assert.deepEqual(client.types.parseCommandResult("Custom.dynamic", { ok: true }), { ok: true });
  assert.deepEqual(
    client.types.parseEventPayload("Custom.dynamicReady", {
      id: "550e8400-e29b-41d4-a716-446655440000",
    }),
    { id: "550e8400-e29b-41d4-a716-446655440000" },
  );
  assert.deepEqual(client.types.customMiddlewareWireRegistrations(), [
    {
      name: "Custom.dynamic",
      phase: "response",
      expression: "async (payload, next) => next(payload)",
    },
  ]);
  assert.throws(() => client.types.parseCommandParams("Custom.dynamic", { text: "" }));
  assert.throws(() => client.types.parseCommandResult("Custom.dynamic", { ok: "yes" }));
  assert.throws(() => client.types.parseEventPayload("Custom.dynamicReady", { id: "nope" }));
  await assert.rejects(() =>
    client.Mod.addMiddleware({
      name: "Custom.dynamic",
      phase: "after" as never,
      expression: "async (payload, next) => next(payload)",
    }),
  );
});

test("client.types update replaces the registry with extended runtime validation and preserves static custom aliases on typed clients", () => {
  const client = new ModCDPClient({
    launcher: { launcher_mode: "none" },
    upstream: { upstream_mode: "ws" },
    injector: { injector_mode: "none" },
    server_config: null,
  });
  const updated_types = client.types.update({
    custom_commands: {
      "Custom.updated": {
        params_schema: z.object({ count: z.number().int().positive() }),
        result_schema: z.object({ done: z.boolean() }),
      },
    },
    custom_events: {
      "Custom.updatedReady": { event_schema: z.object({ ready: z.boolean() }) },
    },
    custom_middlewares: [
      {
        name: "Custom.updated",
        phase: "request",
        expression: "async (payload, next) => next(payload)",
      },
    ],
  });
  const typed_client = new ModCDPClient({
    launcher: { launcher_mode: "none" },
    upstream: { upstream_mode: "ws" },
    injector: { injector_mode: "none" },
    server_config: null,
    types: updated_types,
  });
  client.types = updated_types;

  if (false) {
    const params: Parameters<typeof typed_client.Custom.updated>[0] = {
      count: 1,
    };
    void params;
    const result: Awaited<ReturnType<typeof typed_client.Custom.updated>> = { done: true };
    void result;
    typed_client.on("Custom.updatedReady", (event) => {
      const ready: boolean = event.ready;
      void ready;
      // @ts-expect-error Custom.updatedReady.ready is boolean.
      const badReady: string = event.ready;
      void badReady;
    });
    // @ts-expect-error Custom.updated count is required.
    typed_client.Custom.updated({});
    // @ts-expect-error Custom.updated returns a CDP-style result object.
    const badResult: Awaited<ReturnType<typeof typed_client.Custom.updated>> = true;
    void badResult;
  }

  assert.equal(typeof (client as unknown as { Custom: { updated: unknown } }).Custom.updated, "function");
  assert.deepEqual(client.types.parseCommandParams("Custom.updated", { count: 1 }), { count: 1 });
  assert.deepEqual(client.types.parseCommandResult("Custom.updated", { done: true }), { done: true });
  assert.deepEqual(client.types.parseEventPayload("Custom.updatedReady", { ready: true }), { ready: true });
  assert.deepEqual(client.types.customMiddlewareWireRegistrations(), [
    {
      name: "Custom.updated",
      phase: "request",
      expression: "async (payload, next) => next(payload)",
    },
  ]);
  assert.throws(() => client.types.parseCommandParams("Custom.updated", { count: 0 }));
  assert.throws(() => client.types.parseCommandResult("Custom.updated", { done: "true" }));
  assert.throws(() => client.types.parseEventPayload("Custom.updatedReady", { ready: "true" }));
});
