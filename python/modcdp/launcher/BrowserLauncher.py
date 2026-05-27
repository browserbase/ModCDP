# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/launcher/BrowserLauncher.ts
# - ./go/modcdp/launcher/BrowserLauncher.go
from __future__ import annotations

import json
import re
import urllib.request
from collections.abc import Callable
from typing import Any, Literal, TypedDict, cast

from pydantic import BaseModel, ConfigDict, Field
from typing_extensions import NotRequired


class LauncherConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True)

    launcher_mode: Literal["local", "remote", "bb", "none"] = "none"
    launcher_local_executable_path: str | None = None
    launcher_local_user_data_dir: str | None = None
    launcher_local_cdp_listen_port: int | None = None
    launcher_remote_cdp_url: str | None = None
    launcher_local_headless: bool | None = None
    launcher_local_sandbox: bool | None = None
    launcher_local_args: list[str] = Field(default_factory=list)
    launcher_local_extra_args: list[str] = Field(default_factory=list)
    launcher_local_cdp_transport: str = "port"
    launcher_local_loopback_cdp: bool = False
    launcher_local_cleanup_user_data_dir: bool = False
    launcher_local_chrome_ready_timeout_ms: int = 45_000
    launcher_local_chrome_ready_poll_interval_ms: int = 100
    launcher_bb_api_key: str | None = None
    launcher_bb_base_url: str = "https://api.browserbase.com"
    launcher_bb_session_id: str | None = None
    launcher_bb_keep_alive: bool = False
    launcher_bb_close_session_on_close: bool | None = None
    launcher_bb_region: str | None = None
    launcher_bb_timeout: int | None = None
    launcher_bb_extension_id: str | None = None
    launcher_bb_browser_settings: dict[str, Any] = Field(default_factory=lambda: {"viewport": {"width": 1288, "height": 711}})
    launcher_bb_user_metadata: dict[str, Any] = Field(default_factory=dict)
    launcher_bb_session_create_params: dict[str, Any] = Field(default_factory=lambda: {"userMetadata": {}})


class LaunchedBrowser(TypedDict):
    # Browser websocket CDP endpoint when one exists. Pipe transports expose pipe handles instead.
    cdp_url: str | None
    # Extension-dialable loopback CDP endpoint when it differs from cdp_url.
    loopback_cdp_url: NotRequired[str | None]
    close: Callable[[], Any]
    profile_dir: NotRequired[str | None]
    pipe_read: NotRequired[Any]
    pipe_write: NotRequired[Any]
    browserbase_session_id: NotRequired[str | None]
    browserbase_session_url: NotRequired[str | None]
    browserbase_debug_url: NotRequired[str | None]
    cdp_listen_port: NotRequired[int | None]


DEFAULT_CHROME_READY_TIMEOUT_MS = 45_000
DEFAULT_CHROME_READY_POLL_INTERVAL_MS = 100
CDP_URL_SCHEME_RE = re.compile(r"^[a-z][a-z\d+\-.]*://", re.I)


class BrowserLauncher:
    launched: LaunchedBrowser | None

    def __init__(self, options: LauncherConfig | dict[str, Any] | None = None) -> None:
        self.config = _launcher_config(options)
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
        return {
            "upstream_ws_cdp_url": (self.launched or {}).get("cdp_url") or self.config.launcher_remote_cdp_url,
        }

    def configForServer(self) -> dict[str, Any]:
        loopback_cdp_url = (self.launched or {}).get("loopback_cdp_url")
        return {"upstream": {"upstream_ws_cdp_url": loopback_cdp_url}} if loopback_cdp_url else {}

    def launch(self, options: LauncherConfig | dict[str, Any] | None = None) -> LaunchedBrowser:
        raise NotImplementedError(f"{type(self).__name__}.launch is not implemented.")

    def close(self) -> None:
        launched = self.launched
        self.launched = None
        if launched is not None:
            launched["close"]()


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


def _launcher_config(options: LauncherConfig | dict[str, Any] | None = None) -> LauncherConfig:
    if isinstance(options, LauncherConfig):
        return options
    return LauncherConfig.model_validate(options or {})


def resolveCdpWebSocketUrl(endpoint: str, name: str = "launcher_remote_cdp_url") -> str:
    if endpoint.startswith(("ws://", "wss://")):
        return endpoint
    http_endpoint = endpoint if CDP_URL_SCHEME_RE.match(endpoint) else f"http://{endpoint}"
    with urllib.request.urlopen(f"{http_endpoint.rstrip('/')}/json/version", timeout=10) as response:
        version = json.loads(response.read().decode())
    cdp_url = version.get("webSocketDebuggerUrl") if isinstance(version, dict) else None
    if not isinstance(cdp_url, str) or not cdp_url:
        raise RuntimeError(f"{name} HTTP discovery returned no webSocketDebuggerUrl")
    return cdp_url
