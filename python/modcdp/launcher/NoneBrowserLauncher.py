# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/launcher/NoneBrowserLauncher.ts
# - ./go/modcdp/launcher/NoneBrowserLauncher.go
from __future__ import annotations

from ..launcher.BrowserLauncher import LauncherConfig, BrowserLauncher, LaunchedBrowser


class NoneBrowserLauncher(BrowserLauncher):
    def launch(self, config: LauncherConfig | dict | None = None) -> LaunchedBrowser:
        self.launched = {"cdp_url": None, "close": lambda: None}
        return self.launched
