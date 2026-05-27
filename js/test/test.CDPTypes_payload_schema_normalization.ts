// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_CDPTypes_payload_schema_normalization.py
// - ./go/modcdp/client/CDPTypes_payload_schema_normalization_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import { CDPTypes } from "../src/types/CDPTypes.js";
import { ModCDPConfigureParamsSchema, validateZodSchema } from "../src/types/modcdp.js";

test("validateZodSchema accepts empty zod shapes", () => {
  const schema = validateZodSchema({});
  assert.deepEqual(schema?.parse({ value: 1 }), { value: 1 });
});

test("validateZodSchema rejects unsupported schema specs", () => {
  assert.throws(() => validateZodSchema("not-a-schema" as never), /Unsupported payload schema/);
});

test("validateZodSchema accepts non-empty zod shapes", () => {
  const schema = validateZodSchema({ value: z.string() });
  assert.deepEqual(schema?.parse({ value: "ok", extra: true }), { value: "ok", extra: true });
});

test("CDPTypes serializes builtin Mod command schemas through the same wire path", () => {
  const types = new CDPTypes();

  for (const name of ["Mod.configure", "Mod.addCustomCommand", "Mod.addCustomEvent"]) {
    const registration = types.customCommandWireRegistrations().find((command) => command.name === name);
    assert.notEqual(registration, undefined);
    assert.equal(typeof registration?.params_schema, "object");
    assert.equal(typeof registration?.result_schema, "object");
  }

  const configure_registration = types
    .customCommandWireRegistrations()
    .find((command) => command.name === "Mod.configure");
  const configure_schema = validateZodSchema(configure_registration?.params_schema);
  const parsed_configure_params = ModCDPConfigureParamsSchema.parse(
    configure_schema?.parse({
      client_config: { client_hydrate_aliases: false },
      downstream: {
        downstream_client_timeout_ms: 1234,
        downstream_close_browser_on_disconnect: true,
      },
    }),
  );
  assert.equal(parsed_configure_params?.client_config.client_hydrate_aliases, false);
  assert.equal(parsed_configure_params?.downstream.downstream_client_timeout_ms, 1234);
  assert.equal(parsed_configure_params?.downstream.downstream_close_browser_on_disconnect, true);
  assert.throws(
    () =>
      configure_schema?.parse({
        downstream: {
          closeBrowser: "not allowed over the wire",
        },
      }),
    /Unrecognized key/,
  );
});
