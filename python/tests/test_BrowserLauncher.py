# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.BrowserLauncher.ts
# - ./go/modcdp/launcher/BrowserLauncher_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest

from modcdp.launcher.BrowserLauncher import BrowserLauncher


class BrowserLauncherTests(unittest.TestCase):
    def test_merges_config_and_exposes_upstream_config(self) -> None:
        launcher = BrowserLauncher(
            {
                "launcher_remote_cdp_url": "ws://127.0.0.1:9222/devtools/browser/initial",
                "launcher_local_user_data_dir": "/tmp/modcdp-browser-launcher",
            }
        )
        launcher.update(
            {
                "launcher_remote_cdp_url": "ws://127.0.0.1:9222/devtools/browser/updated",
            }
        )

        self.assertEqual(
            {
                "upstream_ws_cdp_url": launcher.configForUpstream()["upstream_ws_cdp_url"],
            },
            {
                "upstream_ws_cdp_url": "ws://127.0.0.1:9222/devtools/browser/updated",
            },
        )
        self.assertEqual(launcher.config.launcher_local_user_data_dir, "/tmp/modcdp-browser-launcher")
        with self.assertRaisesRegex(NotImplementedError, "BrowserLauncher.launch is not implemented"):
            launcher.launch()

    def test_carries_remote_cdp_config_separately_from_launch_args(self) -> None:
        launcher = BrowserLauncher(
            {
                "launcher_remote_cdp_url": "ws://127.0.0.1:9222/devtools/browser/initial",
            }
        )
        launcher.update(
            {
                "launcher_remote_cdp_url": "ws://127.0.0.1:9222/devtools/browser/updated",
            }
        )

        self.assertEqual(launcher.config.launcher_remote_cdp_url, "ws://127.0.0.1:9222/devtools/browser/updated")


if __name__ == "__main__":
    unittest.main()
