// MODCDP_TS_ONLY_TEST: DO NOT TRANSLATE THIS TEST FILE TO OTHER LANGUAGES.
// NativeMessagingUpstreamTransport: TS-only native messaging upstream transport coverage.
// If a translated sibling is added, all test cases, descriptions, covered edge cases, and setup must be kept perfectly 1:1 in sync.
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { NativeMessagingUpstreamTransport } from "../src/transport/NativeMessagingUpstreamTransport.js";

describe.sequential("NativeMessagingUpstreamTransport", () => {
  test("nativemessaging upstream connects to native messaging stdio directly", async () => {
    const transport = new NativeMessagingUpstreamTransport();
    assert.equal(transport.config.upstream_nativemessaging_host_name, "com.modcdp.bridge");

    try {
      await transport.connect();
      await transport.waitForPeer();
      await transport.close();
    } finally {
      await transport.close();
    }
  });
});
