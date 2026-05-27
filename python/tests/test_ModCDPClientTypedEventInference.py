# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.ModCDPClientTypedEventInference.ts
# - ./go/modcdp/client/ModCDPClientTypedEventInference_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest
from collections.abc import Mapping
from typing import Any

from modcdp import ModCDPClient


class ModCDPClientTypedEventInferenceTests(unittest.TestCase):
    def test_typed_cdp_event_tokens_infer_callback_payloads_without_local_type_aliases(self) -> None:
        client = ModCDPClient(
            launcher={"launcher_mode": "none"},
            upstream={"upstream_mode": "ws"},
            injector={"injector_mode": "none"},
            server_config=None,
        )
        seen: list[str] = []

        def on_target_created(event: Any) -> None:
            target_info = event.targetInfo
            if not isinstance(target_info, Mapping):
                raise AssertionError(f"targetInfo = {target_info!r}")
            seen.append(str(target_info["targetId"]))

        client.on(client.Target.targetCreated, on_target_created)
        client._on_recv(
            {
                "method": "Target.targetCreated",
                "params": {
                    "targetInfo": {
                        "targetId": "target-1",
                        "type": "page",
                        "title": "Example",
                        "url": "https://example.com",
                        "attached": True,
                        "canAccessOpener": False,
                    }
                },
            }
        )

        self.assertEqual(seen, ["target-1"])


if __name__ == "__main__":
    unittest.main()
