import { describe, expect, it } from "vitest";

import { BrowserLauncher } from "../src/launcher/BrowserLauncher.js";

describe("BrowserLauncher", () => {
  it("merges local browser launch args without mixing in remote CDP config", async () => {
    const launcher = new BrowserLauncher({
      launcher_local_user_data_dir: "/tmp/modcdp-browser-launcher",
      launcher_bb_extension_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      launcher_local_args: ["--load-extension=/tmp/args-one"],
      launcher_local_extra_args: ["--load-extension=/tmp/one"],
    });
    launcher.update({
      launcher_local_args: ["--load-extension=/tmp/args-two", "--lang=en-US"],
      launcher_local_extra_args: ["--load-extension=/tmp/two", "--window-size=900,700"],
    });

    expect(launcher.config.launcher_local_args).toEqual([
      "--lang=en-US",
      "--load-extension=/tmp/args-one,/tmp/args-two",
    ]);
    expect(launcher.config.launcher_local_extra_args).toEqual([
      "--window-size=900,700",
      "--load-extension=/tmp/one,/tmp/two",
    ]);
    expect(launcher.config.launcher_local_user_data_dir).toEqual("/tmp/modcdp-browser-launcher");
    expect(launcher.config.launcher_bb_extension_id).toEqual("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    await expect(launcher.launch()).rejects.toThrow("BrowserLauncher.launch is not implemented.");
  });

  it("carries remote CDP config separately from launch args", async () => {
    const launcher = new BrowserLauncher({
      launcher_remote_cdp_url: "ws://127.0.0.1:9222/devtools/browser/initial",
    });
    launcher.update({
      launcher_remote_cdp_url: "ws://127.0.0.1:9222/devtools/browser/updated",
    });

    expect(launcher.config.launcher_remote_cdp_url).toEqual("ws://127.0.0.1:9222/devtools/browser/updated");
    expect(launcher.config.launcher_local_args).toEqual([]);
    expect(launcher.config.launcher_local_extra_args).toEqual([]);
  });
});
