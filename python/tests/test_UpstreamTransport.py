# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.UpstreamTransport.ts
# - ./go/modcdp/transport/UpstreamTransport_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest

from modcdp.transport.UpstreamTransport import UpstreamTransport
from modcdp.types.generated.cdp import RuntimeDomain, TargetDomain


class TestTransport(UpstreamTransport):
    upstream_mode = "ws"

    def emit(self, value: str) -> None:
        self._parse_and_emit_recv(value)


class UpstreamTransportTests(unittest.TestCase):
    def test_owns_shared_transport_config_and_recv_callbacks(self) -> None:
        transport = UpstreamTransport()
        received = []
        stop = transport.onRecv(lambda message: received.append(message))

        self.assertIs(transport.update(), transport)

        parsed = []
        test_transport = TestTransport()
        test_transport.onRecv(lambda message: parsed.append(message))
        test_transport.emit('{"id":1,"result":{"ok":true}}')
        test_transport.emit('{"id":2,"result":true}')
        test_transport.emit('{"id":3,"result":0}')
        test_transport.emit('{"method":"Runtime.executionContextCreated","params":{}}')
        self.assertEqual(
            parsed,
            [
                {"id": 1, "result": {"ok": True}},
                {"id": 2, "result": True},
                {"id": 3, "result": 0},
                {"method": "Runtime.executionContextCreated", "params": {}},
            ],
        )

        typed_events = []
        test_transport.on(TargetDomain.targetCreated, lambda event, _target_id, _session_id: typed_events.append(event))
        test_transport.emit(
            '{"method":"Target.targetCreated","params":{"targetInfo":{"targetId":"target-1","type":"page","title":"Example","url":"https://example.com","attached":false,"canAccessOpener":false}}}'
        )
        self.assertEqual(typed_events[0]["targetInfo"]["targetId"], "target-1")
        with self.assertRaises(ValueError):
            test_transport.on(RuntimeDomain.executionContextDestroyed, lambda _event, _target_id, _session_id: None)
            test_transport.emit('{"method":"Runtime.executionContextDestroyed","params":{"executionContextId":1}}')

        stop()
        self.assertEqual(received, [])
        with self.assertRaisesRegex(NotImplementedError, "UpstreamTransport.connect is not implemented"):
            transport.connect()
        with self.assertRaisesRegex(NotImplementedError, "UpstreamTransport.send is not implemented"):
            transport.send({"id": 1, "method": "Browser.getVersion", "params": {}})


if __name__ == "__main__":
    unittest.main()
