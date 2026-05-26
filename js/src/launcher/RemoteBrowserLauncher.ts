import {
  BrowserLauncher,
  resolveCdpWebSocketUrl,
  type LauncherOptions,
  type LaunchedBrowser,
} from "./BrowserLauncher.js";

export class RemoteBrowserLauncher extends BrowserLauncher {
  async launch(options: LauncherOptions = {}): Promise<LaunchedBrowser> {
    const endpoint = options.cdp_url ?? this.cdp_url ?? this.remote_cdp_url;
    if (!endpoint) throw new Error("launcher.launcher_mode=remote requires upstream_cdp_url.");
    // cdp_url is resolved here so downstream transports can dial it directly.
    const cdp_url = await resolveCdpWebSocketUrl(endpoint, "remote cdp_url");
    this.launched = { cdp_url, close: async () => {} };
    return this.launched;
  }
}
