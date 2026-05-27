# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/launcher/BrowserLauncher.ts
# - ./go/modcdp/launcher/BrowserLauncher.go
from __future__ import annotations

import json
import re
import urllib.request
from collections.abc import Callable
from typing import Any, TypedDict, cast

from typing_extensions import NotRequired


class LauncherOptions(TypedDict, total=False):
    launcher_mode: str
    launcher_local_executable_path: str | None
    launcher_local_user_data_dir: str | None
    launcher_local_cdp_listen_port: int | None
    launcher_remote_cdp_url: str | None
    launcher_local_headless: bool
    launcher_local_sandbox: bool
    launcher_local_args: list[str]
    launcher_local_extra_args: list[str]
    launcher_local_cdp_transport: str
    launcher_local_loopback_cdp: bool
    launcher_local_cleanup_user_data_dir: bool
    launcher_local_chrome_ready_timeout_ms: int
    launcher_local_chrome_ready_poll_interval_ms: int
    launcher_bb_api_key: str | None
    launcher_bb_base_url: str | None
    launcher_bb_session_id: str | None
    launcher_bb_keep_alive: bool
    launcher_bb_close_session_on_close: bool
    launcher_bb_region: str | None
    launcher_bb_timeout: int | None
    launcher_bb_extension_id: str | None
    launcher_bb_browser_settings: dict[str, Any] | None
    launcher_bb_user_metadata: dict[str, Any] | None
    launcher_bb_session_create_params: dict[str, Any] | None


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

    def __init__(self, options: LauncherOptions | None = None) -> None:
        self.options = cast(LauncherOptions, dict(options or {}))
        self.launched = None

    def update(self, config: LauncherOptions | None = None) -> "BrowserLauncher":
        config = cast(LauncherOptions, dict(config or {}))
        self.options = cast(
            LauncherOptions,
            {
                **self.options,
                **config,
                **({"launcher_local_args": merge_chrome_args(self.options.get("launcher_local_args"), config["launcher_local_args"])} if "launcher_local_args" in config else {}),
                **(
                    {"launcher_local_extra_args": merge_chrome_args(self.options.get("launcher_local_extra_args"), config["launcher_local_extra_args"])}
                    if "launcher_local_extra_args" in config
                    else {}
                ),
            },
        )
        return self

    def configForUpstream(self) -> dict[str, Any]:
        return {
            "upstream_ws_cdp_url": (self.launched or {}).get("cdp_url") or self.options.get("launcher_remote_cdp_url"),
        }

    def configForServer(self) -> dict[str, Any]:
        loopback_cdp_url = (self.launched or {}).get("loopback_cdp_url")
        return {"upstream": {"upstream_ws_cdp_url": loopback_cdp_url}} if loopback_cdp_url else {}

    def configForInjector(self) -> dict[str, Any]:
        return {
            "injector_bb_api_key": self.options.get("launcher_bb_api_key"),
            "injector_bb_base_url": self.options.get("launcher_bb_base_url"),
            "injector_bb_extension_id": self.options.get("launcher_bb_extension_id"),
        }

    def launch(self, options: LauncherOptions | None = None) -> LaunchedBrowser:
        raise NotImplementedError(f"{type(self).__name__}.launch is not implemented.")


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
