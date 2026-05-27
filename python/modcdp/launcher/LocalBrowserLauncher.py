# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/launcher/LocalBrowserLauncher.ts
# - ./go/modcdp/launcher/LocalBrowserLauncher.go
from __future__ import annotations

import glob
import json
import os
import re
import signal
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path
from typing import Protocol

from ..launcher.BrowserLauncher import (
    DEFAULT_CHROME_READY_POLL_INTERVAL_MS,
    DEFAULT_CHROME_READY_TIMEOUT_MS,
    LauncherConfig,
    BrowserLauncher,
    LaunchedBrowser,
    _launcher_config,
)


class LocalBrowserLauncher(BrowserLauncher):
    def __init__(self, config: LauncherConfig | dict | None = None) -> None:
        raw_config = config.model_dump() if isinstance(config, LauncherConfig) else dict(config or {})
        super().__init__({**raw_config, "launcher_mode": "local"})

    @staticmethod
    def findChromeBinary(explicit: str | None = None) -> str:
        candidates = [explicit, os.environ.get("CHROME_PATH"), *_candidate_paths()]
        for candidate in candidates:
            if candidate and Path(candidate).exists():
                return str(candidate)
        tried = ", ".join(str(candidate) for candidate in candidates if candidate)
        raise RuntimeError(f"No Chrome/Chromium binary found. Tried: {tried}. Set CHROME_PATH or pass launcher_local_executable_path.")

    @staticmethod
    def freePort() -> int:
        return _free_port()

    def launch(self, config: LauncherConfig | dict | None = None) -> LaunchedBrowser:
        merged = self.config if config is None else _launcher_config({**self.config.model_dump(), **_launcher_config(config).model_dump(exclude_unset=True)})
        executable_path = self.findChromeBinary(merged.launcher_local_executable_path)
        requested_port = merged.launcher_local_cdp_listen_port
        port = int(requested_port) if requested_port is not None else 0
        temp_profile_dir: tempfile.TemporaryDirectory[str] | None = None
        profile_dir = merged.launcher_local_user_data_dir
        if not profile_dir:
            temp_profile_dir = tempfile.TemporaryDirectory(prefix="modcdp.")
            profile_dir = temp_profile_dir.name
        cleanup_profile_dir = str(profile_dir) if merged.launcher_local_user_data_dir and merged.launcher_local_cleanup_user_data_dir else None
        args = [
            "--enable-unsafe-extension-debugging",
            "--remote-allow-origins=*",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-default-apps",
            "--disable-dev-shm-usage",
            "--disable-background-networking",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-background-timer-throttling",
            "--disable-sync",
            "--disable-features=DisableLoadExtensionCommandLineSwitch",
            "--password-store=basic",
            "--use-mock-keychain",
            "--disable-gpu",
            f"--user-data-dir={profile_dir}",
            "--remote-debugging-address=127.0.0.1",
            f"--remote-debugging-port={port}",
        ]
        args = [arg for arg in args if arg is not None]
        default_headless = sys.platform.startswith("linux") and not os.environ.get("DISPLAY")
        headless = merged.launcher_local_headless if merged.launcher_local_headless is not None else default_headless
        if headless:
            args.append("--headless=new")
        default_sandbox = not default_headless
        if (merged.launcher_local_sandbox if merged.launcher_local_sandbox is not None else default_sandbox) is False:
            args.append("--no-sandbox")
        args.extend(list(merged.launcher_local_args))
        args.extend(list(merged.launcher_local_extra_args))
        args.append("about:blank")
        process = subprocess.Popen(
            [executable_path, *args],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=not sys.platform.startswith("win"),
        )
        timeout_s = merged.launcher_local_chrome_ready_timeout_ms / 1000
        poll_s = merged.launcher_local_chrome_ready_poll_interval_ms / 1000
        deadline = time.time() + timeout_s
        active_port: int | None = None
        while time.time() < deadline:
            exit_code = process.poll()
            if exit_code is not None:
                _close(process, temp_profile_dir, cleanup_profile_dir=cleanup_profile_dir)
                raise RuntimeError(f"Chrome exited before CDP became ready (exit={exit_code}).")
            if port == 0:
                active_port = _read_devtools_active_port(str(profile_dir))
                if active_port is None:
                    time.sleep(poll_s)
                    continue
                cdp_url = f"http://127.0.0.1:{active_port}"
            else:
                cdp_url = f"http://127.0.0.1:{port}"
            try:
                with urllib.request.urlopen(f"{cdp_url}/json/version", timeout=0.5) as response:
                    version = json.loads(response.read())
                    self.launched = LaunchedBrowser(
                        # cdp_url is resolved from the HTTP discovery endpoint before returning.
                        cdp_url=version.get("webSocketDebuggerUrl") or cdp_url,
                        cdp_listen_port=active_port if port == 0 else port,
                        loopback_cdp_url=version.get("webSocketDebuggerUrl") or cdp_url,
                        profile_dir=profile_dir,
                        close=lambda: _close(process, temp_profile_dir, cleanup_profile_dir=cleanup_profile_dir),
                    )
                    return self.launched
            except Exception:
                time.sleep(poll_s)
        _close(process, temp_profile_dir, cleanup_profile_dir=cleanup_profile_dir)
        raise RuntimeError(f"Chrome did not become ready within {timeout_s}s")


def _newest_first(candidates: list[str]) -> list[str]:
    def score(candidate: str) -> tuple[int, float, str]:
        numbers = [int(part) for part in re.findall(r"\d+", candidate)]
        version = max(numbers) if numbers else 0
        try:
            mtime = Path(candidate).stat().st_mtime
        except OSError:
            mtime = 0.0
        return (-version, -mtime, candidate)

    return sorted(dict.fromkeys(candidates), key=score)


def _chrome_for_testing_candidates() -> list[str]:
    home = Path.home()
    if sys.platform == "darwin":
        patterns = [
            str(home / "Library/Caches/ms-playwright/chromium-*/chrome-mac*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
            str(home / "Library/Caches/ms-playwright/chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium"),
            str(home / "Library/Caches/puppeteer/chrome/mac*-*/chrome-mac*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
        ]
    elif sys.platform.startswith("win"):
        local_app_data = Path(os.environ.get("LOCALAPPDATA") or home / "AppData/Local")
        patterns = [
            str(local_app_data / "ms-playwright/chromium-*/chrome-win*/chrome.exe"),
            str(home / ".cache/puppeteer/chrome/win*-*/chrome-win*/chrome.exe"),
        ]
    else:
        patterns = [
            str(home / ".cache/ms-playwright/chromium-*/chrome-linux*/chrome"),
            "/opt/pw-browsers/chromium-*/chrome-linux*/chrome",
            str(home / ".cache/puppeteer/chrome/linux-*/chrome-linux*/chrome"),
        ]
    return _newest_first([match for pattern in patterns for match in glob.glob(pattern)])


def _candidate_paths() -> list[str]:
    home = Path.home()
    program_files = [value for value in [os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)")] if value]
    if sys.platform == "darwin":
        canary = ["/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"]
        stock = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    elif sys.platform.startswith("win"):
        local_app_data = Path(os.environ.get("LOCALAPPDATA") or home / "AppData/Local")
        canary = [
            str(local_app_data / "Google/Chrome SxS/Application/chrome.exe"),
            *[str(Path(base) / "Google/Chrome SxS/Application/chrome.exe") for base in program_files],
        ]
        stock = [
            *[str(Path(base) / "Google/Chrome/Application/chrome.exe") for base in program_files],
            str(local_app_data / "Google/Chrome/Application/chrome.exe"),
        ]
    else:
        chromium = ["/usr/bin/chromium", "/usr/bin/chromium-browser"]
        canary = ["/usr/bin/google-chrome-canary", "/usr/bin/google-chrome-unstable", "/opt/google/chrome-unstable/chrome"]
        stock = ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/opt/google/chrome/chrome"]
        return [*chromium, *canary, *_chrome_for_testing_candidates(), *stock]
    return [*canary, *_chrome_for_testing_candidates(), *stock]


class _ChromeProcess(Protocol):
    pid: int

    def terminate(self) -> None: ...

    def kill(self) -> None: ...

    def wait(self, timeout: float | None = None) -> int | None: ...

    def poll(self) -> int | None: ...


def _wait_for_cdp_websocket_url(cdp_url: str, timeout_ms: int, poll_interval_ms: int) -> str:
    deadline = time.time() + timeout_ms / 1000
    poll_s = poll_interval_ms / 1000
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{cdp_url}/json/version", timeout=0.5) as response:
                version = json.loads(response.read())
                websocket_url = version.get("webSocketDebuggerUrl")
                if websocket_url:
                    return str(websocket_url)
        except Exception as err:
            last_error = err
        time.sleep(poll_s)
    if last_error is not None:
        raise RuntimeError(f"Chrome at {cdp_url} did not expose a WebSocket CDP URL within {timeout_ms}ms: {last_error}")
    raise RuntimeError(f"Chrome at {cdp_url} did not expose a WebSocket CDP URL within {timeout_ms}ms")


def _read_devtools_active_port(profile_dir: str) -> int | None:
    active_port_path = Path(profile_dir) / "DevToolsActivePort"
    try:
        raw_port, websocket_path, *_ = active_port_path.read_text().strip().splitlines()
    except FileNotFoundError:
        return None
    except ValueError:
        return None
    if not websocket_path:
        return None
    port = int(raw_port)
    if port <= 0:
        raise RuntimeError(f"Invalid DevToolsActivePort port: {raw_port}")
    return port


def _wait_for_browser_selected_cdp_websocket_url(
    profile_dir: str,
    timeout_ms: int,
    poll_interval_ms: int,
    process: _ChromeProcess,
) -> tuple[str, int]:
    deadline = time.time() + timeout_ms / 1000
    poll_s = poll_interval_ms / 1000
    last_error: Exception | None = None
    while time.time() < deadline:
        exit_code = process.poll()
        if exit_code is not None:
            raise RuntimeError(f"Chrome exited before CDP became ready (exit={exit_code}).")
        active_port = _read_devtools_active_port(profile_dir)
        if active_port is not None:
            try:
                return _wait_for_cdp_websocket_url(f"http://127.0.0.1:{active_port}", poll_interval_ms, poll_interval_ms), active_port
            except Exception as err:
                last_error = err
        time.sleep(poll_s)
    if last_error is not None:
        raise RuntimeError(f"Chrome did not expose DevToolsActivePort from {profile_dir} within {timeout_ms}ms: {last_error}")
    raise RuntimeError(f"Chrome did not expose DevToolsActivePort from {profile_dir} within {timeout_ms}ms")


def _close(
    process: _ChromeProcess,
    temp_profile_dir: tempfile.TemporaryDirectory[str] | None,
    cleanup_profile_dir: str | None = None,
) -> None:
    _signal_process(process, signal.SIGTERM)
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        _signal_process(process, signal.SIGKILL)
        process.wait(timeout=2)
    if temp_profile_dir:
        temp_profile_dir.cleanup()
    if cleanup_profile_dir:
        _remove_profile_dir(cleanup_profile_dir)


def _signal_process(process: _ChromeProcess, sig: signal.Signals) -> None:
    if not sys.platform.startswith("win"):
        try:
            os.killpg(process.pid, sig)
            return
        except ProcessLookupError:
            return
        except Exception:
            pass
    if sig == signal.SIGKILL:
        process.kill()
    else:
        process.terminate()


def _remove_profile_dir(profile_dir: str) -> None:
    for attempt in range(5):
        shutil.rmtree(profile_dir, ignore_errors=True)
        if not Path(profile_dir).exists():
            return
        time.sleep(0.1 * (attempt + 1))
    shutil.rmtree(profile_dir, ignore_errors=True)


def _free_port() -> int:
    import socket

    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    try:
        return int(sock.getsockname()[1])
    finally:
        sock.close()
