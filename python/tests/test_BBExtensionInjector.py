# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.BBExtensionInjector.ts
# - ./go/modcdp/injector/BBExtensionInjector_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import os
from pathlib import Path
import unittest

from modcdp import ModCDPClient

HERE = Path(__file__).resolve().parent
EXTENSION_PATH = HERE.parents[1] / "dist" / "extension"


class BBExtensionInjectorTests(unittest.TestCase):
    def test_uploads_the_real_extension_and_launches_a_browserbase_browser_with_it_installed(self) -> None:
        if not os.environ.get("BROWSERBASE_API_KEY", "").strip():
            self.fail("BROWSERBASE_API_KEY is required for live Browserbase tests")
        cdp = ModCDPClient(
            launcher={
                "launcher_mode": "bb",
                "launcher_bb_timeout": 120,
                **({"launcher_bb_region": os.environ["BROWSERBASE_REGION"]} if os.environ.get("BROWSERBASE_REGION") else {}),
            },
            upstream={"upstream_mode": "ws"},
            injector={
                "injector_mode": "bb",
                "injector_bb_extension_path": str(EXTENSION_PATH),
                "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                "injector_trust_service_worker_target": True,
            },
        )

        try:
            cdp.connect()
            self.assertEqual(cdp.connect_timing.get("injector_source") if cdp.connect_timing else None, "bb")
            assert cdp.injector is not None
            self.assertIsInstance(cdp.injector.extension_id, str)
            service_worker_url = cdp.Mod.evaluate(expression="chrome.runtime.getURL('modcdp/service_worker.js')")
            self.assertRegex(str(service_worker_url), r"^chrome-extension://[a-z]{32}/modcdp/service_worker\.js$")
        finally:
            cdp.close()


if __name__ == "__main__":
    unittest.main()
