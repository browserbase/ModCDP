// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/launcher/RemoteBrowserLauncher.py
// - ./go/modcdp/launcher/RemoteBrowserLauncher.go
import {
  BrowserLauncher,
  resolveCdpWebSocketUrl,
  type LauncherConfig,
  type LaunchedBrowser,
} from "./BrowserLauncher.js";

class RemoteBrowserLauncher extends BrowserLauncher {
  constructor(config: LauncherConfig = {}) {
    super({ ...config, launcher_mode: "remote" });
  }

  async launch(config: LauncherConfig = {}): Promise<LaunchedBrowser> {
    const endpoint = config.launcher_remote_cdp_url ?? this.config.launcher_remote_cdp_url;
    if (!endpoint) throw new Error("launcher_mode=remote requires launcher_remote_cdp_url.");
    // cdp_url is resolved here so downstream transports can dial it directly.
    const cdp_url = await resolveCdpWebSocketUrl(endpoint, "launcher_remote_cdp_url");
    this.launched = { cdp_url, close: async () => {} };
    return this.launched;
  }
}

export { RemoteBrowserLauncher };
