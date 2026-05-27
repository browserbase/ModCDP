# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.CLIExtensionInjector.ts
# - ./go/modcdp/injector/CLIExtensionInjector_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import glob
import os
import re
import sys
import tempfile
import unittest
import zipfile
from collections.abc import Mapping
from pathlib import Path

from modcdp.injector.ExtensionInjector import DEFAULT_MODCDP_EXTENSION_ID
from modcdp.injector.CLIExtensionInjector import CLIExtensionInjector
from modcdp.launcher.LocalBrowserLauncher import LocalBrowserLauncher
from modcdp.transport.WSUpstreamTransport import WSUpstreamTransport


ROOT = Path(__file__).resolve().parents[2]
EXTENSION_PATH = ROOT / "dist" / "extension"
DOES_NOT_EXIST_EXTENSION_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"


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


LOAD_EXTENSION_TEST_BROWSER_PATH = load_extension_test_browser_path()


class CLIExtensionInjectorTests(unittest.TestCase):
    def test_cliextensioninjector_rejects_zip_entries_outside_extraction_directory(self) -> None:
        with tempfile.TemporaryDirectory(prefix="modcdp-bad-zip-") as temp_dir:
            zip_path = Path(temp_dir) / "extension.zip"
            with zipfile.ZipFile(zip_path, "w") as archive:
                archive.writestr("../evil.txt", "evil")

            injector = CLIExtensionInjector({"injector_cli_extension_path": str(zip_path)})
            try:
                with self.assertRaisesRegex(RuntimeError, "escapes extension extraction directory"):
                    injector.prepare()
                self.assertFalse((Path(temp_dir) / "evil.txt").exists())
            finally:
                injector.close()

    def test_cliextensioninjector_prepares_an_unpacked_extension_directory_for_load_extension(self) -> None:
        injector = CLIExtensionInjector({"injector_cli_extension_path": str(EXTENSION_PATH)})
        try:
            injector.prepare()
            unpacked_extension_path = injector.unpacked_extension_path
            if not isinstance(unpacked_extension_path, str):
                self.fail(f"unpacked_extension_path = {unpacked_extension_path!r}")
            self.assertNotEqual(unpacked_extension_path, str(EXTENSION_PATH))
            self.assertTrue((Path(unpacked_extension_path) / "manifest.json").exists())
            self.assertEqual(injector.extra_args, [f"--load-extension={unpacked_extension_path}"])
            self.assertEqual(injector.config.injector_service_worker_extension_id, DEFAULT_MODCDP_EXTENSION_ID)
        finally:
            injector.close()

    def test_cliextensioninjector_prepares_the_default_extension_zip_for_load_extension(self) -> None:
        injector = CLIExtensionInjector()
        try:
            injector.prepare()
            unpacked_extension_path = injector.unpacked_extension_path
            if not isinstance(unpacked_extension_path, str):
                self.fail(f"unpacked_extension_path = {unpacked_extension_path!r}")
            self.assertTrue((Path(unpacked_extension_path) / "manifest.json").exists())
            self.assertIn("modcdp-extension-", unpacked_extension_path)
            self.assertEqual(injector.extra_args, [f"--load-extension={unpacked_extension_path}"])
            self.assertEqual(injector.config.injector_service_worker_extension_id, DEFAULT_MODCDP_EXTENSION_ID)
        finally:
            injector.close()

    def test_cliextensioninjector_returns_null_when_a_trusted_does_not_exist_extension_id_is_absent_in_a_real_browser(self) -> None:
        injector = CLIExtensionInjector(
            {
                "injector_cli_extension_path": str(EXTENSION_PATH),
                "injector_cli_extension_id": DOES_NOT_EXIST_EXTENSION_ID,
                "injector_trust_service_worker_target": True,
                "injector_service_worker_ready_timeout_ms": 250,
                "injector_service_worker_poll_interval_ms": 25,
            }
        )
        launcher = LocalBrowserLauncher(
            {
                "launcher_local_headless": True,
                "launcher_local_executable_path": LOAD_EXTENSION_TEST_BROWSER_PATH,
            }
        )
        upstream = WSUpstreamTransport()
        try:
            injector.prepare()
            launcher.update(injector.configForLauncher())
            launcher.launch()
            upstream.update(launcher.configForUpstream())
            upstream.connect()
            injector.update({"send": upstream.send})

            targets = upstream.send("Target.getTargets", {})
            target_infos = targets.get("targetInfos") if isinstance(targets, Mapping) else None
            if not isinstance(target_infos, list):
                raise AssertionError(f"Target.getTargets returned no targetInfos: {targets!r}")
            found_does_not_exist_target = False
            for target in target_infos:
                match target:
                    case {"url": str(target_url)}:
                        if target_url.startswith(f"chrome-extension://{DOES_NOT_EXIST_EXTENSION_ID}/"):
                            found_does_not_exist_target = True
            self.assertFalse(found_does_not_exist_target)

            result = injector.inject()
            self.assertIsNone(result)
        finally:
            upstream.close()
            launcher.close()
            injector.close()


if __name__ == "__main__":
    unittest.main()
