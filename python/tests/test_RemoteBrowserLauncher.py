# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.RemoteBrowserLauncher.ts
# - ./go/modcdp/launcher/RemoteBrowserLauncher_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import unittest

from modcdp.launcher.LocalBrowserLauncher import LocalBrowserLauncher
from modcdp.launcher.RemoteBrowserLauncher import RemoteBrowserLauncher
from modcdp.transport.WSUpstreamTransport import WSUpstreamTransport


class RemoteBrowserLauncherTests(unittest.TestCase):
    def test_requires_launcher_remote_cdp_url(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "launcher_mode=remote requires launcher_remote_cdp_url"):
            RemoteBrowserLauncher().launch()

    def test_connects_to_a_real_browser_from_both_http_discovery_and_websocket_cdp_endpoints(self) -> None:
        port = LocalBrowserLauncher.freePort()
        local = LocalBrowserLauncher().launch(
            {"launcher_local_cdp_listen_port": port, "launcher_local_headless": True, "launcher_local_chrome_ready_timeout_ms": 45_000}
        )
        transport = None
        try:
            from_http = RemoteBrowserLauncher({"launcher_remote_cdp_url": f"http://127.0.0.1:{port}"}).launch()
            self.assertEqual(from_http.cdp_url, local.cdp_url)
            from_http_cdp_url = from_http.cdp_url
            if not isinstance(from_http_cdp_url, str):
                self.fail(f"cdp_url = {from_http_cdp_url!r}")
            transport = WSUpstreamTransport({"upstream_ws_cdp_url": from_http_cdp_url})
            transport.connect()
            expect_cdp_browser_surface(transport)
            from_http.close()

            from_host_port = RemoteBrowserLauncher({"launcher_remote_cdp_url": f"127.0.0.1:{port}"}).launch()
            self.assertEqual(from_host_port.cdp_url, local.cdp_url)
            from_host_port.close()

            from_config = RemoteBrowserLauncher({"launcher_remote_cdp_url": local.cdp_url}).launch()
            self.assertEqual(from_config.cdp_url, local.cdp_url)
            from_config.close()

            from_ws = RemoteBrowserLauncher().launch({"launcher_remote_cdp_url": local.cdp_url})
            self.assertEqual(from_ws.cdp_url, local.cdp_url)
            expect_cdp_browser_surface(transport)
            from_ws.close()
        finally:
            if transport is not None:
                transport.close()
            local.close()

    def test_lets_launch_config_override_constructor_cdp_url(self) -> None:
        first = LocalBrowserLauncher().launch(
            {"launcher_local_cdp_listen_port": LocalBrowserLauncher.freePort(), "launcher_local_headless": True}
        )
        second = LocalBrowserLauncher().launch(
            {"launcher_local_cdp_listen_port": LocalBrowserLauncher.freePort(), "launcher_local_headless": True}
        )

        try:
            second_cdp_listen_port = second.cdp_listen_port
            if not isinstance(second_cdp_listen_port, int):
                raise AssertionError(f"second cdp_listen_port = {second_cdp_listen_port!r}")
            launched = RemoteBrowserLauncher({"launcher_remote_cdp_url": first.cdp_url}).launch(
                {"launcher_remote_cdp_url": f"127.0.0.1:{second_cdp_listen_port}"}
            )
            self.assertEqual(launched.cdp_url, second.cdp_url)
            launched.close()
        finally:
            first.close()
            second.close()


# MODCDP_TEST_SUPPORT: LANGUAGE-SPECIFIC TEST SUPPORT ONLY.
# Keep the setup semantics above 1:1 with translated tests; helpers here only send real CDP messages to real browser endpoints.
def expect_cdp_browser_surface(transport: WSUpstreamTransport) -> None:
    result = transport.send("Browser.getVersion")
    product = result.get("product")
    if not isinstance(product, str) or ("Chrome" not in product and "Chromium" not in product):
        raise AssertionError(f"Browser.getVersion result = {result!r}")


if __name__ == "__main__":
    unittest.main()
