import {
  BrowserLauncher,
  resolveCdpWebSocketUrl,
  type LauncherOptions,
  type LaunchedBrowser,
} from "./BrowserLauncher.js";

class RemoteBrowserLauncher extends BrowserLauncher {
  constructor(options: LauncherOptions = {}) {
    super(options);
    this.launcher_mode = "remote";
  }

  async launch(options: LauncherOptions = {}): Promise<LaunchedBrowser> {
    const endpoint = options.launcher_remote_cdp_url ?? this.launcher_remote_cdp_url;
    if (!endpoint) throw new Error("launcher.launcher_mode=remote requires launcher_remote_cdp_url.");
    // cdp_url is resolved here so downstream transports can dial it directly.
    const cdp_url = await resolveCdpWebSocketUrl(endpoint, "launcher_remote_cdp_url");
    this.launched = { cdp_url, close: async () => {} };
    return this.launched;
  }
}

export { RemoteBrowserLauncher };
