import { BrowserLauncher, type LauncherConfig, type LaunchedBrowser } from "./BrowserLauncher.js";

class NoneBrowserLauncher extends BrowserLauncher {
  constructor(options: LauncherConfig = {}) {
    super(options);
    this.launcher_mode = "none";
  }

  async launch(_options: LauncherConfig = {}): Promise<LaunchedBrowser> {
    this.launched = { cdp_url: null, close: async () => {} };
    return this.launched;
  }
}

export { NoneBrowserLauncher };
