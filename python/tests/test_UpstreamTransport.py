# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.UpstreamTransport.ts
# - ./go/modcdp/transport/UpstreamTransport_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest

from modcdp.transport.UpstreamTransport import UpstreamTransport


class TestTransport(UpstreamTransport):
    upstream_mode = "ws"

    def emit(self, value: str) -> None:
        self._parse_and_emit_recv(value)


class UpstreamTransportTests(unittest.TestCase):
    def test_shared_transport_config_and_recv_callbacks(self) -> None:
        transport = UpstreamTransport()
        received = []
        stop = transport.onRecv(lambda message: received.append(message))

        self.assertIs(transport.update(), transport)
        self.assertEqual(transport.configForLauncher(), {})
        self.assertEqual(transport.configForInjector(), {})
        self.assertEqual(transport.configForServer(), {})
        self.assertIsNone(transport.close())

        parsed = []
        test_transport = TestTransport()
        test_transport.onRecv(lambda message: parsed.append(message))
        test_transport.emit('{"id":1,"result":{"ok":true}}')
        test_transport.emit('{"method":"Runtime.executionContextCreated","params":{}}')
        self.assertEqual(
            parsed,
            [
                {"id": 1, "result": {"ok": True}},
                {"method": "Runtime.executionContextCreated", "params": {}},
            ],
        )

        stop()
        stop()
        self.assertEqual(received, [])
        close_errors = []
        stop_close = transport.onClose(lambda error: close_errors.append(error))
        stop_close()
        stop_close()
        transport._emit_close(RuntimeError("closed"))
        self.assertEqual(close_errors, [])
        with self.assertRaisesRegex(NotImplementedError, "UpstreamTransport.connect is not implemented"):
            transport.connect()
        with self.assertRaisesRegex(NotImplementedError, "UpstreamTransport.send is not implemented"):
            transport.send({"id": 1, "method": "Browser.getVersion", "params": {}})


if __name__ == "__main__":
    unittest.main()
