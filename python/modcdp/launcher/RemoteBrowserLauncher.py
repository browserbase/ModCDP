# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/launcher/RemoteBrowserLauncher.ts
# - ./go/modcdp/launcher/RemoteBrowserLauncher.go
from __future__ import annotations

from ..launcher.BrowserLauncher import LauncherConfig, BrowserLauncher, LaunchedBrowser, resolveCdpWebSocketUrl, _launcher_config


class RemoteBrowserLauncher(BrowserLauncher):
    def __init__(self, config: LauncherConfig | dict | None = None) -> None:
        raw_config = config.model_dump() if isinstance(config, LauncherConfig) else dict(config or {})
        super().__init__({**raw_config, "launcher_mode": "remote"})

    def launch(self, config: LauncherConfig | dict | None = None) -> LaunchedBrowser:
        merged = self.config if config is None else _launcher_config({**self.config.model_dump(), **_launcher_config(config).model_dump(exclude_unset=True)})
        cdp_url = merged.launcher_remote_cdp_url
        if not cdp_url:
            raise RuntimeError("launcher_mode=remote requires launcher_remote_cdp_url.")
        cdp_url = resolveCdpWebSocketUrl(cdp_url, "launcher_remote_cdp_url")
        self.launched = LaunchedBrowser(cdp_url=cdp_url, close=lambda: None)
        return self.launched
