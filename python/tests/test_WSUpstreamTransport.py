# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.WSUpstreamTransport.ts
# - ./go/modcdp/transport/WSUpstreamTransport_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest
import threading
import time
from collections.abc import Mapping
from queue import Queue

from modcdp.launcher.LocalBrowserLauncher import LocalBrowserLauncher
from modcdp.types.modcdp import LaunchedBrowser
from modcdp.transport.WSUpstreamTransport import WSUpstreamTransport


def _close_chrome(chrome: LaunchedBrowser) -> None:
    chrome.close()


class WSUpstreamTransportTests(unittest.TestCase):
    def test_ws_upstream_constructor_update_server_config_and_unconnected_errors_match_the_transport_surface(self) -> None:
        transport = WSUpstreamTransport()
        self.assertEqual(transport.url, "")
        self.assertIs(transport.update({"upstream_ws_cdp_url": "ws://127.0.0.1:1/devtools/browser/test"}), transport)
        self.assertEqual(transport.url, "ws://127.0.0.1:1/devtools/browser/test")
        unconfigured = WSUpstreamTransport()
        with self.assertRaisesRegex(RuntimeError, "WSUpstreamTransport requires"):
            unconfigured.connect()
        with self.assertRaisesRegex(RuntimeError, "CDP websocket is not connected"):
            unconfigured.send({"id": 1, "method": "Browser.getVersion"})
        state = transport.toJSON()["state"]
        if not isinstance(state, dict):
            raise AssertionError(f"state = {state!r}")
        connected = None
        for key, value in state.items():
            if key == "connected":
                connected = value
        self.assertIs(connected, False)

    def test_ws_upstream_launches_a_real_browser_and_speaks_raw_cdp(self) -> None:
        chrome = LocalBrowserLauncher({"launcher_local_headless": True}).launch()
        transport = WSUpstreamTransport({"upstream_ws_cdp_url": chrome.cdp_url})
        received: Queue[dict] = Queue()
        transport.onRecv(lambda message: received.put(message))
        try:
            transport.connect()
            self.assertRegex(transport.url or "", r"^ws://")
            transport.send({"id": 1, "method": "Browser.getVersion", "params": {}})
            response = received.get(timeout=5)
            self.assertEqual(response["id"], 1)
            self.assertIsInstance(response["result"]["product"], str)
        finally:
            transport.close()
            chrome.close()

    def test_ws_upstream_resolves_a_bare_host_port_cdp_endpoint_to_the_browser_websocket(self) -> None:
        port = LocalBrowserLauncher.freePort()
        chrome = LocalBrowserLauncher({"launcher_local_cdp_listen_port": port, "launcher_local_headless": True}).launch()
        transport = WSUpstreamTransport({"upstream_ws_cdp_url": f"127.0.0.1:{port}"})
        received: Queue[dict] = Queue()
        transport.onRecv(lambda message: received.put(message))
        try:
            transport.connect()
            self.assertEqual(transport.url, chrome["cdp_url"])
            transport.send({"id": 1, "method": "Browser.getVersion", "params": {}})
            response = received.get(timeout=5)
            self.assertEqual(response["id"], 1)
            self.assertIsInstance(response["result"]["product"], str)
        finally:
            transport.close()
            chrome.close()

    def test_ws_upstream_close_clears_connection_state(self) -> None:
        chrome = LocalBrowserLauncher({"launcher_local_headless": True}).launch()
        transport = WSUpstreamTransport({"upstream_ws_cdp_url": chrome.cdp_url})

        try:
            transport.connect()
            self.assertIsNotNone(transport.ws)
            state = transport.toJSON()["state"]
            if not isinstance(state, dict):
                raise AssertionError(f"state = {state!r}")
            connected = None
            for key, value in state.items():
                if key == "connected":
                    connected = value
            self.assertIs(connected, True)
            transport.close()
            self.assertIsNone(transport.ws)
            state = transport.toJSON()["state"]
            if not isinstance(state, dict):
                raise AssertionError(f"state = {state!r}")
            connected = None
            for key, value in state.items():
                if key == "connected":
                    connected = value
            self.assertIs(connected, False)
            with self.assertRaisesRegex(RuntimeError, "CDP websocket is not connected"):
                transport.send({"id": 1, "method": "Browser.getVersion"})
        finally:
            transport.close()
            chrome.close()

    def test_ws_upstream_close_rejects_pending_commands(self) -> None:
        chrome = LocalBrowserLauncher({"launcher_local_headless": True}).launch()
        transport = WSUpstreamTransport({"upstream_ws_cdp_url": chrome.cdp_url, "upstream_cdp_send_timeout_ms": 60_000})
        result: Queue[object] = Queue()

        try:
            transport.connect()
            target_id = transport.createTarget("about:blank#modcdp-pending-close")
            session_id = transport.attachToTarget(target_id)
            if not isinstance(session_id, str):
                raise AssertionError(f"session_id = {session_id!r}")

            def send_pending() -> None:
                try:
                    result.put(
                        transport.send(
                            "Runtime.evaluate",
                            {"expression": "new Promise(() => {})", "awaitPromise": True},
                            session_id,
                        )
                    )
                except BaseException as error:
                    result.put(error)

            thread = threading.Thread(target=send_pending, daemon=True)
            thread.start()
            deadline = time.time() + 5
            while time.time() < deadline:
                state = object_map(transport.toJSON().get("state"))
                pending = state.get("pending")
                if pending == 1:
                    break
                time.sleep(0.05)
            else:
                raise AssertionError("pending Runtime.evaluate was not recorded")

            transport.close()
            error = result.get(timeout=5)
            self.assertIsInstance(error, RuntimeError)
            self.assertIn("CDP websocket closed", str(error))
            thread.join(timeout=1)
        finally:
            transport.close()
            _close_chrome(chrome)


def object_map(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise AssertionError(f"expected object mapping, got {value!r}")
    return {str(key): raw_value for key, raw_value in value.items()}


if __name__ == "__main__":
    unittest.main()
