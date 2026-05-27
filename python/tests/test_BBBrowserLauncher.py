# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.BBBrowserLauncher.ts
# - ./go/modcdp/launcher/BBBrowserLauncher_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import json
import os
import time
import unittest
import urllib.request
from typing import Any, cast

from websocket import create_connection

from modcdp.launcher.BBBrowserLauncher import BBBrowserLauncher


LIVE_BROWSERBASE_TIMEOUT_S = 120


class BBBrowserLauncherTests(unittest.TestCase):
    def test_creates_verifies_resumes_and_releases_real_browserbase_session(self) -> None:
        if not os.environ.get("BROWSERBASE_API_KEY", "").strip():
            self.fail("BROWSERBASE_API_KEY is required for live Browserbase tests")
        launcher = BBBrowserLauncher(
            cast(Any, {
                "launcher_bb_timeout": 120,
                **({"launcher_bb_region": os.environ["BROWSERBASE_REGION"]} if os.environ.get("BROWSERBASE_REGION") else {}),
                "launcher_bb_browser_settings": {
                    "viewport": {"width": 900, "height": 700},
                    "recordSession": False,
                },
                "launcher_bb_user_metadata": {
                    "modcdp_launcher_test": "BBBrowserLauncher",
                },
            })
        )
        browser = launcher.launch()
        resumed = None
        ws = None
        session_id = browser.get("browserbase_session_id")
        try:
            if not isinstance(session_id, str):
                self.fail(f"browserbase_session_id = {session_id!r}")
            self.assertIn(session_id, browser.get("browserbase_session_url") or "")
            cdp_url = browser.get("cdp_url")
            if not isinstance(cdp_url, str):
                self.fail(f"cdp_url = {cdp_url!r}")
            self.assertRegex(cdp_url, r"^wss://")
            ws = create_connection(cdp_url, timeout=LIVE_BROWSERBASE_TIMEOUT_S)
            expect_cdp_browser_surface(ws)

            retrieved = retrieve_browserbase_session(session_id)
            self.assertEqual(retrieved.get("id"), session_id)
            self.assertEqual(retrieved.get("status"), "RUNNING")

            resumed = BBBrowserLauncher(
                {
                    "launcher_bb_session_id": session_id,
                    "launcher_bb_close_session_on_close": False,
                }
            ).launch()
            self.assertEqual(resumed.get("browserbase_session_id"), session_id)
            self.assertRegex(resumed.get("cdp_url") or "", r"^wss://")
            expect_cdp_browser_surface(ws)
        finally:
            if ws is not None:
                ws.close()
            if resumed is not None:
                resumed["close"]()
            browser["close"]()
            browser["close"]()

        deadline = time.time() + 30
        while time.time() < deadline:
            if retrieve_browserbase_session(session_id).get("status") != "RUNNING":
                return
            time.sleep(1)
        self.fail("Browserbase session did not leave RUNNING status after release")


# MODCDP_TEST_SUPPORT: LANGUAGE-SPECIFIC TEST SUPPORT ONLY.
# Keep the setup semantics above 1:1 with translated tests; helpers here only call real Browserbase APIs and real CDP endpoints.
def retrieve_browserbase_session(session_id: str) -> dict:
    request = urllib.request.Request(
        browserbase_api_url(f"/v1/sessions/{session_id}"),
        headers={"x-bb-api-key": os.environ["BROWSERBASE_API_KEY"]},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status < 200 or response.status >= 300:
            raise AssertionError(f"Browserbase session fetch returned {response.status}")
        return json.loads(response.read())


def browserbase_api_url(pathname: str) -> str:
    base_url = os.environ.get("BROWSERBASE_BASE_URL", "https://api.browserbase.com").rstrip("/")
    return f"{base_url}/{pathname.lstrip('/')}"


def expect_cdp_browser_surface(ws) -> None:
    ws.send(json.dumps({"id": 1, "method": "Browser.getVersion", "params": {}}))
    message = json.loads(ws.recv())
    result = message.get("result", {}) if isinstance(message, dict) else {}
    product = result.get("product") if isinstance(result, dict) else None
    if not isinstance(product, str) or ("Chrome" not in product and "Chromium" not in product):
        raise AssertionError(f"Browser.getVersion result = {message!r}")


if __name__ == "__main__":
    unittest.main()
