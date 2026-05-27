// MODCDP_TS_ONLY_TEST: DO NOT TRANSLATE THIS TEST FILE TO OTHER LANGUAGES.
// DownstreamTransportSet: TS-only service-worker downstream transport set coverage.
// If a translated sibling is added, all test cases, descriptions, covered edge cases, and setup must be kept perfectly 1:1 in sync.
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import { test } from "vitest";

import { DownstreamTransportSet } from "../src/transport/DownstreamTransportSet.js";
import { ModCDPConfigureParamsSchema } from "../src/types/modcdp.js";

test("DownstreamTransportSet owns downstream client lease expiry", async () => {
  let close_count = 0;
  const downstream = new DownstreamTransportSet({
    downstream_client_timeout_ms: 10,
    downstream_close_browser_on_disconnect: true,
    closeBrowser: () => {
      close_count += 1;
    },
  });

  assert.equal(downstream.hasClientLease(), false);
  downstream.touchClientLease();
  assert.equal(downstream.hasClientLease(), true);

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(downstream.hasClientLease(), false);
  assert.equal(close_count, 1);
});

test("DownstreamTransportSet clears downstream client lease", async () => {
  let close_count = 0;
  const downstream = new DownstreamTransportSet({
    downstream_client_timeout_ms: 10,
    downstream_close_browser_on_disconnect: true,
    closeBrowser: () => {
      close_count += 1;
    },
  });

  downstream.touchClientLease();
  assert.equal(downstream.clearClientLease(), true);
  assert.equal(downstream.clearClientLease(), false);

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(downstream.hasClientLease(), false);
  assert.equal(close_count, 0);
});

test("DownstreamTransportSet preserves live closeBrowser handler when wire config omits it", async () => {
  let close_count = 0;
  const downstream = new DownstreamTransportSet({
    downstream_client_timeout_ms: 10,
    downstream_close_browser_on_disconnect: true,
    closeBrowser: () => {
      close_count += 1;
    },
  });
  const parsed_config = ModCDPConfigureParamsSchema.parse({
    downstream: {
      downstream_client_timeout_ms: 10,
      downstream_close_browser_on_disconnect: true,
    },
  });

  downstream.update(parsed_config.downstream);
  downstream.touchClientLease();

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(close_count, 1);
});
