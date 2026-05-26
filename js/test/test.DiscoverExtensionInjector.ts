import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { ModCDPClient } from "../src/client/ModCDPClient.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, "..", "..", "dist", "extension");

test("DiscoverExtensionInjector attaches to an already-loaded real ModCDP extension", async () => {
  const owner = new ModCDPClient({
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
  });
  let cdp: ModCDPClient | null = null;

  try {
    await owner.connect();
    cdp = new ModCDPClient({
      launcher: { launcher_mode: "remote", launcher_remote_cdp_url: owner.upstream.upstream_ws_cdp_url },
      upstream: { upstream_mode: "ws", upstream_ws_cdp_url: owner.upstream.upstream_ws_cdp_url },
      injector: {
        injector_mode: "discover",
        injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
        injector_trust_service_worker_target: true,
      },
    });
    await cdp.connect();
    assert.equal(cdp.connect_timing?.injector_source, "discover");
    assert.equal(cdp.injector?.extension_id, "mdedooklbnfejodmnhmkdpkaedafkehf");
    assert.equal(
      await cdp.Mod.evaluate({ expression: "chrome.runtime.getURL('modcdp/service_worker.js')" }),
      "chrome-extension://mdedooklbnfejodmnhmkdpkaedafkehf/modcdp/service_worker.js",
    );
  } finally {
    await cdp?.close();
    await owner.close();
  }
}, 60_000);
