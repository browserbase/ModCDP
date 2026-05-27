import { BrowserLauncher, type LauncherOptions, type LaunchedBrowser } from "./BrowserLauncher.js";

class NoneBrowserLauncher extends BrowserLauncher {
  constructor(options: LauncherOptions = {}) {
    super(options);
    this.launcher_mode = "none";
  }

  async launch(_options: LauncherOptions = {}): Promise<LaunchedBrowser> {
    this.launched = { cdp_url: null, close: async () => {} };
    return this.launched;
  }
}

export { NoneBrowserLauncher };
