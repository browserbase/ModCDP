# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.CDPExtensionInjector.ts
# - ./go/modcdp/injector/CDPExtensionInjector_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest
from pathlib import Path

from modcdp.injector.CDPExtensionInjector import CDPExtensionInjector


class CDPExtensionInjectorTests(unittest.TestCase):
    def test_cdpextensioninjector_prepares_the_default_packaged_extension_zip(self) -> None:
        injector = CDPExtensionInjector()
        try:
            injector.prepare()
            unpacked_extension_path = injector.unpacked_extension_path
            if not isinstance(unpacked_extension_path, str):
                self.fail(f"unpacked_extension_path = {unpacked_extension_path!r}")
            self.assertIn("modcdp-extension-", unpacked_extension_path)
            self.assertTrue((Path(unpacked_extension_path) / "manifest.json").exists())
        finally:
            injector.close()


if __name__ == "__main__":
    unittest.main()
