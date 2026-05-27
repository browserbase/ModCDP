# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/ModCDPClient_protocol_validation.test.ts
# - ./go/modcdp/client/ModCDPClient_protocol_validation_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest

from pydantic import BaseModel, Field

from modcdp import ModCDPClient
from modcdp.types.CDPTypes import CDPTypes
from modcdp.types.modcdp import JsonValue, ProtocolPayload


class SumParams(BaseModel):
    left: int
    right: int


class SumResult(BaseModel):
    value: int


class FinishedEvent(BaseModel):
    total: int
    label: str


class DynamicParams(BaseModel):
    text: str = Field(min_length=1)


class DynamicResult(BaseModel):
    ok: bool


class UpdatedParams(BaseModel):
    count: int = Field(gt=0)


class UpdatedResult(BaseModel):
    done: bool


class UpdatedReadyEvent(BaseModel):
    ready: bool


class ModCDPClientProtocolValidationTests(unittest.TestCase):
    def test_native_cdp_schemas_validate_method_params_return_values_and_event_payloads_statically_and_at_runtime(self) -> None:
        types = CDPTypes()
        client = ModCDPClient(launcher={"launcher_mode": "none"}, upstream={"upstream_mode": "ws"}, injector={"injector_mode": "none"}, server_config=None)
        runtime_params = {"expression": "1 + 1", "returnByValue": True}
        runtime_result = {"result": {"type": "number", "value": 2, "description": "2"}}
        target_event: ProtocolPayload = {
            "targetInfo": {
                "targetId": "target-1",
                "type": "page",
                "title": "Example",
                "url": "https://example.com",
                "attached": False,
                "canAccessOpener": False,
            }
        }

        self.assertTrue(callable(client.Runtime.evaluate))
        self.assertEqual(types.parseCommandParams("Runtime.evaluate", runtime_params), runtime_params)
        self.assertEqual(types.parseCommandResult("Runtime.evaluate", runtime_result), runtime_result)
        self.assertEqual(types.parseEventPayload("Target.targetCreated", target_event), target_event)
        with self.assertRaises(ValueError):
            types.parseCommandParams("Runtime.evaluate", {"returnByValue": True})
        with self.assertRaises(ValueError):
            types.parseCommandResult("Runtime.evaluate", {})
        with self.assertRaises(ValueError):
            types.parseEventPayload("Target.targetCreated", {})

    def test_mod_schemas_validate_method_params_return_values_event_payloads_and_middleware_registrations_statically_and_at_runtime(self) -> None:
        types = CDPTypes()
        client = ModCDPClient(launcher={"launcher_mode": "none"}, upstream={"upstream_mode": "ws"}, injector={"injector_mode": "none"}, server_config=None)
        ping_params = {"sent_at": 123}
        ping_result = {"ok": True}
        pong_event = {"sent_at": 123, "received_at": 124, "from": "extension-service-worker"}
        middleware_params = {
            "name": client.Target.getTargets,
            "phase": "response",
            "expression": "async (payload, next) => next(payload)",
        }
        middleware_result = {"name": "Target.getTargets", "phase": "response", "registered": True}

        self.assertEqual(types.parseCommandParams("Mod.ping", ping_params), ping_params)
        self.assertEqual(types.parseCommandResult("Mod.ping", ping_result), ping_result)
        self.assertEqual(types.parseEventPayload("Mod.pong", pong_event), pong_event)
        self.assertEqual(
            types.parseCommandParams("Mod.addMiddleware", middleware_params),
            {
                "name": "Target.getTargets",
                "phase": "response",
                "expression": "async (payload, next) => next(payload)",
            },
        )
        self.assertEqual(types.parseCommandResult("Mod.addMiddleware", middleware_result), middleware_result)
        with self.assertRaises(ValueError):
            types.parseCommandParams("Mod.ping", {"sent_at": "123"})
        with self.assertRaises(ValueError):
            types.parseCommandResult("Mod.ping", {"ok": "true"})
        with self.assertRaises(ValueError):
            types.parseEventPayload("Mod.pong", {"sent_at": 123, "from": "extension-service-worker"})
        with self.assertRaises(ValueError):
            types.parseCommandParams("Mod.addMiddleware", {"name": "Custom.any", "phase": "after", "expression": "async (payload, next) => next(payload)"})
        with self.assertRaises(ValueError):
            types.parseCommandResult("Mod.addMiddleware", {"name": "Custom.any", "phase": "after", "registered": True})

    def test_constructor_custom_schemas_validate_command_params_return_values_events_and_middleware_registrations_statically_and_at_runtime(self) -> None:
        client = ModCDPClient(
            launcher={"launcher_mode": "none"},
            upstream={"upstream_mode": "ws"},
            injector={"injector_mode": "none"},
            server_config=None,
            types={
                "custom_commands": {
                    "Custom.sum": {
                        "params_schema": SumParams,
                        "result_schema": SumResult,
                        "expression": "async ({ left, right }) => ({ value: left + right })",
                    }
                },
                "custom_events": {"Custom.finished": {"event_schema": FinishedEvent}},
                "custom_middlewares": [{"name": "Custom.sum", "phase": "response", "expression": "async (payload, next) => next(payload)"}],
            },
        )

        self.assertEqual(client.types.parseCommandParams("Custom.sum", {"left": 1, "right": 2}), {"left": 1, "right": 2})
        self.assertEqual(client.types.parseCommandResult("Custom.sum", {"value": 3}), {"value": 3})
        self.assertEqual(client.types.parseEventPayload("Custom.finished", {"total": 3, "label": "ok"}), {"total": 3, "label": "ok"})
        with self.assertRaises(ValueError):
            client.types.parseCommandParams("Custom.sum", {"left": "1", "right": 2})
        with self.assertRaises(ValueError):
            client.types.parseCommandResult("Custom.sum", {"value": "3"})
        with self.assertRaises(ValueError):
            client.types.parseEventPayload("Custom.finished", {"total": "3", "label": "ok"})
        self.assertEqual(
            client.types.customMiddlewareWireRegistrations(),
            [{"name": "Custom.sum", "phase": "response", "expression": "async (payload, next) => next(payload)"}],
        )
        with self.assertRaises(Exception):
            CDPTypes(custom_middlewares=[{"name": "Custom.sum", "phase": "after", "expression": "async (payload, next) => next(payload)"}])

    def test_dynamic_mod_registration_updates_custom_command_event_and_middleware_validation(self) -> None:
        client = ModCDPClient(launcher={"launcher_mode": "none"}, upstream={"upstream_mode": "ws"}, injector={"injector_mode": "none"}, server_config=None)

        self.assertEqual(
            client.Mod.addCustomCommand("Custom.dynamic", params_schema=DynamicParams, result_schema=DynamicResult),
            {"name": "Custom.dynamic", "registered": True},
        )
        self.assertEqual(
            client.Mod.addCustomEvent(
                "Custom.dynamicReady",
                event_schema={
                    "type": "object",
                    "properties": {"id": {"type": "string", "pattern": "^[0-9a-f-]{36}$"}},
                    "required": ["id"],
                    "additionalProperties": False,
                },
            ),
            {"name": "Custom.dynamicReady", "registered": True},
        )
        self.assertEqual(
            client.Mod.addMiddleware(
                name="Custom.dynamic",
                phase="response",
                expression="async (payload, next) => next(payload)",
            ),
            {"name": "Custom.dynamic", "phase": "response", "registered": True},
        )

        self.assertTrue(callable(client.Custom.dynamic))
        self.assertEqual(client.types.parseCommandParams("Custom.dynamic", {"text": "ok"}), {"text": "ok"})
        self.assertEqual(client.types.parseCommandResult("Custom.dynamic", {"ok": True}), {"ok": True})
        self.assertEqual(
            client.types.parseEventPayload("Custom.dynamicReady", {"id": "550e8400-e29b-41d4-a716-446655440000"}),
            {"id": "550e8400-e29b-41d4-a716-446655440000"},
        )
        self.assertEqual(
            client.types.customMiddlewareWireRegistrations(),
            [{"name": "Custom.dynamic", "phase": "response", "expression": "async (payload, next) => next(payload)"}],
        )
        with self.assertRaises(ValueError):
            client.types.parseCommandParams("Custom.dynamic", {"text": ""})
        with self.assertRaises(ValueError):
            client.types.parseCommandResult("Custom.dynamic", {"ok": "yes"})
        with self.assertRaises(ValueError):
            client.types.parseEventPayload("Custom.dynamicReady", {"id": "nope"})
        with self.assertRaises(ValueError):
            client.Mod.addMiddleware(name="Custom.dynamic", phase="after", expression="async (payload, next) => next(payload)")

    def test_client_types_update_replaces_the_registry_with_extended_runtime_validation_and_preserves_static_custom_aliases_on_typed_clients(self) -> None:
        client = ModCDPClient(launcher={"launcher_mode": "none"}, upstream={"upstream_mode": "ws"}, injector={"injector_mode": "none"}, server_config=None)
        updated_types = client.types.update(
            {
                "custom_commands": {
                    "Custom.updated": {
                        "params_schema": UpdatedParams,
                        "result_schema": UpdatedResult,
                    }
                },
                "custom_events": {"Custom.updatedReady": {"event_schema": UpdatedReadyEvent}},
                "custom_middlewares": [{"name": "Custom.updated", "phase": "request", "expression": "async (payload, next) => next(payload)"}],
            }
        )
        typed_client = ModCDPClient(
            launcher={"launcher_mode": "none"},
            upstream={"upstream_mode": "ws"},
            injector={"injector_mode": "none"},
            server_config=None,
            types=updated_types,
        )
        client.types = updated_types

        self.assertTrue(callable(typed_client.Custom.updated))
        self.assertTrue(callable(client.Custom.updated))
        self.assertEqual(client.types.parseCommandParams("Custom.updated", {"count": 1}), {"count": 1})
        self.assertEqual(client.types.parseCommandResult("Custom.updated", {"done": True}), {"done": True})
        self.assertEqual(client.types.parseEventPayload("Custom.updatedReady", {"ready": True}), {"ready": True})
        self.assertEqual(
            client.types.customMiddlewareWireRegistrations(),
            [{"name": "Custom.updated", "phase": "request", "expression": "async (payload, next) => next(payload)"}],
        )
        with self.assertRaises(ValueError):
            client.types.parseCommandParams("Custom.updated", {"count": 0})
        with self.assertRaises(ValueError):
            client.types.parseCommandResult("Custom.updated", {"done": "true"})
        with self.assertRaises(ValueError):
            client.types.parseEventPayload("Custom.updatedReady", {"ready": "true"})


if __name__ == "__main__":
    unittest.main()
