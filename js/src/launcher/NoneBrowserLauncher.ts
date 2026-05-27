// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/launcher/NoneBrowserLauncher.py
// - ./go/modcdp/launcher/NoneBrowserLauncher.go
import { BrowserLauncher, type LauncherConfig, type LaunchedBrowser } from "./BrowserLauncher.js";

class NoneBrowserLauncher extends BrowserLauncher {
  constructor(config: LauncherConfig = {}) {
    super({ ...config, launcher_mode: "none" });
  }

  async launch(_config: LauncherConfig = {}): Promise<LaunchedBrowser> {
    this.launched = { cdp_url: null, close: async () => {} };
    return this.launched;
  }
}

export { NoneBrowserLauncher };
