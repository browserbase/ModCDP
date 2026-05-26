from __future__ import annotations

from ..launcher.BrowserLauncher import LauncherOptions, BrowserLauncher, LaunchedBrowser


class NoneBrowserLauncher(BrowserLauncher):
    def launch(self, options: LauncherOptions | None = None) -> LaunchedBrowser:
        self.launched = {"cdp_url": None, "close": lambda: None}
        return self.launched
