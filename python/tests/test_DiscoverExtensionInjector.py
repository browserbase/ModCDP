# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.DiscoverExtensionInjector.ts
# - ./go/modcdp/injector/DiscoverExtensionInjector_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest
from pathlib import Path

from modcdp import ModCDPClient


ROOT = Path(__file__).resolve().parents[2]
EXTENSION_PATH = ROOT / "dist" / "extension"


class DiscoverExtensionInjectorTests(unittest.TestCase):
    def test_attaches_to_already_loaded_real_modcdp_extension(self) -> None:
        owner = ModCDPClient(
            launcher={"launcher_mode": "local", "launcher_local_headless": True},
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
