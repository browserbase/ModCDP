from __future__ import annotations

import unittest

from modcdp.transport.NativeMessagingUpstreamTransport import NativeMessagingUpstreamTransport


class NativeMessagingUpstreamTransportTests(unittest.TestCase):
    def test_connects_to_native_messaging_stdio_directly(self) -> None:
        transport = NativeMessagingUpstreamTransport()
        self.assertEqual(transport.getInjectorConfig(), {"upstream_nativemessaging_host_name": "com.modcdp.bridge"})
        self.assertEqual(transport.getServerConfig(), {})

        try:
            transport.connect()
            transport.waitForPeer()
            transport.close()
        finally:
            transport.close()


if __name__ == "__main__":
    unittest.main()
