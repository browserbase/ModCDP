# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/launcher/BrowserLauncher.ts
# - ./go/modcdp/launcher/BrowserLauncher.go
from __future__ import annotations

import json
import re
import urllib.request
from collections.abc import Callable
from typing import TYPE_CHECKING, Any, TypeAlias

from ..types.modcdp import LaunchedBrowser, ModCDPLauncherConfig
from ..types.toJSON import modCDPToJSON

if TYPE_CHECKING:
    from ..transport.UpstreamTransport import UpstreamTransport


LauncherConfig: TypeAlias = ModCDPLauncherConfig


DEFAULT_CHROME_READY_TIMEOUT_MS = 45_000
DEFAULT_CHROME_READY_POLL_INTERVAL_MS = 100
CDP_URL_SCHEME_RE = re.compile(r"^[a-z][a-z\d+\-.]*://", re.I)


class BrowserLauncher:
    launched: LaunchedBrowser | None

    def __init__(self, config: LauncherConfig | dict[str, Any] | None = None) -> None:
        self.config = _launcher_config(config)
        self.launched = None

    def update(self, config: LauncherConfig | dict[str, Any] | None = None) -> "BrowserLauncher":
        incoming = _launcher_config(config)
        updates = incoming.model_dump(exclude_unset=True)
        if "launcher_local_args" in incoming.model_fields_set:
            updates["launcher_local_args"] = merge_chrome_args(self.config.launcher_local_args, incoming.launcher_local_args)
        if "launcher_local_extra_args" in incoming.model_fields_set:
            updates["launcher_local_extra_args"] = merge_chrome_args(self.config.launcher_local_extra_args, incoming.launcher_local_extra_args)
        self.config = LauncherConfig.model_validate({**self.config.model_dump(), **updates})
        return self

    def configForUpstream(self) -> dict[str, Any]:
        config: dict[str, Any] = {}
        upstream_ws_cdp_url = (self.launched.cdp_url if self.launched is not None else None) or self.config.launcher_remote_cdp_url
        if upstream_ws_cdp_url:
            config["upstream_ws_cdp_url"] = upstream_ws_cdp_url
        return config

    def configForServer(self, upstream: UpstreamTransport) -> dict[str, Any]:
        launcher_local_loopback_cdp_url = self.launched.loopback_cdp_url if self.launched is not None else None
        if not launcher_local_loopback_cdp_url and upstream.config.upstream_mode == "ws" and upstream.config.upstream_ws_cdp_url:
            launcher_local_loopback_cdp_url = upstream.config.upstream_ws_cdp_url
        return {"upstream": {"upstream_mode": "ws", "upstream_ws_cdp_url": launcher_local_loopback_cdp_url}} if launcher_local_loopback_cdp_url else {}

    def launch(self, config: LauncherConfig | dict[str, Any] | None = None) -> LaunchedBrowser:
        raise NotImplementedError(f"{type(self).__name__}.launch is not implemented.")

    def close(self) -> None:
        launched = self.launched
        self.launched = None
        if launched is not None:
            launched.close()

    def toJSON(self) -> dict[str, object]:
        return modCDPToJSON(
            self,
            {
                "state": {
                    "launched": self.launched is not None,
                    "cdp_url": self.launched.cdp_url if self.launched is not None else None,
                    "loopback_cdp_url": self.launched.loopback_cdp_url if self.launched is not None else None,
                    "cdp_listen_port": self.launched.cdp_listen_port if self.launched is not None else None,
                    "profile_dir": self.launched.profile_dir if self.launched is not None else None,
                    "browserbase_session_id": self.launched.browserbase_session_id if self.launched is not None else None,
                    "browserbase_session_url": self.launched.browserbase_session_url if self.launched is not None else None,
                    "browserbase_debug_url": self.launched.browserbase_debug_url if self.launched is not None else None,
                }
            },
        )


def merge_chrome_args(existing: list[str] | None = None, incoming: list[str] | None = None) -> list[str]:
    args = [*(existing or []), *(incoming or [])]
    load_extension_paths: list[str] = []
    merged: list[str] = []
    for arg in args:
        if not arg.startswith("--load-extension="):
            merged.append(arg)
            continue
        for extension_path in arg[len("--load-extension="):].split(","):
            if extension_path and extension_path not in load_extension_paths:
                load_extension_paths.append(extension_path)
    if load_extension_paths:
        first_url_index = next((index for index, arg in enumerate(merged) if not arg.startswith("-")), -1)
        load_extension_arg = f"--load-extension={','.join(load_extension_paths)}"
        if first_url_index == -1:
            merged.append(load_extension_arg)
        else:
            merged.insert(first_url_index, load_extension_arg)
    return merged


def _launcher_config(config: LauncherConfig | dict[str, Any] | None = None) -> LauncherConfig:
    if isinstance(config, LauncherConfig):
        return config
    return LauncherConfig.model_validate(config or {})


def resolveCdpWebSocketUrl(endpoint: str, name: str = "cdp_url") -> str:
    if endpoint.startswith(("ws://", "wss://")):
        return endpoint
    http_endpoint = endpoint if CDP_URL_SCHEME_RE.match(endpoint) else f"http://{endpoint}"
    with urllib.request.urlopen(f"{http_endpoint.rstrip('/')}/json/version", timeout=10) as response:
        version = json.loads(response.read().decode())
    cdp_url = version.get("webSocketDebuggerUrl") if isinstance(version, dict) else None
    if not isinstance(cdp_url, str) or not cdp_url:
        raise RuntimeError(f"{name} HTTP discovery returned no webSocketDebuggerUrl")
    return cdp_url
