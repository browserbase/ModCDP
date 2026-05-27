# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.translate.ts
# - ./go/modcdp/translate/translate_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest
import json
from typing import cast

from modcdp.translate import (
    CUSTOM_EVENT_BINDING_NAME,
    route_for,
    unwrap_event_if_needed,
    unwrap_response_if_needed,
    wrap_command_if_needed,
)


class TranslateTests(unittest.TestCase):
    def test_routes_wraps_and_unwraps_modcdp_protocol_messages_deterministically(self) -> None:
        self.assertEqual(route_for("Browser.getVersion", {"Browser.*": "direct_cdp", "*.*": "service_worker"}), "direct_cdp")
        self.assertEqual(route_for("Target.getTargets", {"Browser.*": "direct_cdp", "*.*": "service_worker"}), "service_worker")

        direct = wrap_command_if_needed("Browser.getVersion", {}, routes={"*.*": "direct_cdp"})
        self.assertEqual(direct["target"], "direct_cdp")
        self.assertEqual(direct["steps"], [{"method": "Browser.getVersion", "params": {}}])

        wrapped = wrap_command_if_needed(
            "Mod.evaluate",
            {"expression": "({ ok: true })", "params": {"value": 1}},
            cdp_session_id="session-1",
        )
        self.assertEqual(wrapped["target"], "service_worker")
        self.assertEqual(wrapped["steps"][0]["method"], "Runtime.callFunctionOn")
        wrapped_step_params = wrapped["steps"][0].get("params", {})
        self.assertIn("globalThis.ModCDP.handleCommand", str(wrapped_step_params.get("functionDeclaration")))
        wrapped_arguments = cast("list[dict[str, object]]", wrapped_step_params.get("arguments", []))
        self.assertEqual(json.loads(str(wrapped_arguments[1].get("value"))), {"expression": "({ ok: true })", "params": {"value": 1}})
        self.assertEqual(wrapped_arguments[2].get("value"), "session-1")
        self.assertEqual(wrapped["steps"][0].get("unwrap"), "runtime_json")

        configured = wrap_command_if_needed(
            "Mod.configure",
            {"router": {"router_routes": {"*.*": "loopback_cdp"}}},
            cdp_session_id="session-1",
        )
        self.assertEqual(configured["steps"][0].get("unwrap"), "runtime_json")

        ping = wrap_command_if_needed("Mod.ping", {})
        ping_arguments = cast("list[dict[str, object]]", ping["steps"][0].get("params", {}).get("arguments", []))
        self.assertEqual(json.loads(str(ping_arguments[1].get("value"))), {})

        custom = wrap_command_if_needed(
            "Custom.echo",
            {"secret": "x" * 100, "nested": {"ok": True}},
            cdp_session_id="session-1",
        )
        custom_step_params = custom["steps"][0].get("params", {})
        self.assertIn("JSON.parse(paramsJson)", str(custom_step_params.get("functionDeclaration")))
        self.assertNotIn("xxxxxxxxxx", str(custom_step_params.get("functionDeclaration")))
        custom_arguments = cast("list[dict[str, object]]", custom_step_params.get("arguments", []))
        self.assertEqual(custom_arguments[0].get("value"), "Custom.echo")
        self.assertEqual(json.loads(str(custom_arguments[1].get("value"))), {"secret": "x" * 100, "nested": {"ok": True}})
        self.assertEqual(custom_arguments[2].get("value"), "session-1")

        custom_with_session = wrap_command_if_needed(
            "Custom.echo",
            {"secret": "targeted"},
            cdp_session_id="target-session-1",
        )
        custom_with_session_arguments = cast("list[dict[str, object]]", custom_with_session["steps"][0].get("params", {}).get("arguments", []))
        self.assertEqual(custom_with_session_arguments[2].get("value"), "target-session-1")

        self.assertEqual(unwrap_response_if_needed({"result": {"type": "object", "value": {"ok": True}}}, "runtime"), {"ok": True})
        self.assertEqual(unwrap_response_if_needed({"product": "Chrome/1"}, None), {"product": "Chrome/1"})

        payload = json.dumps(
            {"event": "Custom.ready", "data": {"ready": True}, "cdpSessionId": "session-2"},
            separators=(",", ":"),
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
