import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "vitest";

import { CDPExtensionInjector } from "../src/injector/CDPExtensionInjector.js";

test("CDPExtensionInjector prepares the default packaged extension zip", async () => {
  const injector = new CDPExtensionInjector();

  try {
    await injector.prepare();
    const unpacked_extension_path = (
      injector as unknown as { unpacked_extension_path?: string | null }
    ).unpacked_extension_path;
    assert.equal(typeof unpacked_extension_path, "string");
    assert.match(unpacked_extension_path!, /modcdp-extension-/);
    assert.equal(
      existsSync(path.join(unpacked_extension_path!, "manifest.json")),
      true,
    );
  } finally {
    await injector.close();
  }
});
