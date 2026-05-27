# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.WSUpstreamTransport.ts
# - ./go/modcdp/transport/WSUpstreamTransport_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest
from queue import Queue

from modcdp.launcher.LocalBrowserLauncher import LocalBrowserLauncher
from modcdp.transport.WSUpstreamTransport import WSUpstreamTransport


class WSUpstreamTransportTests(unittest.TestCase):
    def test_constructor_update_and_server_config_match_ts_shape(self) -> None:
        transport = WSUpstreamTransport()
        self.assertEqual(transport.url, "")
        self.assertIs(transport.update({"upstream_ws_cdp_url": "ws://127.0.0.1:1/devtools/browser/test"}), transport)
        self.assertEqual(transport.url, "ws://127.0.0.1:1/devtools/browser/test")
        unconfigured = WSUpstreamTransport()
        with self.assertRaisesRegex(RuntimeError, "WSUpstreamTransport requires"):
            unconfigured.connect()
        with self.assertRaisesRegex(RuntimeError, "CDP websocket is not connected"):
            unconfigured.send({"id": 1, "method": "Browser.getVersion"})

    def test_launches_real_browser_and_speaks_raw_cdp(self) -> None:
        chrome = LocalBrowserLauncher({"launcher_local_headless": True}).launch()
        transport = WSUpstreamTransport({"upstream_ws_cdp_url": chrome["cdp_url"]})
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
            chrome["close"]()

    def test_resolves_real_host_port_cdp_endpoint_to_browser_websocket(self) -> None:
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
            chrome["close"]()

    def test_close_clears_connection_state(self) -> None:
        chrome = LocalBrowserLauncher({"launcher_local_headless": True}).launch()
        transport = WSUpstreamTransport({"upstream_ws_cdp_url": chrome["cdp_url"]})

        try:
            transport.connect()
            self.assertIsNotNone(transport.ws)
            transport.close()
            self.assertIsNone(transport.ws)
            with self.assertRaisesRegex(RuntimeError, "CDP websocket is not connected"):
                transport.send({"id": 1, "method": "Browser.getVersion"})
        finally:
            transport.close()
            chrome["close"]()


if __name__ == "__main__":
    unittest.main()
