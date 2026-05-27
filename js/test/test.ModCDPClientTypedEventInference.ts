// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_ModCDPClientTypedEventInference.py
// - ./go/modcdp/client/ModCDPClientTypedEventInference_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import { test } from "vitest";

import { ModCDPClient } from "../src/index.js";

test("typed CDP event tokens infer callback payloads without local type aliases", () => {
  const cdp = new ModCDPClient({
    launcher: { launcher_mode: "none" },
    upstream: { upstream_mode: "ws" },
    injector: { injector_mode: "none" },
    server_config: null,
  });
  const seen: string[] = [];

  cdp.on(cdp.Target.targetCreated, (event) => {
    seen.push(event.targetInfo.targetId);
    if (false) {
      // @ts-expect-error Target.targetCreated payload has targetInfo, not targetId at the top level.
      seen.push(event.targetId);
    }
  });

  cdp.emit("Target.targetCreated", {
    targetInfo: {
      targetId: "target-1",
      type: "page",
      title: "Example",
      url: "https://example.com",
      attached: true,
      canAccessOpener: false,
    },
  });

  assert.deepEqual(seen, ["target-1"]);
});
