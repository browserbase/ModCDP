from __future__ import annotations

import unittest
import sys
from pathlib import Path

from modcdp.transport.NativeMessagingUpstreamTransport import NativeMessagingUpstreamTransport, default_native_messaging_manifest_paths


class NativeMessagingUpstreamTransportTests(unittest.TestCase):
    def test_config_owns_host_and_injector_config(self) -> None:
        transport = NativeMessagingUpstreamTransport(
            {
                "upstream_nativemessaging_host_name": "com.modcdp.test",
            }
        )
        self.assertEqual(transport.getInjectorConfig(), {"upstream_nativemessaging_host_name": "com.modcdp.test"})
        self.assertEqual(transport.getServerConfig(), {})
        self.assertEqual(transport.url, "native://com.modcdp.test")
        self.assertEqual(
            default_native_messaging_manifest_paths("com.modcdp.test", "/tmp/modcdp-home"),
            default_manifest_paths_for_platform("com.modcdp.test", "/tmp/modcdp-home"),
        )

    def test_connects_to_native_messaging_stdio_directly(self) -> None:
        transport = NativeMessagingUpstreamTransport()

        try:
            transport.connect()
            transport.waitForPeer()
            transport.close()
        finally:
            transport.close()


def default_manifest_paths_for_platform(upstream_nativemessaging_host_name: str, home: str) -> list[str]:
    if sys.platform == "darwin":
        return [
            f"{home}/Library/Application Support/Google/Chrome/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/Library/Application Support/Google/ChromeForTesting/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/Library/Application Support/Google/Chrome SxS/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/Library/Application Support/Chromium/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
        ]
    if sys.platform.startswith("linux"):
        return [
            f"{home}/.config/google-chrome/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/.config/google-chrome-for-testing/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/.config/chromium/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
            f"{home}/.config/chromium-browser/NativeMessagingHosts/{upstream_nativemessaging_host_name}.json",
        ]
    if sys.platform.startswith("win"):
        return [str(Path(home) / ".modcdp" / "native-messaging" / f"{upstream_nativemessaging_host_name}.json")]
    raise RuntimeError("Native messaging host manifest path discovery is not supported on this platform.")


if __name__ == "__main__":
    unittest.main()
