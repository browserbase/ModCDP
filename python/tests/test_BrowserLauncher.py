from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from modcdp.launcher.BrowserLauncher import BrowserLauncher, resolveCdpWebSocketUrl


class BrowserLauncherTests(unittest.TestCase):
    def test_merges_launch_config_and_exposes_transport_and_injector_config(self) -> None:
        launcher = BrowserLauncher(
            {
                "launcher_remote_cdp_url": "ws://127.0.0.1:9222/devtools/browser/initial",
                "launcher_local_user_data_dir": "/tmp/modcdp-browser-launcher",
                "launcher_bb_api_key": "test-key",
                "launcher_bb_extension_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "launcher_local_args": ["--load-extension=/tmp/args-one"],
                "launcher_local_extra_args": ["--load-extension=/tmp/one"],
            }
        )
        launcher.update(
            {
                "launcher_remote_cdp_url": "ws://127.0.0.1:9222/devtools/browser/updated",
                "launcher_local_args": ["--load-extension=/tmp/args-two", "--lang=en-US"],
                "launcher_local_extra_args": ["--load-extension=/tmp/two", "--window-size=900,700"],
            }
        )

        self.assertEqual(
            launcher.options.get("launcher_local_args"),
            ["--lang=en-US", "--load-extension=/tmp/args-one,/tmp/args-two"],
        )
        self.assertEqual(
            launcher.options.get("launcher_local_extra_args"),
            ["--window-size=900,700", "--load-extension=/tmp/one,/tmp/two"],
        )
        self.assertEqual(
            {
                "upstream_ws_cdp_url": launcher.configForUpstream()["upstream_ws_cdp_url"],
            },
            {
                "upstream_ws_cdp_url": "ws://127.0.0.1:9222/devtools/browser/updated",
            },
        )
        self.assertEqual(
            {
                "injector_bb_api_key": launcher.configForInjector()["injector_bb_api_key"],
                "injector_service_worker_extension_id": launcher.configForInjector()["injector_service_worker_extension_id"],
            },
            {
                "injector_bb_api_key": "test-key",
                "injector_service_worker_extension_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            },
        )
        with self.assertRaisesRegex(NotImplementedError, "BrowserLauncher.launch is not implemented"):
            launcher.launch()

    def test_resolve_cdp_websocket_url_accepts_host_http_https_ws_and_wss_shapes(self) -> None:
        self.assertEqual(
            resolveCdpWebSocketUrl("ws://127.0.0.1:9222/devtools/browser/one"),
            "ws://127.0.0.1:9222/devtools/browser/one",
        )
        self.assertEqual(
            resolveCdpWebSocketUrl("wss://example.test/devtools/browser/two"),
            "wss://example.test/devtools/browser/two",
        )

        class FakeResponse:
            def __init__(self, cdp_url: str) -> None:
                self.cdp_url = cdp_url

            def __enter__(self) -> "FakeResponse":
                return self

            def __exit__(self, *_args: object) -> None:
                return None

            def read(self) -> bytes:
                return json.dumps({"webSocketDebuggerUrl": self.cdp_url}).encode()

        with patch("urllib.request.urlopen", return_value=FakeResponse("ws://127.0.0.1:9222/devtools/browser/three")) as urlopen:
            self.assertEqual(resolveCdpWebSocketUrl("127.0.0.1:9222"), "ws://127.0.0.1:9222/devtools/browser/three")
            urlopen.assert_called_once_with("http://127.0.0.1:9222/json/version", timeout=10)

        with patch("urllib.request.urlopen", return_value=FakeResponse("wss://example.test/devtools/browser/four")) as urlopen:
            self.assertEqual(resolveCdpWebSocketUrl("https://example.test"), "wss://example.test/devtools/browser/four")
            urlopen.assert_called_once_with("https://example.test/json/version", timeout=10)


if __name__ == "__main__":
    unittest.main()
