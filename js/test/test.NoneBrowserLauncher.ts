import assert from "node:assert/strict";
import { test } from "vitest";

import { NoneBrowserLauncher } from "../src/launcher/NoneBrowserLauncher.js";

test("NoneBrowserLauncher records an empty launched browser", async () => {
  const launcher = new NoneBrowserLauncher();
  const launched = await launcher.launch();

  assert.equal(launched.cdp_url, null);
  assert.equal(launcher.launched, launched);
  await launched.close();
});
