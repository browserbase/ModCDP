# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.ModCDPClientCustomFlatNamespace.ts
# - ./go/modcdp/client/ModCDPClientCustomFlatNamespace_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import asyncio
import glob
import os
import re
from queue import Queue
import sys
import unittest
from pathlib import Path

from pydantic import BaseModel

from modcdp import ModCDPClient


# MODCDP_TEST_SUPPORT: LANGUAGE-SPECIFIC TEST SUPPORT ONLY.
# Keep the setup semantics below 1:1 with translated tests; helpers here only select real browsers for real --load-extension runs.
def load_extension_test_browser_path() -> str:
    for candidate in (os.environ.get("CHROME_PATH"), "/usr/bin/chromium" if sys.platform.startswith("linux") else None):
        if candidate and Path(candidate).exists():
            return candidate
    home = Path.home()
    if sys.platform == "darwin":
        patterns = [
            str(home / "Library/Caches/ms-playwright/chromium-*/chrome-mac*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
            str(home / "Library/Caches/ms-playwright/chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium"),
            str(home / "Library/Caches/puppeteer/chrome/mac*-*/chrome-mac*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
        ]
    elif sys.platform.startswith("win"):
        local_app_data = Path(os.environ.get("LOCALAPPDATA") or home / "AppData/Local")
        patterns = [
            str(local_app_data / "ms-playwright/chromium-*/chrome-win*/chrome.exe"),
            str(home / ".cache/puppeteer/chrome/win*-*/chrome-win*/chrome.exe"),
        ]
    else:
        patterns = [
            str(home / ".cache/ms-playwright/chromium-*/chrome-linux*/chrome"),
            "/opt/pw-browsers/chromium-*/chrome-linux*/chrome",
            str(home / ".cache/puppeteer/chrome/linux-*/chrome-linux*/chrome"),
        ]
    candidates = sorted(
        dict.fromkeys(match for pattern in patterns for match in glob.glob(pattern)),
        key=lambda path: (-max([int(part) for part in re.findall(r"\d+", path)] or [0]), -Path(path).stat().st_mtime, path),
    )
    if candidates:
        return candidates[0]
    raise RuntimeError("No browser found for --load-extension tests. Install Chrome for Testing or set CHROME_PATH.")


ROOT = Path(__file__).resolve().parents[2]
EXTENSION_PATH = ROOT / "dist" / "extension"
LOAD_EXTENSION_TEST_BROWSER_PATH = load_extension_test_browser_path()


class ModCDPClientCustomFlatNamespaceTests(unittest.TestCase):
    def test_custom_commands_install_flat_namespace_methods_through_a_real_service_worker(self) -> None:
        class ParamsSchema(BaseModel):
            id: str
            suffix: str = ""

        class ResultSchema(BaseModel):
            success: bool

        client = ModCDPClient(
            launcher={
                "launcher_mode": "local",
                "launcher_local_headless": True,
                "launcher_local_executable_path": LOAD_EXTENSION_TEST_BROWSER_PATH,
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
            types={
                "custom_commands": {
                    "Custom.doSomething": {
                        "params_schema": ParamsSchema,
                        "result_schema": ResultSchema,
                        "expression": "async ({ id, suffix = '' }) => ({ success: `${id}${suffix}` === 'abcmiddleware' })",
                    },
                    "Custom.badResult": {
                        "params_schema": {
                            "type": "object",
                            "properties": {"id": {"type": "string"}},
                            "required": ["id"],
                            "additionalProperties": False,
                        },
                        "result_schema": ResultSchema,
                        "expression": "async () => ({ success: 'yes' })",
                    },
                },
                "custom_middlewares": [
                    {
                        "name": "Custom.doSomething",
                        "phase": "request",
                        "expression": "async (payload, next) => next({ ...payload, suffix: 'middleware' })",
                    }
                ],
            },
        )

        async def run() -> None:
            client.connect()
            success = await client.Custom.doSomething(id="abc")
            raw_success = await client.send("Custom.doSomething", {"id": "abc"})
            self.assertEqual(success, {"success": True})
            self.assertEqual(raw_success, {"success": True})
            with self.assertRaises(ValueError):
                await client.Custom.doSomething(id=123)
            with self.assertRaisesRegex(Exception, "boolean"):
                await client.Custom.badResult(id="abc")

        try:
            asyncio.run(run())
        finally:
            client.close()

    def test_custom_events_validate_raw_string_handlers_through_a_real_service_worker(self) -> None:
        class EventSchema(BaseModel):
            data: str

        client = ModCDPClient(
            launcher={
                "launcher_mode": "local",
                "launcher_local_headless": True,
                "launcher_local_executable_path": LOAD_EXTENSION_TEST_BROWSER_PATH,
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

    def test_dynamic_custom_command_event_and_middleware_registration_validates_through_a_real_service_worker(self) -> None:
        client = ModCDPClient(
            launcher={
                "launcher_mode": "local",
                "launcher_local_headless": True,
                "launcher_local_executable_path": LOAD_EXTENSION_TEST_BROWSER_PATH,
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

        async def run() -> None:
            client.connect()
            self.assertEqual(
                await client.Mod.addCustomCommand(
                    "Custom.dynamic",
                    params_schema={
                        "type": "object",
                        "properties": {"text": {"type": "string", "minLength": 1}},
                        "required": ["text"],
                        "additionalProperties": False,
                    },
                    result_schema={
                        "type": "object",
                        "properties": {"ok": {"type": "boolean"}},
                        "required": ["ok"],
                        "additionalProperties": False,
                    },
                    expression="async ({ text }) => ({ ok: text === 'live-dynamic' })",
                ),
                {"name": "Custom.dynamic", "registered": True},
            )
            self.assertEqual(
                await client.Mod.addCustomCommand(
                    "Custom.dynamicBadResult",
                    params_schema={
                        "type": "object",
                        "properties": {"text": {"type": "string"}},
                        "required": ["text"],
                        "additionalProperties": False,
                    },
                    result_schema={
                        "type": "object",
                        "properties": {"ok": {"type": "boolean"}},
                        "required": ["ok"],
                        "additionalProperties": False,
                    },
                    expression="async () => ({ ok: 'yes' })",
                ),
                {"name": "Custom.dynamicBadResult", "registered": True},
            )
            self.assertEqual(
                await client.Mod.addCustomEvent(
                    "Custom.dynamicReady",
                    event_schema={
                        "type": "object",
                        "properties": {"id": {"type": "string", "format": "uuid"}},
                        "required": ["id"],
                        "additionalProperties": False,
                    },
                ),
                {"name": "Custom.dynamicReady", "registered": True},
            )
            self.assertEqual(
                await client.Mod.addMiddleware(
                    name="Custom.dynamic",
                    phase="request",
                    expression="async (payload, next) => next({ ...payload, text: `${payload.text}-dynamic` })",
                ),
                {"name": "Custom.dynamic", "phase": "request", "registered": True},
            )

            self.assertEqual(await client.send("Custom.dynamic", {"text": "live"}), {"ok": True})
            with self.assertRaises(ValueError):
                await client.send("Custom.dynamic", {"text": ""})
            with self.assertRaisesRegex(Exception, "boolean"):
                await client.send("Custom.dynamicBadResult", {"text": "live"})
            with self.assertRaises(ValueError):
                await client.Mod.addMiddleware(
                    name="Custom.dynamic",
                    phase="after",
                    expression="async (payload, next) => next(payload)",
                )

            await client.on("Custom.dynamicReady", lambda _event: seen.put("ready"))
            await client.Mod.evaluate(
                expression="async () => globalThis.__ModCDP_custom_event__(JSON.stringify({ event: 'Custom.dynamicReady', data: { id: '550e8400-e29b-41d4-a716-446655440000' }, cdpSessionId: null }))"
            )

        try:
            asyncio.run(run())
            self.assertEqual(seen.get(timeout=10), "ready")
        finally:
            client.close()

    def test_assigned_type_registry_validates_updated_custom_command_event_and_middleware_schemas_through_a_real_service_worker(self) -> None:
        client = ModCDPClient(
            launcher={
                "launcher_mode": "local",
                "launcher_local_headless": True,
                "launcher_local_executable_path": LOAD_EXTENSION_TEST_BROWSER_PATH,
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
        client.types = client.types.update(
            custom_commands={
                "Custom.updated": {
                    "params_schema": {
                        "type": "object",
                        "properties": {"count": {"type": "integer", "minimum": 0}},
                        "required": ["count"],
                        "additionalProperties": False,
                    },
                    "result_schema": {
                        "type": "object",
                        "properties": {"done": {"type": "boolean"}},
                        "required": ["done"],
                        "additionalProperties": False,
                    },
                    "expression": "async ({ count }) => ({ done: count === 2 })",
                },
                "Custom.updatedBadResult": {
                    "params_schema": {
                        "type": "object",
                        "properties": {"count": {"type": "number"}},
                        "required": ["count"],
                        "additionalProperties": False,
                    },
                    "result_schema": {
                        "type": "object",
                        "properties": {"done": {"type": "boolean"}},
                        "required": ["done"],
                        "additionalProperties": False,
                    },
                    "expression": "async () => ({ done: 'yes' })",
                },
            },
            custom_events={
                "Custom.updatedReady": {
                    "event_schema": {
                        "type": "object",
                        "properties": {"ready": {"type": "boolean"}},
                        "required": ["ready"],
                        "additionalProperties": False,
                    }
                }
            },
            custom_middlewares=[
                {
                    "name": "Custom.updated",
                    "phase": "request",
                    "expression": "async (payload, next) => next({ ...payload, count: payload.count + 1 })",
                }
            ],
        )
        seen: Queue[bool] = Queue()

        async def run() -> None:
            client.connect()
            self.assertEqual(await client.send("Custom.updated", {"count": 1}), {"done": True})
            with self.assertRaises(ValueError):
                await client.send("Custom.updated", {"count": -1})
            with self.assertRaisesRegex(Exception, "boolean"):
                await client.send("Custom.updatedBadResult", {"count": 1})

            await client.on("Custom.updatedReady", lambda _event: seen.put(True))
            await client.Mod.evaluate(
                expression="async () => globalThis.__ModCDP_custom_event__(JSON.stringify({ event: 'Custom.updatedReady', data: { ready: true }, cdpSessionId: null }))"
            )

        try:
            asyncio.run(run())
            self.assertEqual(seen.get(timeout=10), True)
        finally:
            client.close()

    def test_service_worker_server_validates_registered_custom_command_and_event_schemas(self) -> None:
        client = ModCDPClient(
            launcher={
                "launcher_mode": "local",
                "launcher_local_headless": True,
                "launcher_local_executable_path": LOAD_EXTENSION_TEST_BROWSER_PATH,
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
        seen: Queue[bool] = Queue()

        async def run() -> None:
            client.connect()
            self.assertEqual(
                await client.Mod.addCustomCommand(
                    "Custom.double",
                    params_schema={
                        "type": "object",
                        "properties": {"value": {"type": "number"}},
                        "required": ["value"],
                        "additionalProperties": False,
                    },
                    result_schema={
                        "type": "object",
                        "properties": {"value": {"type": "number"}},
                        "required": ["value"],
                        "additionalProperties": False,
                    },
                    expression="async (params) => ({ value: params.value * 2 })",
                ),
                {"name": "Custom.double", "registered": True},
            )
            self.assertEqual(client.types.parseCommandParams("Custom.double", {"value": 2}), {"value": 2})
            self.assertEqual(client.types.parseCommandResult("Custom.double", {"value": 4}), {"value": 4})
            self.assertEqual(await client.send("Custom.double", {"value": 2}), {"value": 4})

            self.assertEqual(
                await client.Mod.addCustomCommand(
                    "Custom.badResult",
                    result_schema={
                        "type": "object",
                        "properties": {"ok": {"type": "boolean"}},
                        "required": ["ok"],
                        "additionalProperties": False,
                    },
                    expression='async () => ({ ok: "yes" })',
                ),
                {"name": "Custom.badResult", "registered": True},
            )
            with self.assertRaisesRegex(Exception, "boolean"):
                await client.send("Custom.badResult", {})

            self.assertEqual(
                await client.Mod.addCustomEvent(
                    "Custom.ready",
                    event_schema={
                        "type": "object",
                        "properties": {"ok": {"type": "boolean"}},
                        "required": ["ok"],
                        "additionalProperties": False,
                    },
                ),
                {"name": "Custom.ready", "registered": True},
            )
            self.assertEqual(client.types.parseEventPayload("Custom.ready", {"ok": True}), {"ok": True})
            with self.assertRaises(ValueError):
                client.types.parseEventPayload("Custom.ready", {"ok": "yes"})
            await client.on("Custom.ready", lambda event: seen.put(bool(event["ok"])))
            await client.Mod.evaluate(
                expression="async () => globalThis.__ModCDP_custom_event__(JSON.stringify({ event: 'Custom.ready', data: { ok: true }, cdpSessionId: null }))"
            )

        try:
            asyncio.run(run())
            self.assertEqual(seen.get(timeout=10), True)
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
