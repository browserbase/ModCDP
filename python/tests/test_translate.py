# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.translate.ts
# - ./go/modcdp/translate/translate_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

from collections.abc import Mapping
import json
import unittest

from modcdp.translate import (
    CUSTOM_EVENT_BINDING_NAME,
    encode_binding_payload,
    route_for,
    unwrap_event_if_needed,
    unwrap_response_if_needed,
    wrap_command_if_needed,
)
from modcdp.types.modcdp import ModCDPBindingPayload


class TranslateTests(unittest.TestCase):
    def test_translate_routes_wraps_and_unwraps_modcdp_protocol_messages_deterministically(self) -> None:
        self.assertEqual(route_for("Browser.getVersion", {"Browser.*": "direct_cdp", "*.*": "service_worker"}), "direct_cdp")
        self.assertEqual(route_for("Target.getTargets", {"Browser.*": "direct_cdp", "*.*": "service_worker"}), "service_worker")
        self.assertEqual(route_for("Browser.getVersion"), "direct_cdp")

        direct = wrap_command_if_needed("Browser.getVersion", {}, routes={"*.*": "direct_cdp"})
        self.assertEqual(direct.target, "direct_cdp")
        self.assertEqual(direct.steps, [{"method": "Browser.getVersion", "params": {}}])

        wrapped = wrap_command_if_needed(
            "Mod.evaluate",
            {"expression": "({ ok: true })", "params": {"value": 1}},
            cdp_session_id="session-1",
        )
        self.assertEqual(wrapped.target, "service_worker")
        self.assertEqual(wrapped.steps[0].method, "Runtime.callFunctionOn")
        wrapped_step_params = wrapped.steps[0].params
        self.assertIsNotNone(wrapped_step_params)
        assert wrapped_step_params is not None
        self.assertIn("globalThis.ModCDP.handleCommand", str(wrapped_step_params.get("functionDeclaration")))
        wrapped_arguments = wrapped_step_params["arguments"]
        self.assertIsInstance(wrapped_arguments, list)
        assert isinstance(wrapped_arguments, list)
        self.assertIsInstance(wrapped_arguments[1], Mapping)
        self.assertIsInstance(wrapped_arguments[2], Mapping)
        assert isinstance(wrapped_arguments[1], Mapping)
        assert isinstance(wrapped_arguments[2], Mapping)
        self.assertEqual(len(wrapped_arguments[1]), 1)
        self.assertEqual(len(wrapped_arguments[2]), 1)
        self.assertEqual(json.loads(str(next(iter(wrapped_arguments[1].values())))), {"expression": "({ ok: true })", "params": {"value": 1}})
        self.assertEqual(next(iter(wrapped_arguments[2].values())), "session-1")
        self.assertEqual(wrapped.steps[0].unwrap, "runtime_json")

        configured = wrap_command_if_needed(
            "Mod.configure",
            {"router": {"router_routes": {"*.*": "loopback_cdp"}}},
            cdp_session_id="session-1",
        )
        self.assertEqual(configured.steps[0].unwrap, "runtime_json")

        ping = wrap_command_if_needed("Mod.ping", {})
        ping_step_params = ping.steps[0].params
        self.assertIsNotNone(ping_step_params)
        assert ping_step_params is not None
        ping_arguments = ping_step_params["arguments"]
        self.assertIsInstance(ping_arguments, list)
        assert isinstance(ping_arguments, list)
        self.assertIsInstance(ping_arguments[1], Mapping)
        assert isinstance(ping_arguments[1], Mapping)
        self.assertEqual(len(ping_arguments[1]), 1)
        self.assertEqual(json.loads(str(next(iter(ping_arguments[1].values())))), {})

        custom = wrap_command_if_needed(
            "Custom.echo",
            {"secret": "x" * 100, "nested": {"ok": True}},
            cdp_session_id="session-1",
        )
        custom_step_params = custom.steps[0].params
        self.assertIsNotNone(custom_step_params)
        assert custom_step_params is not None
        self.assertIn("JSON.parse(paramsJson)", str(custom_step_params.get("functionDeclaration")))
        self.assertNotIn("xxxxxxxxxx", str(custom_step_params.get("functionDeclaration")))
        custom_arguments = custom_step_params["arguments"]
        self.assertIsInstance(custom_arguments, list)
        assert isinstance(custom_arguments, list)
        self.assertIsInstance(custom_arguments[0], Mapping)
        self.assertIsInstance(custom_arguments[1], Mapping)
        self.assertIsInstance(custom_arguments[2], Mapping)
        assert isinstance(custom_arguments[0], Mapping)
        assert isinstance(custom_arguments[1], Mapping)
        assert isinstance(custom_arguments[2], Mapping)
        self.assertEqual(len(custom_arguments[0]), 1)
        self.assertEqual(len(custom_arguments[1]), 1)
        self.assertEqual(len(custom_arguments[2]), 1)
        self.assertEqual(next(iter(custom_arguments[0].values())), "Custom.echo")
        self.assertEqual(json.loads(str(next(iter(custom_arguments[1].values())))), {"secret": "x" * 100, "nested": {"ok": True}})
        self.assertEqual(next(iter(custom_arguments[2].values())), "session-1")

        custom_with_session = wrap_command_if_needed(
            "Custom.echo",
            {"secret": "targeted"},
            cdp_session_id="target-session-1",
        )
        custom_with_session_params = custom_with_session.steps[0].params
        self.assertIsNotNone(custom_with_session_params)
        assert custom_with_session_params is not None
        custom_with_session_arguments = custom_with_session_params["arguments"]
        self.assertIsInstance(custom_with_session_arguments, list)
        assert isinstance(custom_with_session_arguments, list)
        self.assertIsInstance(custom_with_session_arguments[2], Mapping)
        assert isinstance(custom_with_session_arguments[2], Mapping)
        self.assertEqual(len(custom_with_session_arguments[2]), 1)
        self.assertEqual(next(iter(custom_with_session_arguments[2].values())), "target-session-1")

        self.assertEqual(unwrap_response_if_needed({"result": {"type": "object", "value": {"ok": True}}}, "runtime"), {"ok": True})
        self.assertEqual(unwrap_response_if_needed({"product": "Chrome/1"}, None), {"product": "Chrome/1"})

        payload = encode_binding_payload(
            ModCDPBindingPayload(event="Custom.ready", data={"ready": True}, cdpSessionId="session-2")
        )
        self.assertEqual(
            unwrap_event_if_needed(
                "Runtime.bindingCalled",
                {"name": CUSTOM_EVENT_BINDING_NAME, "payload": payload},
                "session-1",
                "session-1",
            ),
            {"event": "Custom.ready", "data": {"ready": True}, "sessionId": "session-2"},
        )
        self.assertIsNone(unwrap_event_if_needed("Runtime.consoleAPICalled", {"name": CUSTOM_EVENT_BINDING_NAME, "payload": payload}))


if __name__ == "__main__":
    unittest.main()
