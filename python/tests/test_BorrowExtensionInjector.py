# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.BorrowExtensionInjector.ts
# - ./go/modcdp/injector/BorrowExtensionInjector_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest
from pathlib import Path
import os

from modcdp import ModCDPClient


ROOT = Path(__file__).resolve().parents[2]
EXTENSION_PATH = ROOT / "dist" / "extension"


class BorrowExtensionInjectorTests(unittest.TestCase):
    def test_bootstraps_modcdp_inside_live_extension_service_worker(self) -> None:
        owner = ModCDPClient(
            launcher={
                "launcher_mode": "local",
                "launcher_local_headless": True,
                **({"launcher_local_executable_path": os.environ["CHROME_PATH"]} if os.environ.get("CHROME_PATH") else {}),
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
                    "injector_mode": "borrow",
                    "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                    "injector_trust_service_worker_target": True,
                },
            )
            try:
                cdp.connect()
                self.assertEqual(cdp.connect_timing.get("injector_source") if cdp.connect_timing else None, "borrow")
                self.assertEqual(cdp.extension_id, "mdedooklbnfejodmnhmkdpkaedafkehf")
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
