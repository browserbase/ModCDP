# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.ModCDPClientCustomFlatNamespace.ts
# - ./go/modcdp/client/ModCDPClientCustomFlatNamespace_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import asyncio
from queue import Queue
import unittest
from pathlib import Path

from pydantic import BaseModel

from modcdp import ModCDPClient


ROOT = Path(__file__).resolve().parents[2]
EXTENSION_PATH = ROOT / "dist" / "extension"


class ModCDPClientCustomFlatNamespaceTests(unittest.TestCase):
    def test_pydantic_custom_command_installs_flat_dynamic_method_through_real_service_worker(self) -> None:
        class ParamsSchema(BaseModel):
            id: str

        class ResultSchema(BaseModel):
            success: bool

        client = ModCDPClient(
            launcher={
                "launcher_mode": "local",
                "launcher_local_headless": True,
            },
            upstream={"upstream_mode": "ws"},
            injector={
                "injector_mode": "cli",
                "injector_cli_extension_path": str(EXTENSION_PATH),
                "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                "injector_trust_service_worker_target": True,
            },
            router={"router_routes": {"Mod.*": "service_worker", "Custom.*": "service_worker", "*.*": "direct_cdp"}},
            server_config={"router": {"router_routes": {"*.*": "loopback_cdp"}}},
        )

        async def run() -> None:
            client.connect()
            registered = await client.Mod.addCustomCommand(
                "Custom.doSomething",
                params_schema=ParamsSchema,
                result_schema=ResultSchema,
                expression="async ({ id }) => ({ success: id === 'abc' })",
            )
            self.assertEqual(registered, {"name": "Custom.doSomething", "registered": True})
            success = await client.Custom.doSomething(id="abc")
            raw_success = await client.send("Custom.doSomething", {"id": "abc"})
            self.assertEqual(success, {"success": True})
            self.assertEqual(raw_success, {"success": True})

        try:
            asyncio.run(run())
            with self.assertRaises(ValueError):
                client.Custom.doSomething(id=123)
        finally:
            client.close()

    def test_pydantic_custom_event_schema_coerces_raw_string_handlers_through_real_service_worker(self) -> None:
        class EventSchema(BaseModel):
            data: str

        client = ModCDPClient(
            launcher={
                "launcher_mode": "local",
                "launcher_local_headless": True,
            },
            upstream={"upstream_mode": "ws"},
            injector={
                "injector_mode": "cli",
                "injector_cli_extension_path": str(EXTENSION_PATH),
                "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                "injector_trust_service_worker_target": True,
            },
            router={"router_routes": {"Mod.*": "service_worker", "Custom.*": "service_worker", "*.*": "direct_cdp"}},
            server_config={"router": {"router_routes": {"*.*": "loopback_cdp"}}},
        )
        seen: Queue[str] = Queue()

        async def callback(event: dict[str, str]) -> None:
            seen.put(event["data"])

        async def run() -> None:
            client.connect()
            await client.Mod.addCustomEvent("Custom.someEvent", event_schema=EventSchema)
            await client.on("Custom.someEvent", callback)
            await client.Mod.evaluate(
                expression="async () => globalThis.__ModCDP_custom_event__(JSON.stringify({ event: 'Custom.someEvent', data: { data: 'ok' }, cdpSessionId: null }))"
            )

        try:
            asyncio.run(run())
            self.assertEqual(seen.get(timeout=10), "ok")
        finally:
            client.close()

    def test_schema_only_custom_commands_register_without_a_websocket(self) -> None:
        client = ModCDPClient(
            launcher={"launcher_mode": "none"},
            upstream={"upstream_mode": "ws"},
            injector={"injector_mode": "none"},
            server_config=None,
        )

        result = client.send(
            "Mod.addCustomCommand",
            {
                "name": "Custom.echo",
                "params_schema": {
                    "type": "object",
                    "properties": {"text": {"type": "string", "minLength": 1}},
                    "required": ["text"],
                    "additionalProperties": False,
                },
                "result_schema": {
                    "type": "object",
                    "properties": {"text": {"type": "string"}},
                    "required": ["text"],
                    "additionalProperties": False,
                },
            },
        )

        self.assertEqual(result, {"name": "Custom.echo", "registered": True})
        self.assertEqual(client.types.parseCommandParams("Custom.echo", {"text": "ok"}), {"text": "ok"})
        with self.assertRaises(ValueError):
            client.types.parseCommandParams("Custom.echo", {"text": ""})
        with self.assertRaises(ValueError):
            client.types.parseCommandParams("Custom.echo", {"text": "ok", "extra": True})
        self.assertEqual(client.types.parseCommandResult("Custom.echo", {"text": "ok"}), {"text": "ok"})
        with self.assertRaises(ValueError):
            client.types.parseCommandResult("Custom.echo", {"text": 123})

    def test_constructor_custom_command_and_event_schemas_validate_nested_payloads(self) -> None:
        client = ModCDPClient(
            launcher={"launcher_mode": "none"},
            upstream={"upstream_mode": "ws"},
            injector={"injector_mode": "none"},
            server_config=None,
            types={
                "custom_commands": [
                    {
                        "name": "Custom.collect",
                        "params_schema": {
                            "type": "object",
                            "properties": {
                                "items": {
                                    "type": "array",
                                    "minItems": 1,
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "id": {"type": "string"},
                                            "count": {"type": "integer", "minimum": 1},
                                        },
                                        "required": ["id", "count"],
                                        "additionalProperties": False,
                                    },
                                },
                            },
                            "required": ["items"],
                            "additionalProperties": False,
                        },
                    }
                ],
                "custom_events": [
                    {
                        "name": "Custom.ready",
                        "event_schema": {
                            "type": "object",
                            "properties": {"url": {"type": "string", "pattern": "^https://"}, "ready": {"type": "boolean"}},
                            "required": ["url", "ready"],
                            "additionalProperties": False,
                        },
                    },
                    {"name": "Custom.count", "event_schema": {"type": "integer", "minimum": 1}},
                ],
            },
        )

        valid_params = {"items": [{"id": "a", "count": 1}]}
        self.assertEqual(client.types.parseCommandParams("Custom.collect", valid_params), valid_params)
        with self.assertRaises(ValueError):
            client.types.parseCommandParams("Custom.collect", {"items": [{"id": "a", "count": 0}]})
        with self.assertRaises(ValueError):
            client.types.parseCommandParams("Custom.collect", {"items": []})
        self.assertEqual(
            client.types.parseEventPayload("Custom.ready", {"url": "https://example.com", "ready": True}),
            {"url": "https://example.com", "ready": True},
        )
        with self.assertRaises(ValueError):
            client.types.parseEventPayload("Custom.ready", {"url": "http://example.com", "ready": True})
        self.assertEqual(client.types.parseEventPayload("Custom.count", {"value": 3}), {"value": 3})
        with self.assertRaises(ValueError):
            client.types.parseEventPayload("Custom.count", {"value": 0})

    def test_assigned_type_registry_updates_runtime_validation_and_aliases(self) -> None:
        client = ModCDPClient(
            launcher={"launcher_mode": "none"},
            upstream={"upstream_mode": "ws"},
            injector={"injector_mode": "none"},
            server_config=None,
        )

        client.types = client.types.update(
            custom_commands={
                "Custom.later": {
                    "params_schema": {
                        "type": "object",
                        "properties": {"value": {"type": "number"}},
                        "required": ["value"],
                        "additionalProperties": False,
                    },
                    "result_schema": {
                        "type": "object",
                        "properties": {"ok": {"type": "boolean"}},
                        "required": ["ok"],
                        "additionalProperties": False,
                    },
                }
            },
            custom_events={
                "Custom.laterReady": {
                    "event_schema": {
                        "type": "object",
                        "properties": {"value": {"type": "string"}},
                        "required": ["value"],
                        "additionalProperties": False,
                    }
                }
            },
        )

        self.assertTrue(callable(client.Custom.later))
        self.assertEqual(client.types.parseCommandParams("Custom.later", {"value": 1}), {"value": 1})
        self.assertEqual(client.types.parseCommandResult("Custom.later", {"ok": True}), {"ok": True})
        self.assertEqual(client.types.parseEventPayload("Custom.laterReady", {"value": "ok"}), {"value": "ok"})


if __name__ == "__main__":
    unittest.main()
