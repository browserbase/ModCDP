# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.ModCDPClientTypedEventInference.ts
# - ./go/modcdp/client/ModCDPClientTypedEventInference_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest
from typing import Any, cast

from modcdp import ModCDPClient
from modcdp.types import JsonValue


class ModCDPClientTypedEventInferenceTests(unittest.TestCase):
    def test_typed_cdp_event_tokens_infer_callback_payloads_without_local_type_aliases(self) -> None:
        client = ModCDPClient()
        typed_events: list[Any] = []
        raw_events: list[dict[str, JsonValue]] = []

        client.on(client.Target.targetCreated, typed_events.append)
        client.on("Target.targetCreated", raw_events.append)

        payload = {"targetInfo": {"targetId": "target-1", "type": "page", "url": "https://example.com"}}
        for handler in client._handlers["Target.targetCreated"]:
            handler(payload)

        self.assertEqual(typed_events[0].targetId, "target-1")
        target_info = cast(dict[str, JsonValue], raw_events[0]["targetInfo"])
        self.assertEqual(target_info["targetId"], "target-1")


if __name__ == "__main__":
    unittest.main()
