import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { z } from "zod";

import { ModCDPClient } from "../src/index.js";
import { ModCDPServer } from "../src/server/ModCDPServer.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, "..", "..", "dist", "extension");

test("custom commands install flat namespace methods through a real service worker", async () => {
  const params_schema = z.object({ id: z.string() });
  const result_schema = z.object({ success: z.boolean() });
  const cdp = new ModCDPClient({
    launcher: {
      launcher_mode: "local",
      launcher_local_headless: true,
    },
    upstream: { upstream_mode: "ws" },
    injector: {
      injector_mode: "cdp",
      injector_cdp_extension_path: EXTENSION_PATH,
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
    server_options: { router: { router_routes: { "*.*": "loopback_cdp" } } },
    types: {
      custom_commands: {
        "Custom.doSomething": {
          params_schema,
          result_schema,
          expression: "async ({ id }) => ({ success: id === 'abc' })",
        },
      },
    },
  });

  try {
    await cdp.connect();

    const success: boolean = await cdp.Custom.doSomething({ id: "abc" });
    const rawSuccess: boolean = Boolean(await cdp.send("Custom.doSomething", { id: "abc" }));

    assert.equal(success, true);
    assert.equal(rawSuccess, true);
    // @ts-expect-error typed custom command params reject non-string ids statically.
    await assert.rejects(() => cdp.Custom.doSomething({ id: 123 }));
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
    },
    upstream: { upstream_mode: "ws" },
    injector: {
      injector_mode: "cdp",
      injector_cdp_extension_path: EXTENSION_PATH,
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
    server_options: { router: { router_routes: { "*.*": "loopback_cdp" } } },
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

test("schema-only custom commands register without a websocket", async () => {
  const cdp = new ModCDPClient({
    launcher: { launcher_mode: "none" },
    upstream: { upstream_mode: "ws" },
    injector: { injector_mode: "none" },
    server_options: null,
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
    server_options: null,
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
    server_options: null,
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
  assert.equal(cdp.types.parseCommandResult("Custom.later", { ok: true }), true);
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
      server_options: { router: { router_routes: { "*.*": "chromedebugger" } } },
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
