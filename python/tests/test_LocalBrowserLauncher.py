# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.LocalBrowserLauncher.ts
# - ./go/modcdp/launcher/LocalBrowserLauncher_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

from collections.abc import Mapping
import tempfile
import unittest
from pathlib import Path

from modcdp.launcher.LocalBrowserLauncher import LocalBrowserLauncher
from modcdp.transport.WSUpstreamTransport import WSUpstreamTransport


class LocalBrowserLauncherTests(unittest.TestCase):
    def test_class_helpers_match_the_local_launcher_surface(self) -> None:
        self.assertIsInstance(LocalBrowserLauncher.findChromeBinary(), str)
        self.assertIsInstance(LocalBrowserLauncher.freePort(), int)

    def test_launches_a_real_browser_over_a_chosen_cdp_port_and_explicit_profile_dir(self) -> None:
        with tempfile.TemporaryDirectory(prefix="modcdp-python-local-profile-") as user_data_dir:
            port = LocalBrowserLauncher.freePort()
            chrome = LocalBrowserLauncher(
                {
                    "launcher_local_headless": True,
                    "launcher_local_chrome_ready_timeout_ms": 45_000,
                    "launcher_local_chrome_ready_poll_interval_ms": 50,
                }
            ).launch({"launcher_local_cdp_listen_port": port, "launcher_local_user_data_dir": user_data_dir})
            cdp_url = chrome.cdp_url
            if cdp_url is None:
                raise AssertionError("expected launcher to return cdp_url")
            transport = WSUpstreamTransport({"upstream_ws_cdp_url": cdp_url})
            transport.connect()

            try:
                self.assertEqual(chrome.cdp_listen_port, port)
                self.assertRegex(cdp_url, rf"^ws://127\.0\.0\.1:{port}/")
                self.assertEqual(chrome.profile_dir, user_data_dir)
                expect_cdp_browser_surface(transport)
            finally:
                transport.close()
                chrome.close()

            self.assertTrue(Path(user_data_dir).exists())

    def test_removes_an_explicit_user_data_dir_when_cleanup_user_data_dir_is_set(self) -> None:
        user_data_dir = tempfile.mkdtemp(prefix="modcdp-python-local-profile-")
        chrome = LocalBrowserLauncher(
            {
                "launcher_local_headless": True,
                "launcher_local_chrome_ready_timeout_ms": 45_000,
            }
        ).launch({"launcher_local_user_data_dir": user_data_dir, "launcher_local_cleanup_user_data_dir": True})

        try:
            self.assertEqual(chrome.profile_dir, user_data_dir)
        finally:
            chrome.close()
        self.assertFalse(Path(user_data_dir).exists())


def expect_cdp_browser_surface(transport: WSUpstreamTransport) -> None:
    version = transport.send("Browser.getVersion")
    expect_version_result(version)

    created = transport.send("Target.createTarget", {"url": "about:blank#modcdp-launcher-test"})
    target_id = created.get("targetId")
    if not isinstance(target_id, str):
        raise AssertionError(f"Target.createTarget result = {created!r}")

    try:
        attached = transport.send("Target.attachToTarget", {"targetId": target_id, "flatten": True})
        session_id = attached.get("sessionId")
        if not isinstance(session_id, str):
            raise AssertionError(f"Target.attachToTarget result = {attached!r}")
        transport.send("Runtime.enable", {}, session_id)
        evaluated = transport.send(
            "Runtime.evaluate",
            {"expression": "(() => ({ ok: true, value: 42 }))()", "returnByValue": True},
            session_id,
        )
        result = object_dict(evaluated.get("result"))
        if result.get("type") != "object" or result.get("value") != {"ok": True, "value": 42}:
            raise AssertionError(f"Runtime.evaluate result = {evaluated!r}")
    finally:
        try:
            transport.send("Target.closeTarget", {"targetId": target_id})
        except Exception:
            pass


def expect_version_result(version: Mapping[str, object]) -> None:
    product = version.get("product")
    if not isinstance(product, str) or ("Chrome" not in product and "Chromium" not in product):
        raise AssertionError(f"Browser.getVersion product = {product!r}")
    if not isinstance(version.get("protocolVersion"), str):
        raise AssertionError(f"Browser.getVersion protocolVersion = {version.get('protocolVersion')!r}")


def object_dict(value: object) -> dict[str, object]:
    if not isinstance(value, Mapping):
        raise AssertionError(f"expected object mapping, got {value!r}")
    return {str(key): raw_value for key, raw_value in value.items()}


if __name__ == "__main__":
    unittest.main()
