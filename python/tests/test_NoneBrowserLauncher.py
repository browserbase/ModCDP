# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.NoneBrowserLauncher.ts
# - ./go/modcdp/launcher/NoneBrowserLauncher_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest

from modcdp.launcher.NoneBrowserLauncher import NoneBrowserLauncher
from modcdp.transport.UpstreamTransport import UpstreamTransport


class NoneBrowserLauncherTests(unittest.TestCase):
    def test_constructor_launch_and_config_match_ts_shape(self) -> None:
        launcher = NoneBrowserLauncher({"launcher_remote_cdp_url": "ws://127.0.0.1:9222/devtools/browser/initial"})
        self.assertEqual(launcher.config.launcher_remote_cdp_url, "ws://127.0.0.1:9222/devtools/browser/initial")
        self.assertEqual(
            launcher.configForUpstream().get("upstream_ws_cdp_url"),
            "ws://127.0.0.1:9222/devtools/browser/initial",
        )

        launched = launcher.launch({"launcher_remote_cdp_url": "ws://127.0.0.1:9222/devtools/browser/call"})
        self.assertIs(launcher.launched, launched)
        self.assertIsNone(launched["cdp_url"])
        self.assertEqual(launcher.configForServer(UpstreamTransport()), {})
        launched["close"]()


if __name__ == "__main__":
    unittest.main()
