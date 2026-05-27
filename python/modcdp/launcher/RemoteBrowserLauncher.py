# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/launcher/RemoteBrowserLauncher.ts
# - ./go/modcdp/launcher/RemoteBrowserLauncher.go
from __future__ import annotations

from typing import cast

from ..launcher.BrowserLauncher import LauncherOptions, BrowserLauncher, LaunchedBrowser, resolveCdpWebSocketUrl


class RemoteBrowserLauncher(BrowserLauncher):
    def launch(self, options: LauncherOptions | None = None) -> LaunchedBrowser:
        merged = {**self.options, **dict(options or {})}
        cdp_url = merged.get("launcher_remote_cdp_url")
        if not cdp_url:
            raise RuntimeError("launcher.launcher_mode=remote requires launcher_remote_cdp_url.")
        # cdp_url is resolved here so downstream transports can dial it directly.
        cdp_url = resolveCdpWebSocketUrl(cast(str, cdp_url), "launcher_remote_cdp_url")
        self.launched = {"cdp_url": cdp_url, "close": lambda: None}
        return self.launched
