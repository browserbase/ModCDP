# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/ModCDPClient_protocol_validation.test.ts
# - ./go/modcdp/client/ModCDPClient_protocol_validation_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest
from typing import TYPE_CHECKING, assert_type

from pydantic import BaseModel

from modcdp import ModCDPClient
from modcdp.client.ModCDPClient import AwaitableValue
from modcdp.types.generated.cdp import RuntimeDomain, TargetDomain
from modcdp.types.generated.cdp import AwaitableDict
from modcdp.types.modcdp import JsonValue, ProtocolPayload


class CustomEchoParams(BaseModel):
    text: str


class CustomEchoResult(BaseModel):
    ok: bool


class CustomReadyEvent(BaseModel):
    ok: bool


class ModCDPClientProtocolValidationTests(unittest.TestCase):
    def test_protocol_validation_covers_native_methods_native_events_custom_methods_custom_events_and_native_overrides(self) -> None:
        client = ModCDPClient()

        if TYPE_CHECKING:
            runtime_result = client.Runtime.evaluate(expression="1 + 1", returnByValue=True)
            assert_type(runtime_result, RuntimeDomain._EvaluateResult)

            def on_target_created(event: TargetDomain._TargetCreatedEvent) -> None:
                assert_type(event.targetId, str | None)

            assert_type(client.on(client.Target.targetCreated, on_target_created), ModCDPClient)
            assert_type(
                client.Mod.addCustomCommand("Custom.echo", params_schema=CustomEchoParams, result_schema=CustomEchoResult),
                AwaitableDict | AwaitableValue,
            )
            assert_type(client.Mod.addCustomEvent("Custom.ready", event_schema=CustomReadyEvent), AwaitableDict | AwaitableValue)
            assert_type(
                client.Mod.addMiddleware(
                    name="Target.getTargets",
                    phase="response",
                    expression="async (value, next) => next(value)",
                ),
                AwaitableDict | AwaitableValue,
            )

        runtime_params = {"expression": "1 + 1", "returnByValue": True}
        runtime_result_payload = {"result": {"type": "number", "value": 2, "description": "2"}}
        native_target_info: dict[str, JsonValue] = {
            "targetId": "target-1",
            "type": "page",
            "title": "Example",
            "url": "https://example.com",
            "attached": False,
            "canAccessOpener": False,
        }
        native_event_payload: ProtocolPayload = {"targetInfo": native_target_info}

        self.assertEqual(client.types.parseCommandParams("Runtime.evaluate", runtime_params), runtime_params)
        self.assertEqual(client.types.parseCommandResult("Runtime.evaluate", runtime_result_payload), runtime_result_payload)
        self.assertEqual(client.types.parseEventPayload("Target.targetCreated", native_event_payload), native_event_payload)
        with self.assertRaises(ValueError):
            client.types.parseCommandParams("Runtime.evaluate", {})
        with self.assertRaises(ValueError):
            client.types.parseCommandResult("Runtime.evaluate", {})
        with self.assertRaises(ValueError):
            client.types.parseEventPayload("Target.targetCreated", {})

        client.Mod.addCustomCommand("Custom.echo", params_schema=CustomEchoParams, result_schema=CustomEchoResult)
        client.Mod.addCustomEvent("Custom.ready", event_schema=CustomReadyEvent)

        self.assertEqual(client.types.parseCommandParams("Custom.echo", {"text": "ok"}), {"text": "ok"})
        self.assertEqual(client.types.parseCommandResult("Custom.echo", {"ok": True}), {"ok": True})
        self.assertEqual(client.types.parseEventPayload("Custom.ready", {"ok": True}), {"ok": True})
        with self.assertRaises(ValueError):
            client.types.parseCommandParams("Custom.echo", {"text": 1})
        with self.assertRaises(ValueError):
            client.types.parseCommandResult("Custom.echo", {"ok": "yes"})
        with self.assertRaises(ValueError):
            client.types.parseEventPayload("Custom.ready", {"ok": "yes"})

        client.Mod.addCustomCommand(
            "Target.getTargets",
            result_schema={
                "type": "object",
                "properties": {
                    "targetInfos": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "targetId": {"type": "string"},
                                "type": {"type": "string"},
                                "title": {"type": "string"},
                                "url": {"type": "string"},
                                "attached": {"type": "boolean"},
                                "canAccessOpener": {"type": "boolean"},
                                "tabId": {"type": "integer"},
                            },
                            "required": ["targetId", "type", "title", "url", "attached", "canAccessOpener"],
                            "additionalProperties": True,
                        },
                    }
                },
                "required": ["targetInfos"],
                "additionalProperties": True,
            },
        )
        client.Mod.addCustomEvent("Target.targetCreated")

        extended_target_info = {**native_target_info, "tabId": 7}
        self.assertEqual(client.types.parseCommandResult("Target.getTargets", {"targetInfos": [extended_target_info]}), {"targetInfos": [extended_target_info]})
        self.assertEqual(
            client.types.parseEventPayload("Target.targetCreated", {"targetInfo": extended_target_info}),
            {"targetInfo": extended_target_info},
        )


if __name__ == "__main__":
    unittest.main()
