import assert from "node:assert/strict";
import { test } from "vitest";

import { DownstreamTransportSet } from "../src/transport/DownstreamTransportSet.js";

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
