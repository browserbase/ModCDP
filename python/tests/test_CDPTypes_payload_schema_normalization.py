# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.CDPTypes_payload_schema_normalization.ts
# - ./go/modcdp/client/CDPTypes_payload_schema_normalization_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest

from modcdp.types.CDPTypes import CDPTypes


class CDPTypesPayloadSchemaNormalizationTests(unittest.TestCase):
    def test_payload_schema_normalization_accepts_empty_json_schema_objects(self) -> None:
        types = CDPTypes()
        types.addCustomCommand({"name": "Custom.empty", "params_schema": {}})
        self.assertEqual(types.parseCommandParams("Custom.empty", {"value": 1}), {"value": 1})

    def test_payload_schema_normalization_rejects_unsupported_schema_specs(self) -> None:
        with self.assertRaises(TypeError):
            CDPTypes().addCustomCommand({"name": "Custom.bad", "params_schema": "not-a-schema"})

    def test_payload_schema_normalization_accepts_non_empty_json_schema_objects(self) -> None:
        types = CDPTypes()
        types.addCustomCommand(
            {
                "name": "Custom.nonEmpty",
                "params_schema": {
                    "type": "object",
                    "properties": {"value": {"type": "string"}},
                    "required": ["value"],
                },
            },
        )

        self.assertEqual(
            types.parseCommandParams("Custom.nonEmpty", {"value": "ok", "extra": True}),
            {"value": "ok", "extra": True},
        )


if __name__ == "__main__":
    unittest.main()
