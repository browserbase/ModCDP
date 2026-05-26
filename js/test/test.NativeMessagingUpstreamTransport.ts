import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "vitest";

import {
  defaultNativeMessagingManifestPaths,
  NativeMessagingUpstreamTransport,
} from "../src/transport/NativeMessagingUpstreamTransport.js";

describe.sequential("NativeMessagingUpstreamTransport", () => {
  test("nativemessaging upstream config owns host and injector config", async () => {
    const transport = new NativeMessagingUpstreamTransport({
      upstream_nativemessaging_host_name: "com.modcdp.test",
    });
    assert.deepEqual(transport.getInjectorConfig(), {
      upstream_nativemessaging_host_name: "com.modcdp.test",
    });
    assert.deepEqual(transport.getServerConfig(), {});
    assert.equal(transport.upstream_nativemessaging_url, "native://com.modcdp.test");
    assert.deepEqual(defaultNativeMessagingManifestPaths("com.modcdp.test", "/tmp/modcdp-home"), [
      ...defaultManifestPathsForPlatform("com.modcdp.test", "/tmp/modcdp-home"),
    ]);
  });

  test("nativemessaging upstream connects to native messaging stdio directly", async () => {
    const transport = new NativeMessagingUpstreamTransport();

    try {
      await transport.connect();
      await transport.waitForPeer();
      await transport.close();
    } finally {
      await transport.close();
    }
  });
});

function defaultManifestPathsForPlatform(upstream_nativemessaging_host_name: string, home: string) {
  if (process.platform === "darwin") {
    return [
      `${home}/Library/Application Support/Google/Chrome/NativeMessagingHosts/${upstream_nativemessaging_host_name}.json`,
      `${home}/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts/${upstream_nativemessaging_host_name}.json`,
      `${home}/Library/Application Support/Google/ChromeForTesting/NativeMessagingHosts/${upstream_nativemessaging_host_name}.json`,
      `${home}/Library/Application Support/Google Chrome for Testing/NativeMessagingHosts/${upstream_nativemessaging_host_name}.json`,
      `${home}/Library/Application Support/Google Chrome SxS/NativeMessagingHosts/${upstream_nativemessaging_host_name}.json`,
      `${home}/Library/Application Support/Chromium/NativeMessagingHosts/${upstream_nativemessaging_host_name}.json`,
    ];
  }
  if (process.platform === "linux") {
    return [
      `${home}/.config/google-chrome/NativeMessagingHosts/${upstream_nativemessaging_host_name}.json`,
      `${home}/.config/google-chrome-for-testing/NativeMessagingHosts/${upstream_nativemessaging_host_name}.json`,
      `${home}/.config/chromium/NativeMessagingHosts/${upstream_nativemessaging_host_name}.json`,
      `${home}/.config/chromium-browser/NativeMessagingHosts/${upstream_nativemessaging_host_name}.json`,
    ];
  }
  if (process.platform === "win32") {
    return [path.join(home, ".modcdp", "native-messaging", `${upstream_nativemessaging_host_name}.json`)];
  }
  throw new Error("Native messaging host manifest path discovery is not supported on this platform.");
}
