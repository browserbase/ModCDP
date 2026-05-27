# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.AutoSessionRouter.ts
# - ./go/modcdp/router/AutoSessionRouter_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import glob
import os
import re
import sys
import threading
import time
import unittest
from pathlib import Path
from queue import Queue

from modcdp import ModCDPClient


# MODCDP_TEST_SUPPORT: LANGUAGE-SPECIFIC TEST SUPPORT ONLY.
# Keep setup semantics 1:1 with TS; this only selects a real browser for real --load-extension runs.
def load_extension_test_browser_path() -> str:
    for candidate in (os.environ.get("CHROME_PATH"), "/usr/bin/chromium" if sys.platform.startswith("linux") else None):
        if candidate and Path(candidate).exists():
            return candidate
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
            str(home / ".cache/puppeteer/chrome/win*-*/chrome.exe"),
        ]
    else:
        patterns = [
            str(home / ".cache/ms-playwright/chromium-*/chrome-linux*/chrome"),
            "/opt/pw-browsers/chromium-*/chrome-linux*/chrome",
            str(home / ".cache/puppeteer/chrome/linux-*/chrome-linux*/chrome"),
        ]
    candidates = sorted(
        dict.fromkeys(match for pattern in patterns for match in glob.glob(pattern)),
        key=lambda path: (-max([int(part) for part in re.findall(r"\d+", path)] or [0]), -Path(path).stat().st_mtime, path),
    )
    if candidates:
        return candidates[0]
    raise RuntimeError("No browser found for --load-extension tests. Install Chrome for Testing or set CHROME_PATH.")


ROOT = Path(__file__).resolve().parents[2]
EXTENSION_PATH = ROOT / "dist" / "extension"
LOAD_EXTENSION_TEST_BROWSER_PATH = load_extension_test_browser_path()


class AutoSessionRouterTests(unittest.TestCase):
    def test_autosessionrouter_tracks_real_target_sessions_and_execution_contexts_from_live_cdp_events(self) -> None:
        cdp = ModCDPClient(
            launcher={
                "launcher_mode": "local",
                "launcher_local_headless": True,
                "launcher_local_executable_path": LOAD_EXTENSION_TEST_BROWSER_PATH,
            },
            upstream={"upstream_mode": "ws"},
            injector={
                "injector_mode": "cli",
                "injector_cli_extension_path": str(EXTENSION_PATH),
                "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                "injector_trust_service_worker_target": True,
            },
            router={"router_routes": {"Mod.*": "service_worker", "Custom.*": "service_worker", "*.*": "direct_cdp"}},
        )
        target_id: str | None = None
        pending_target_id: str | None = None
        try:
            cdp.connect()
            created = cdp.Target.createTarget(url="about:blank#modcdp-auto-session-router")
            target_id = str(created.targetId)
            session_id = _wait_for(lambda: cdp.router.sessionId_from_targetId.get(str(target_id)))

            context_result: Queue[int | BaseException] = Queue()
            threading.Thread(
                target=lambda: _put_result(context_result, lambda: cdp.router.waitForExecutionContext(session_id, 30_000)),
                daemon=True,
            ).start()
            cdp.send("Runtime.enable", {}, session_id)
            context_id = context_result.get(timeout=35)
            if isinstance(context_id, BaseException):
                raise context_id
            self.assertIsInstance(context_id, int)
            self.assertTrue(
                any(
                    context.get("sessionId") == session_id and context.get("id") == context_id
                    for context in cdp.router.contexts.values()
                )
            )

            cdp.Target.detachFromTarget(sessionId=session_id)
            _expect_eventually(lambda: self.assertIsNone(cdp.router.sessionId_from_targetId.get(str(target_id))))
            self.assertFalse(any(context.get("sessionId") == session_id for context in cdp.router.contexts.values()))
            try:
                cdp.Target.closeTarget(targetId=target_id)
            except Exception:
                pass
            target_id = None

            pending_created = cdp.Target.createTarget(url="about:blank#modcdp-auto-session-router-pending-context")
            pending_target_id = str(pending_created.targetId)
            pending_session_id = _wait_for(lambda: cdp.router.sessionId_from_targetId.get(str(pending_target_id)))
            pending_result: Queue[int | BaseException] = Queue()
            threading.Thread(
                target=lambda: _put_result(
                    pending_result,
                    lambda: cdp.router.waitForExecutionContext(pending_session_id, 30_000),
                ),
                daemon=True,
            ).start()
            cdp.Target.detachFromTarget(sessionId=pending_session_id)
            pending_error = pending_result.get(timeout=35)
            self.assertIsInstance(pending_error, RuntimeError)
            self.assertIn(
                f"Runtime execution context wait cancelled because session {pending_session_id} detached.",
                str(pending_error),
            )
            _expect_eventually(lambda: self.assertIsNone(cdp.router.sessionId_from_targetId.get(str(pending_target_id))))
            try:
                cdp.Target.closeTarget(targetId=pending_target_id)
            except Exception:
                pass
            pending_target_id = None
        finally:
            if target_id:
                try:
                    cdp.Target.closeTarget(targetId=target_id)
                except Exception:
                    pass
            if pending_target_id:
                try:
                    cdp.Target.closeTarget(targetId=pending_target_id)
                except Exception:
                    pass
            cdp.close()


def _put_result(queue: Queue[int | BaseException], fn) -> None:
    try:
        queue.put(fn())
    except BaseException as error:
        queue.put(error)


def _wait_for(fn, timeout_s: float = 10) -> str:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        value = fn()
        if value:
            return value
        time.sleep(0.1)
    raise TimeoutError("timed out waiting for condition")


def _expect_eventually(assertion, timeout_s: float = 10) -> None:
    deadline = time.time() + timeout_s
    last_error: BaseException | None = None
    while time.time() < deadline:
        try:
            assertion()
            return
        except BaseException as error:
            last_error = error
            time.sleep(0.1)
    if last_error is not None:
        raise last_error
    raise TimeoutError("timed out waiting for assertion")


if __name__ == "__main__":
    unittest.main()
