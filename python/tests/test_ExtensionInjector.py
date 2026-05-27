# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.ExtensionInjector.ts
# - ./go/modcdp/injector/ExtensionInjector_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest

from modcdp.injector.ExtensionInjector import ExtensionInjector


class ExtensionInjectorTests(unittest.TestCase):
    def test_extensioninjector_owns_shared_injector_config(self) -> None:
        injector = ExtensionInjector(
            {
                "injector_service_worker_extension_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
            }
        )

        self.assertEqual(injector.config.injector_service_worker_extension_id, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        self.assertEqual(injector.configForUpstream(), {})
        self.assertEqual(injector.extra_args, [])
        self.assertTrue(
            injector._serviceWorkerTargetMatches(
                {
                    "targetId": "target-1",
                    "type": "service_worker",
                    "url": "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/modcdp/service_worker.js",
                }
            )
        )
        self.assertFalse(
            injector._serviceWorkerTargetMatches(
                {
                    "targetId": "target-1",
                    "type": "service_worker",
                    "url": "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/background.js",
                }
            )
        )

    def test_extensioninjector_base_inject_reports_the_subclass_name(self) -> None:
        with self.assertRaisesRegex(NotImplementedError, "ExtensionInjector.inject is not implemented"):
            ExtensionInjector().inject()


if __name__ == "__main__":
    unittest.main()
