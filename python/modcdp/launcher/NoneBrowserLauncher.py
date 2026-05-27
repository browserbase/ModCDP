# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/launcher/NoneBrowserLauncher.ts
# - ./go/modcdp/launcher/NoneBrowserLauncher.go
from __future__ import annotations

from ..launcher.BrowserLauncher import LauncherConfig, BrowserLauncher, LaunchedBrowser


class NoneBrowserLauncher(BrowserLauncher):
    def __init__(self, config: LauncherConfig | dict | None = None) -> None:
        raw_config = config.model_dump() if isinstance(config, LauncherConfig) else dict(config or {})
        super().__init__({**raw_config, "launcher_mode": "none"})

    def launch(self, config: LauncherConfig | dict | None = None) -> LaunchedBrowser:
        self.launched = LaunchedBrowser(cdp_url=None, close=lambda: None)
        return self.launched
