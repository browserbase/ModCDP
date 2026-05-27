# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.DiscoverExtensionInjector.ts
# - ./go/modcdp/injector/DiscoverExtensionInjector_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import glob
import unittest
from pathlib import Path
import os
import re
import sys

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


class DiscoverExtensionInjectorTests(unittest.TestCase):
    def test_discoverextensioninjector_attaches_to_an_already_loaded_real_modcdp_extension(self) -> None:
        owner = ModCDPClient(
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
        )
        try:
            owner.connect()
            cdp = ModCDPClient(
                launcher={"launcher_mode": "remote", "launcher_remote_cdp_url": owner.cdp_url},
                upstream={"upstream_mode": "ws", "upstream_ws_cdp_url": owner.cdp_url},
                injector={
                    "injector_mode": "discover",
                    "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                    "injector_trust_service_worker_target": True,
                },
            )
            try:
                cdp.connect()
                self.assertEqual(cdp.connect_timing.get("injector_source") if cdp.connect_timing else None, "discover")
                assert cdp.injector is not None
                self.assertEqual(cdp.injector.extension_id, "mdedooklbnfejodmnhmkdpkaedafkehf")
                self.assertEqual(
                    cdp.Mod.evaluate(expression="chrome.runtime.getURL('modcdp/service_worker.js')"),
                    "chrome-extension://mdedooklbnfejodmnhmkdpkaedafkehf/modcdp/service_worker.js",
                )
            finally:
                cdp.close()
        finally:
            owner.close()


if __name__ == "__main__":
    unittest.main()
