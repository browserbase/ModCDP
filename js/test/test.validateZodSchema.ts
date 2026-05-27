import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import { validateZodSchema } from "../src/types/modcdp.js";

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
