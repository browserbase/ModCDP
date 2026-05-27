# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.CDPTypes_payload_schema_normalization.ts
# - ./go/modcdp/client/CDPTypes_payload_schema_normalization_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest

from modcdp.types.CDPTypes import CDPTypes
from modcdp.types.modcdp import _isObjectMap


class CDPTypesPayloadSchemaNormalizationTests(unittest.TestCase):
    def test_validatezodschema_accepts_empty_zod_shapes(self) -> None:
        types = CDPTypes()
        types.addCustomCommand({"name": "Custom.empty", "params_schema": {}})
        self.assertEqual(types.parseCommandParams("Custom.empty", {"value": 1}), {"value": 1})

    def test_validatezodschema_rejects_unsupported_schema_specs(self) -> None:
        with self.assertRaises(TypeError):
            CDPTypes().addCustomCommand({"name": "Custom.bad", "params_schema": "not-a-schema"})

    def test_validatezodschema_accepts_non_empty_zod_shapes(self) -> None:
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

    def test_cdp_types_serializes_builtin_mod_command_schemas_through_the_same_wire_path(self) -> None:
        types = CDPTypes()

        for name in ["Mod.configure", "Mod.addCustomCommand", "Mod.addCustomEvent"]:
            registration = next(command for command in types.customCommandWireRegistrations() if command["name"] == name)
            self.assertIsInstance(registration.get("params_schema"), dict)
            self.assertIsInstance(registration.get("result_schema"), dict)

        parsed_configure_params = types.parseCommandParams(
            "Mod.configure",
            {
                "client_config": {"client_hydrate_aliases": False},
                "downstream": {
                    "downstream_client_timeout_ms": 1234,
                    "downstream_close_browser_on_disconnect": True,
                },
            },
        )
        client_config = parsed_configure_params.get("client_config")
        if not _isObjectMap(client_config):
            raise AssertionError(f"client_config = {client_config!r}")
        self.assertEqual(client_config["client_hydrate_aliases"], False)
        downstream = parsed_configure_params.get("downstream")
        if not _isObjectMap(downstream):
            raise AssertionError(f"downstream = {downstream!r}")
        self.assertEqual(downstream["downstream_client_timeout_ms"], 1234)
        self.assertEqual(downstream["downstream_close_browser_on_disconnect"], True)
        with self.assertRaisesRegex(ValueError, "downstream"):
            types.parseCommandParams("Mod.configure", {"downstream": {"closeBrowser": "not allowed over the wire"}})


if __name__ == "__main__":
    unittest.main()
