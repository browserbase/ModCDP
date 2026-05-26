import { describe, expect, it } from "vitest";

import { BrowserLauncher } from "../src/launcher/BrowserLauncher.js";

describe("BrowserLauncher", () => {
  it("merges launch config and exposes transport/injector config without launching a browser", async () => {
    const launcher = new BrowserLauncher({
      cdp_url: "ws://127.0.0.1:9222/devtools/browser/initial",
      user_data_dir: "/tmp/modcdp-browser-launcher",
      browserbase_api_key: "test-key",
      injector_extension_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      args: ["--load-extension=/tmp/args-one"],
      extra_args: ["--load-extension=/tmp/one"],
    });
    launcher.update({
      cdp_url: "ws://127.0.0.1:9222/devtools/browser/updated",
      args: ["--load-extension=/tmp/args-two", "--lang=en-US"],
      extra_args: ["--load-extension=/tmp/two", "--window-size=900,700"],
    });

    expect(launcher.args).toEqual(["--lang=en-US", "--load-extension=/tmp/args-one,/tmp/args-two"]);
    expect(launcher.extra_args).toEqual(["--window-size=900,700", "--load-extension=/tmp/one,/tmp/two"]);
    expect(launcher.cdp_url).toEqual("ws://127.0.0.1:9222/devtools/browser/updated");
    expect(launcher.user_data_dir).toEqual("/tmp/modcdp-browser-launcher");
    expect(launcher.browserbase_api_key).toEqual("test-key");
    expect(launcher.injector_extension_id).toEqual("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    await expect(launcher.launch()).rejects.toThrow("BrowserLauncher.launch is not implemented.");
  });
});
