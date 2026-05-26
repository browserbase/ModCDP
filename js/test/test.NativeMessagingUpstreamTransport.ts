import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { NativeMessagingUpstreamTransport } from "../src/transport/NativeMessagingUpstreamTransport.js";

describe.sequential("NativeMessagingUpstreamTransport", () => {
  test("nativemessaging upstream connects to native messaging stdio directly", async () => {
    const transport = new NativeMessagingUpstreamTransport();
    assert.deepEqual(transport.getInjectorConfig(), {
      upstream_nativemessaging_host_name: "com.modcdp.bridge",
    });
    assert.deepEqual(transport.getServerConfig(), {});

    try {
      await transport.connect();
      await transport.waitForPeer();
      await transport.close();
    } finally {
      await transport.close();
    }
  });
});
