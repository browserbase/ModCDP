// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_ModCDPClientCustomFlatNamespace.py
// - ./go/modcdp/client/ModCDPClientCustomFlatNamespace_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { z } from "zod";

import { ModCDPClient } from "../src/index.js";
import { ModCDPServer } from "../src/server/ModCDPServer.js";
import { loadExtensionTestBrowserPath } from "./browserPaths.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, "..", "..", "dist", "extension");
const LOAD_EXTENSION_TEST_BROWSER_PATH = loadExtensionTestBrowserPath();

test("custom commands install flat namespace methods through a real service worker", async () => {
  const params_schema = z.object({ id: z.string(), suffix: z.string().optional() });
  const result_schema = z.object({ success: z.boolean() });
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
    server_config: { router: { router_routes: { "*.*": "loopback_cdp" } } },
    types: {
      custom_commands: {
        "Custom.doSomething": {
          params_schema,
          result_schema,
          expression: "async ({ id, suffix = '' }) => ({ success: `${id}${suffix}` === 'abcmiddleware' })",
        },
        "Custom.badResult": {
          params_schema: z.object({ id: z.string() }),
          result_schema,
          expression: "async () => ({ success: 'yes' })",
        },
      },
      custom_middlewares: [
        {
          name: "Custom.doSomething",
          phase: "request",
          expression: "async (payload, next) => next({ ...payload, suffix: 'middleware' })",
        },
      ],
    },
  });

  try {
    await cdp.connect();

    const success: { success: boolean } = await cdp.Custom.doSomething({ id: "abc" });
    const rawSuccess = await cdp.send("Custom.doSomething", { id: "abc" });

    assert.deepEqual(success, { success: true });
    assert.deepEqual(rawSuccess, { success: true });
    if (false) {
      const typed_params: Parameters<typeof cdp.Custom.doSomething>[0] = { id: "abc" };
      void typed_params;
      const typed_result: Awaited<ReturnType<typeof cdp.Custom.doSomething>> = { success: true };
      void typed_result;
      // @ts-expect-error custom command results follow native CDP result-object shape.
      const bad_result: Awaited<ReturnType<typeof cdp.Custom.doSomething>> = true;
      void bad_result;
    }
    // @ts-expect-error typed custom command params reject non-string ids statically.
    await assert.rejects(() => cdp.Custom.doSomething({ id: 123 }));
    await assert.rejects(() => cdp.send("Custom.doSomething", { id: 123 }), /string/);
    await assert.rejects(() => cdp.Custom.badResult({ id: "abc" }), /boolean/);
  } finally {
    await cdp.close();
  }
}, 60_000);

test("custom events validate raw string handlers through a real service worker", async () => {
  const EventSchema = z.object({ data: z.string() });
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
    server_config: { router: { router_routes: { "*.*": "loopback_cdp" } } },
    types: {
      custom_events: {
        "Custom.someEvent": { event_schema: EventSchema },
      },
    },
  });
  const seen: string[] = [];

  try {
    await cdp.connect();
    const received = new Promise<void>((resolve) => {
      cdp.on("Custom.someEvent", (event) => {
        seen.push(event.data);
        resolve();
      });
    });

    await cdp.Mod.evaluate({
      expression:
        "async () => globalThis.__ModCDP_custom_event__(JSON.stringify({ event: 'Custom.someEvent', data: { data: 'ok' }, cdpSessionId: null }))",
    });
    await received;
    assert.deepEqual(seen, ["ok"]);
  } finally {
    await cdp.close();
  }
}, 60_000);

test("dynamic custom command, event, and middleware registration validates through a real service worker", async () => {
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
    server_config: { router: { router_routes: { "*.*": "loopback_cdp" } } },
  });
  const seen: string[] = [];

  try {
    await cdp.connect();

    if (false) {
      cdp.Mod.addCustomCommand("Custom.dynamic", {
        params_schema: z.object({ text: z.string() }),
        result_schema: z.object({ ok: z.boolean() }),
        expression: "async ({ text }) => ({ ok: text === 'live-dynamic' })",
      });
      cdp.Mod.addCustomEvent("Custom.dynamicReady", {
        event_schema: z.object({ id: z.string() }),
      });
      cdp.Mod.addMiddleware({
        name: "Custom.dynamic",
        phase: cdp.REQUEST,
        expression: "async (payload, next) => next(payload)",
      });
      cdp.Mod.addMiddleware({
        name: "Custom.dynamic",
        // @ts-expect-error Mod.addMiddleware phase is request, response, or event.
        phase: "after",
        expression: "async (payload, next) => next(payload)",
      });
    }

    assert.deepEqual(
      await cdp.Mod.addCustomCommand("Custom.dynamic", {
        params_schema: z.object({ text: z.string().min(1) }),
        result_schema: z.object({ ok: z.boolean() }),
        expression: "async ({ text }) => ({ ok: text === 'live-dynamic' })",
      }),
      { name: "Custom.dynamic", registered: true },
    );
    assert.deepEqual(
      await cdp.Mod.addCustomCommand("Custom.dynamicBadResult", {
        params_schema: z.object({ text: z.string() }),
        result_schema: z.object({ ok: z.boolean() }),
        expression: "async () => ({ ok: 'yes' })",
      }),
      { name: "Custom.dynamicBadResult", registered: true },
    );
    assert.deepEqual(
      await cdp.Mod.addCustomEvent("Custom.dynamicReady", {
        event_schema: z.object({ id: z.string().uuid() }),
      }),
      { name: "Custom.dynamicReady", registered: true },
    );
    assert.deepEqual(
      await cdp.Mod.addMiddleware({
        name: "Custom.dynamic",
        phase: cdp.REQUEST,
        expression: "async (payload, next) => next({ ...payload, text: `${payload.text}-dynamic` })",
      }),
      { name: "Custom.dynamic", phase: "request", registered: true },
    );

    assert.deepEqual(await cdp.send("Custom.dynamic", { text: "live" }), { ok: true });
    await assert.rejects(() => cdp.send("Custom.dynamic", { text: "" }), /Too small/);
    await assert.rejects(() => cdp.send("Custom.dynamicBadResult", { text: "live" }), /boolean/);
    await assert.rejects(
      () =>
        cdp.Mod.addMiddleware({
          name: "Custom.dynamic",
          // @ts-expect-error dynamic middleware registration rejects invalid phases statically.
          phase: "after",
          expression: "async (payload, next) => next(payload)",
        }),
      /Invalid option/,
    );

    const received = new Promise<void>((resolve) => {
      cdp.on("Custom.dynamicReady", () => {
        seen.push("ready");
        resolve();
      });
    });
    await cdp.Mod.evaluate({
      expression:
        "async () => globalThis.__ModCDP_custom_event__(JSON.stringify({ event: 'Custom.dynamicReady', data: { id: '550e8400-e29b-41d4-a716-446655440000' }, cdpSessionId: null }))",
    });
    await received;
    assert.deepEqual(seen, ["ready"]);
  } finally {
    await cdp.close();
  }
}, 60_000);

test("assigned type registry validates updated custom command, event, and middleware schemas through a real service worker", async () => {
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
    server_config: { router: { router_routes: { "*.*": "loopback_cdp" } } },
  });
  const updated_types = cdp.types.update({
    custom_commands: {
      "Custom.updated": {
        params_schema: z.object({ count: z.number().int().nonnegative() }),
        result_schema: z.object({ done: z.boolean() }),
        expression: "async ({ count }) => ({ done: count === 2 })",
      },
      "Custom.updatedBadResult": {
        params_schema: z.object({ count: z.number() }),
        result_schema: z.object({ done: z.boolean() }),
        expression: "async () => ({ done: 'yes' })",
      },
    },
    custom_events: {
      "Custom.updatedReady": { event_schema: z.object({ ready: z.boolean() }) },
    },
    custom_middlewares: [
      {
        name: "Custom.updated",
        phase: "request",
        expression: "async (payload, next) => next({ ...payload, count: payload.count + 1 })",
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
  cdp.types = updated_types;
  const seen: boolean[] = [];

  if (false) {
    const params: Parameters<typeof typed_client.Custom.updated>[0] = { count: 1 };
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

  try {
    await cdp.connect();

    assert.deepEqual(await cdp.send("Custom.updated", { count: 1 }), { done: true });
    await assert.rejects(() => cdp.send("Custom.updated", { count: -1 }), /Too small/);
    await assert.rejects(() => cdp.send("Custom.updatedBadResult", { count: 1 }), /boolean/);

    const received = new Promise<void>((resolve) => {
      cdp.on("Custom.updatedReady", () => {
        seen.push(true);
        resolve();
      });
    });
    await cdp.Mod.evaluate({
      expression:
        "async () => globalThis.__ModCDP_custom_event__(JSON.stringify({ event: 'Custom.updatedReady', data: { ready: true }, cdpSessionId: null }))",
    });
    await received;
    assert.deepEqual(seen, [true]);
  } finally {
    await cdp.close();
  }
}, 60_000);

test("schema-only custom commands register without a websocket", async () => {
  const cdp = new ModCDPClient({
    launcher: { launcher_mode: "none" },
    upstream: { upstream_mode: "ws" },
    injector: { injector_mode: "none" },
    server_config: null,
  });

  const result = await cdp.send("Mod.addCustomCommand", {
    name: "Custom.echo",
    params_schema: {
      type: "object",
      properties: { text: { type: "string", minLength: 1 } },
      required: ["text"],
      additionalProperties: false,
    },
    result_schema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
      additionalProperties: false,
    },
  });

  assert.deepEqual(result, { name: "Custom.echo", registered: true });
  const command_params_schemas = cdp.types.command_params_schemas;
  const command_result_schemas = cdp.types.command_result_schemas;
  assert.deepEqual(command_params_schemas.get("Custom.echo")?.parse({ text: "ok" }), { text: "ok" });
  assert.throws(() => command_params_schemas.get("Custom.echo")?.parse({ text: "" }));
  assert.throws(() => command_params_schemas.get("Custom.echo")?.parse({ text: "ok", extra: true }));
  assert.deepEqual(command_result_schemas.get("Custom.echo")?.parse({ text: "ok" }), { text: "ok" });
  assert.throws(() => command_result_schemas.get("Custom.echo")?.parse({ text: 123 }));
});

test("constructor custom command and event schemas validate nested payloads", () => {
  const cdp = new ModCDPClient({
    launcher: { launcher_mode: "none" },
    upstream: { upstream_mode: "ws" },
    injector: { injector_mode: "none" },
    server_config: null,
    types: {
      custom_commands: [
        {
          name: "Custom.collect",
          params_schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    count: { type: "integer", minimum: 1 },
                  },
                  required: ["id", "count"],
                  additionalProperties: false,
                },
              },
            },
            required: ["items"],
            additionalProperties: false,
          },
        },
      ],
      custom_events: [
        {
          name: "Custom.ready",
          event_schema: {
            type: "object",
            properties: {
              url: { type: "string", pattern: "^https://" },
              ready: { type: "boolean" },
            },
            required: ["url", "ready"],
            additionalProperties: false,
          },
        },
        { name: "Custom.count", event_schema: { type: "integer", minimum: 1 } },
      ],
    },
  });
  const command_params_schemas = cdp.types.command_params_schemas;
  const event_schemas = cdp.types.event_schemas;

  const valid_params = { items: [{ id: "a", count: 1 }] };
  assert.deepEqual(command_params_schemas.get("Custom.collect")?.parse(valid_params), valid_params);
  assert.throws(() => command_params_schemas.get("Custom.collect")?.parse({ items: [{ id: "a", count: 0 }] }));
  assert.throws(() => command_params_schemas.get("Custom.collect")?.parse({ items: [] }));
  assert.deepEqual(event_schemas.get("Custom.ready")?.parse({ url: "https://example.com", ready: true }), {
    url: "https://example.com",
    ready: true,
  });
  assert.throws(() => event_schemas.get("Custom.ready")?.parse({ url: "http://example.com", ready: true }));
  assert.deepEqual(event_schemas.get("Custom.count")?.parse({ value: 3 }), {
    value: 3,
  });
  assert.throws(() => event_schemas.get("Custom.count")?.parse({ value: 0 }));
});

test("assigned type registry updates runtime validation and aliases", () => {
  const cdp = new ModCDPClient({
    launcher: { launcher_mode: "none" },
    upstream: { upstream_mode: "ws" },
    injector: { injector_mode: "none" },
    server_config: null,
  });

  cdp.types = cdp.types.update({
    custom_commands: {
      "Custom.later": {
        params_schema: z.object({ value: z.number() }),
        result_schema: z.object({ ok: z.boolean() }),
      },
    },
    custom_events: {
      "Custom.laterReady": { event_schema: z.object({ value: z.string() }) },
    },
  });

  assert.equal(typeof (cdp as unknown as { Custom: { later: unknown } }).Custom.later, "function");
  assert.deepEqual(cdp.types.command_params_schemas.get("Custom.later")?.parse({ value: 1 }), { value: 1 });
  assert.deepEqual(cdp.types.parseCommandResult("Custom.later", { ok: true }), { ok: true });
  assert.deepEqual(cdp.types.parseEventPayload("Custom.laterReady", { value: "ok" }), { value: "ok" });
});

test("service worker server validates registered custom command and event schemas", async () => {
  const modcdp_global = globalThis as typeof globalThis & {
    ModCDP?: ModCDPServer;
  };
  const previous_modcdp = modcdp_global.ModCDP;
  const server = new ModCDPServer();
  modcdp_global.ModCDP = server;

  try {
    await server.configure({
      router: { router_routes: { "*.*": "chromedebugger" } },
    });

    server.addCustomCommand({
      name: "Custom.double",
      params_schema: z.object({ value: z.number() }),
      result_schema: z.object({ value: z.number() }),
      expression: "async (params) => ({ value: params.value * 2 })",
    });
    assert.deepEqual(server.client?.types.command_params_schemas.get("Custom.double")?.parse({ value: 2 }), {
      value: 2,
    });
    assert.deepEqual(server.client?.types.command_result_schemas.get("Custom.double")?.parse({ value: 4 }), {
      value: 4,
    });
    assert.equal(
      server.client?.types.custom_commands.get("Custom.double")?.expression,
      "async (params) => ({ value: params.value * 2 })",
    );

    server.addCustomCommand({
      name: "Custom.badResult",
      result_schema: z.object({ ok: z.boolean() }),
      expression: 'async () => ({ ok: "yes" })',
    });
    assert.equal(
      server.client?.types.custom_commands.get("Custom.badResult")?.expression,
      'async () => ({ ok: "yes" })',
    );

    server.addCustomEvent({
      name: "Custom.ready",
      event_schema: z.object({ ok: z.boolean() }),
    });
    assert.deepEqual(server.client?.types.event_schemas.get("Custom.ready")?.parse({ ok: true }), { ok: true });
    assert.throws(() => server.client?.types.parseEventPayload("Custom.ready", { ok: "yes" }));
  } finally {
    server.downstream.stop("test complete");
    if (previous_modcdp) modcdp_global.ModCDP = previous_modcdp;
    else delete modcdp_global.ModCDP;
  }
});
