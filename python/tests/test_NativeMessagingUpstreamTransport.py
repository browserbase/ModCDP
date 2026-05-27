from __future__ import annotations

import unittest

from modcdp.transport.NativeMessagingUpstreamTransport import NativeMessagingUpstreamTransport


class NativeMessagingUpstreamTransportTests(unittest.TestCase):
    def test_connects_to_nativemessaging_stdio_directly(self) -> None:
        transport = NativeMessagingUpstreamTransport()
        self.assertEqual(transport.configForInjector(), {"upstream_nativemessaging_host_name": "com.modcdp.bridge"})
        self.assertEqual(transport.configForServer(), {})

        try:
            transport.connect()
            transport.waitForPeer()
            transport.close()
        finally:
            transport.close()


if __name__ == "__main__":
    unittest.main()
