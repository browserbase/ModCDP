# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.NoneBrowserLauncher.ts
# - ./go/modcdp/launcher/NoneBrowserLauncher_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest

from modcdp.launcher.NoneBrowserLauncher import NoneBrowserLauncher


class NoneBrowserLauncherTests(unittest.TestCase):
    def test_nonebrowserlauncher_records_an_empty_launched_browser(self) -> None:
        launcher = NoneBrowserLauncher()

        launched = launcher.launch()

        self.assertIsNone(launched.cdp_url)
        self.assertIs(launcher.launched, launched)
        launched.close()


if __name__ == "__main__":
    unittest.main()
