from __future__ import annotations

import unittest

from modcdp.launcher.NoneBrowserLauncher import NoneBrowserLauncher


class NoneBrowserLauncherTests(unittest.TestCase):
    def test_constructor_launch_and_config_match_ts_shape(self) -> None:
        launcher = NoneBrowserLauncher({"launcher_remote_cdp_url": "ws://127.0.0.1:9222/devtools/browser/initial"})
        self.assertEqual(launcher.options.get("launcher_remote_cdp_url"), "ws://127.0.0.1:9222/devtools/browser/initial")
        self.assertEqual(
            launcher.getTransportConfig().get("upstream_ws_cdp_url"),
            "ws://127.0.0.1:9222/devtools/browser/initial",
        )

        launched = launcher.launch({"launcher_remote_cdp_url": "ws://127.0.0.1:9222/devtools/browser/call"})
        self.assertIs(launcher.launched, launched)
        self.assertIsNone(launched["cdp_url"])
        self.assertEqual(launcher.getServerConfig(), {})
        launched["close"]()


if __name__ == "__main__":
    unittest.main()
