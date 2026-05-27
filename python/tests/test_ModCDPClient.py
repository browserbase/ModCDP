# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.ModCDPClient.ts
# - ./go/modcdp/client/ModCDPClient_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import glob
import os
import re
import sys
import time
import unittest
from collections.abc import Mapping
from pathlib import Path
from queue import Empty, Queue
from typing import Any

from modcdp import ModCDPClient
from modcdp.launcher.LocalBrowserLauncher import LocalBrowserLauncher
from modcdp.transport.WSUpstreamTransport import WSUpstreamTransport


# MODCDP_TEST_SUPPORT: LANGUAGE-SPECIFIC TEST SUPPORT ONLY.
# Keep setup semantics 1:1 with TS; this only selects a real browser for real --load-extension runs.
def load_extension_test_browser_path() -> str:
    for candidate in (os.environ.get("CHROME_PATH"), "/usr/bin/chromium" if sys.platform.startswith("linux") else None):
        if candidate and Path(candidate).exists():
            return candidate
    home = Path.home()
    if sys.platform == "darwin":
        patterns = [
            str(home / "Library/Caches/ms-playwright/chromium-*/chrome-mac*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
            str(home / "Library/Caches/ms-playwright/chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium"),
            str(home / "Library/Caches/puppeteer/chrome/mac*-*/chrome-mac*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
        ]
    elif sys.platform.startswith("win"):
        local_app_data = Path(os.environ.get("LOCALAPPDATA") or home / "AppData/Local")
        patterns = [
            str(local_app_data / "ms-playwright/chromium-*/chrome-win*/chrome.exe"),
            str(home / ".cache/puppeteer/chrome/win*-*/chrome.exe"),
        ]
    else:
        patterns = [
            str(home / ".cache/ms-playwright/chromium-*/chrome-linux*/chrome"),
            "/opt/pw-browsers/chromium-*/chrome-linux*/chrome",
            str(home / ".cache/puppeteer/chrome/linux-*/chrome-linux*/chrome"),
        ]
    candidates = sorted(
        dict.fromkeys(match for pattern in patterns for match in glob.glob(pattern)),
        key=lambda path: (-max([int(part) for part in re.findall(r"\d+", path)] or [0]), -Path(path).stat().st_mtime, path),
    )
    if candidates:
        return candidates[0]
    raise RuntimeError("No browser found for --load-extension tests. Install Chrome for Testing or set CHROME_PATH.")


HERE = Path(__file__).resolve().parent
EXTENSION_PATH = HERE.parents[1] / "dist" / "extension"
LOAD_EXTENSION_TEST_BROWSER_PATH = load_extension_test_browser_path()


class ModCDPClientTests(unittest.TestCase):
    def test_modcdpclient_uses_flat_owner_prefixed_config(self) -> None:
        cdp = ModCDPClient(
            launcher={
                "launcher_mode": "local",
                "launcher_local_executable_path": "/tmp/chrome",
                "launcher_local_user_data_dir": "/tmp/profile",
                "launcher_local_headless": True,
            },
            upstream={
                "upstream_mode": "ws",
                "upstream_ws_cdp_url": "http://127.0.0.1:9222",
                "upstream_ws_connect_error_settle_timeout_ms": 321,
            },
            injector={
                "injector_mode": "discover",
                "injector_discover_extension_path": "/tmp/ext",
                "injector_service_worker_extension_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "injector_service_worker_url_includes": ["modcdp"],
                "injector_service_worker_url_suffixes": ["/custom/service_worker.js"],
                "injector_trust_service_worker_target": True,
                "injector_require_service_worker_target": True,
                "injector_execution_context_timeout_ms": 4321,
                "injector_service_worker_probe_timeout_ms": 5432,
                "injector_service_worker_ready_timeout_ms": 6543,
                "injector_service_worker_poll_interval_ms": 76,
                "injector_target_session_poll_interval_ms": 87,
            },
            router={"router_routes": {"*.*": "direct_cdp"}, "loopback_execution_context_timeout_ms": 4321},
            client_config={
                "client_hydrate_aliases": False,
                "client_mirror_upstream_events": False,
                "client_cdp_send_timeout_ms": 1234,
                "client_event_wait_timeout_ms": 2345,
                "client_heartbeat_interval_ms": 3456,
            },
            server_config={
                "router": {"router_routes": {"*.*": "loopback_cdp"}},
                "client_config": {"client_cdp_send_timeout_ms": 9876},
                "upstream": {"upstream_ws_connect_error_settle_timeout_ms": 7654},
                "downstream": {"downstream_client_timeout_ms": 4567},
                "server_browser_token": "token-1",
            },
        )

        self.assertEqual(cdp.launcher.config.launcher_local_headless, True)
        self.assertEqual(cdp.launcher.config.launcher_local_executable_path, "/tmp/chrome")
        self.assertEqual(cdp.launcher.config.launcher_local_user_data_dir, "/tmp/profile")
        self.assertEqual(cdp.upstream.config.upstream_ws_connect_error_settle_timeout_ms, 321)
        self.assertIsNotNone(cdp.injector)
        injector = cdp.injector
        assert injector is not None
        self.assertEqual(injector.config.injector_execution_context_timeout_ms, 4321)
        self.assertEqual(injector.config.injector_service_worker_probe_timeout_ms, 5432)
        self.assertEqual(injector.config.injector_service_worker_ready_timeout_ms, 6543)
        self.assertEqual(injector.config.injector_service_worker_poll_interval_ms, 76)
        self.assertEqual(injector.config.injector_target_session_poll_interval_ms, 87)
        router_routes = cdp.router.config.router_routes
        if not isinstance(router_routes, Mapping):
            self.fail("router_routes must be a mapping")
        self.assertEqual(router_routes["*.*"], "direct_cdp")
        self.assertEqual(cdp.config.client_hydrate_aliases, False)
        self.assertEqual(cdp.config.client_mirror_upstream_events, False)
        self.assertEqual(cdp.config.client_cdp_send_timeout_ms, 1234)
        self.assertEqual(cdp.config.client_event_wait_timeout_ms, 2345)
        self.assertEqual(cdp.config.client_heartbeat_interval_ms, 3456)
        self.assertNotIn("Browser", cdp.__dict__)
        with self.assertRaises(AttributeError):
            _ = cdp.Browser
        self.assertNotIn("routes", cdp.__dict__)
        self.assertNotIn("cdp_send_timeout_ms", cdp.__dict__)
        self.assertNotIn("service_worker_probe_timeout_ms", cdp.__dict__)

        params = cdp._server_configure_params()
        router_config = object_map(params.get("router"))
        client_config = object_map(params.get("client_config"))
        upstream_config = object_map(params.get("upstream"))
        self.assertEqual(object_map(router_config.get("router_routes")).get("*.*"), "loopback_cdp")
        self.assertEqual(params.get("server_browser_token"), "token-1")
        self.assertEqual(client_config.get("client_cdp_send_timeout_ms"), 9876)
        self.assertEqual(router_config.get("loopback_execution_context_timeout_ms"), 4321)
        self.assertEqual(upstream_config.get("upstream_ws_connect_error_settle_timeout_ms"), 7654)
        self.assertEqual(object_map(params.get("downstream")).get("downstream_client_timeout_ms"), 4567)

    def test_modcdpclient_preserves_explicit_empty_service_worker_suffix_config(self) -> None:
        cdp = ModCDPClient(injector={"injector_mode": "discover", "injector_service_worker_url_suffixes": []})

        self.assertIsNotNone(cdp.injector)
        injector = cdp.injector
        assert injector is not None
        self.assertEqual(injector.config.injector_service_worker_url_suffixes, [])

    def test_modcdpclient_defaults_service_worker_suffix_config_to_the_modcdp_worker(self) -> None:
        cdp = ModCDPClient(injector={"injector_mode": "discover"})

        self.assertIsNotNone(cdp.injector)
        injector = cdp.injector
        assert injector is not None
        self.assertEqual(injector.config.injector_service_worker_url_suffixes, ["/modcdp/service_worker.js"])

    def test_modcdpclient_preserves_explicit_null_server_config(self) -> None:
        cdp = ModCDPClient(server_config=None)

        self.assertIsNone(cdp.server_config)

    def test_modcdpclient_selects_exactly_one_injector_from_explicit_injector_mode(self) -> None:
        cdp = ModCDPClient(
            launcher={"launcher_mode": "local"},
            injector={"injector_mode": "cli"},
        )

        self.assertEqual(type(cdp.injector).__name__, "CLIExtensionInjector")
        self.assertEqual(
            type(ModCDPClient(launcher={"launcher_mode": "remote"}, injector={"injector_mode": "cdp"}).injector).__name__,
            "CDPExtensionInjector",
        )
        self.assertEqual(
            type(ModCDPClient(launcher={"launcher_mode": "bb"}, injector={"injector_mode": "bb"}).injector).__name__,
            "BBExtensionInjector",
        )
        self.assertEqual(
            type(ModCDPClient(launcher={"launcher_mode": "remote"}, injector={"injector_mode": "discover"}).injector).__name__,
            "DiscoverExtensionInjector",
        )
    def test_modcdpclient_rejects_unknown_component_modes_at_their_owning_factory_boundary(self) -> None:
        with self.assertRaisesRegex(Exception, r"unknown upstream_mode=bogus"):
            ModCDPClient(upstream={"upstream_mode": "bogus"})
        with self.assertRaisesRegex(Exception, r"Input should be"):
            ModCDPClient(launcher={"launcher_mode": "bogus"})
        with self.assertRaisesRegex(Exception, r"Input should be"):
            ModCDPClient(injector={"injector_mode": "bogus"})

    def test_modcdpclient_connects_with_nested_launch_upstream_extension_client_server_config(self) -> None:
        cdp = ModCDPClient(
            launcher={
                "launcher_mode": "local",
                "launcher_local_headless": True,
                "launcher_local_chrome_ready_timeout_ms": 60_000,
                "launcher_local_executable_path": LOAD_EXTENSION_TEST_BROWSER_PATH,
            },
            upstream={"upstream_mode": "ws"},
            injector={
                "injector_mode": "cli",
                "injector_cli_extension_path": str(EXTENSION_PATH),
                "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                "injector_trust_service_worker_target": True,
                "injector_service_worker_probe_timeout_ms": 30_000,
            },
            router={"router_routes": {"Mod.*": "service_worker", "Custom.*": "service_worker", "*.*": "direct_cdp"}},
            client_config={
                "client_hydrate_aliases": True,
                "client_mirror_upstream_events": True,
                "client_cdp_send_timeout_ms": 30_000,
                "client_event_wait_timeout_ms": 30_000,
            },
            server_config={
                "client_config": {"client_cdp_send_timeout_ms": 30_000},
                "router": {
                    "router_routes": {"*.*": "loopback_cdp"},
                    "loopback_execution_context_timeout_ms": 30_000,
                },
                "upstream": {"upstream_ws_connect_error_settle_timeout_ms": 250},
            },
        )

        try:
            cdp.connect()
            self.assertIn(
                cdp.connect_timing.get("injector_source") if cdp.connect_timing else None,
                ("discover", "cli", "cdp"),
            )
            self.assertEqual(cdp.launcher.config.launcher_mode, "local")
            self.assertEqual(cdp.upstream.config.upstream_mode, "ws")
            self.assertIsNotNone(cdp.injector)
            assert cdp.injector is not None
            self.assertEqual(cdp.injector.config.injector_mode, "cli")
            self.assertEqual(cdp.router.config.router_routes["*.*"], "direct_cdp")
            self.assertRegex(cdp.upstream.config.upstream_ws_cdp_url or "", r"^ws://")
            self.assertEqual(cdp.injector.extension_id, "mdedooklbnfejodmnhmkdpkaedafkehf")
            self.assertEqual(
                cdp.Mod.evaluate(expression="chrome.runtime.getURL('modcdp/service_worker.js')"),
                "chrome-extension://mdedooklbnfejodmnhmkdpkaedafkehf/modcdp/service_worker.js",
            )
            self.assertEqual(
                cdp.Mod.evaluate(
                    expression=(
                        "chrome.runtime.getContexts({}).then((contexts) => "
                        "contexts.some((context) => context.contextType === 'OFFSCREEN_DOCUMENT'))"
                    )
                ),
                True,
            )
            version = cdp.Browser.getVersion()
            self.assertRegex(version.product, r"Chrome|Chromium")
            self.assertIsInstance(version.protocolVersion, str)
            runtime_evaluation = cdp.Runtime.evaluate(expression="1 + 1", returnByValue=True)
            self.assertEqual(runtime_evaluation.result["type"], "number")
            self.assertEqual(runtime_evaluation.result["value"], 2)
            with self.assertRaisesRegex(Exception, "expression"):
                cdp.send("Runtime.evaluate", {"returnByValue": True})
            with self.assertRaisesRegex(Exception, "number"):
                cdp.Mod.ping(sent_at="bad")
            self.assertEqual(
                cdp.Mod.addMiddleware(
                    name=cdp.Mod.ping,
                    phase="response",
                    expression="async (payload, next) => next(payload)",
                ),
                {"name": "Mod.ping", "phase": "response", "registered": True},
            )
            with self.assertRaisesRegex(Exception, "Invalid option|after"):
                cdp.Mod.addMiddleware(
                    name="Mod.ping",
                    phase="after",
                    expression="async (payload, next) => next(payload)",
                )
            created_target_id: Queue[str] = Queue()

            def on_target_created(payload: Mapping[str, Any]) -> None:
                target_info = payload["targetInfo"]
                if isinstance(target_info, Mapping) and target_info.get("url") == "about:blank#public-api-target-created":
                    created_target_id.put(str(target_info["targetId"]))

            cdp.on("Target.targetCreated", on_target_created)
            created_via_alias = cdp.Target.createTarget(url="about:blank#public-api-target-created")
            try:
                self.assertEqual(created_target_id.get(timeout=10), created_via_alias.targetId)
            finally:
                cdp.off("Target.targetCreated", on_target_created)
                cdp.Target.closeTarget(targetId=created_via_alias.targetId)
            direct_target = cdp.send("Target.createTarget", {"url": "about:blank#direct-session-routing"})
            direct_session_target_id = str(direct_target["targetId"])
            try:
                direct_session = cdp.send("Target.attachToTarget", {"targetId": direct_session_target_id, "flatten": True})
                direct_eval = cdp.send(
                    "Runtime.evaluate",
                    {"expression": "1 + 1", "returnByValue": True},
                    str(direct_session["sessionId"]),
                )
                self.assertEqual(direct_eval["result"]["value"], 2)
            finally:
                cdp.send("Target.closeTarget", {"targetId": direct_session_target_id})
            sent_at = int(time.time() * 1000)
            pong: Queue[Mapping[str, Any]] = Queue()

            def on_pong(payload: Mapping[str, Any]) -> None:
                if payload.get("sent_at") == sent_at:
                    pong.put(payload)

            muted: Queue[Mapping[str, Any]] = Queue()

            def muted_pong(payload: Mapping[str, Any]) -> None:
                muted.put(payload)

            cdp.on("Mod.pong", muted_pong)
            cdp.off("Mod.pong", muted_pong)
            cdp.on("Mod.pong", on_pong)
            try:
                ping_result = cdp.Mod.ping(sent_at=sent_at)
                pong_payload = pong.get(timeout=30)
            finally:
                cdp.off("Mod.pong", on_pong)
            with self.assertRaises(Empty):
                muted.get(timeout=0.2)
            self.assertEqual(ping_result["ok"], True)
            self.assertEqual(pong_payload["sent_at"], sent_at)
            self.assertIsInstance(pong_payload["received_at"], int | float)
            self.assertEqual(pong_payload["from"], "extension-service-worker")

            cdp.Mod.ping(sent_at=sent_at + 1)
            with self.assertRaises(Empty):
                pong.get(timeout=0.2)
        finally:
            cdp.close()

    def test_modcdpclient_close_does_not_close_a_remote_browser_it_did_not_launch(self) -> None:
        chrome = LocalBrowserLauncher(
            {
                "launcher_local_headless": True,
                "launcher_local_chrome_ready_timeout_ms": 60_000,
                # This test manually supplies --load-extension, so it intentionally uses
                # the launch-flag browser path instead of relying on the client fallback.
                "launcher_local_executable_path": LOAD_EXTENSION_TEST_BROWSER_PATH,
                "launcher_local_extra_args": [f"--load-extension={EXTENSION_PATH}"],
            }
        ).launch()
        cdp_url = chrome.cdp_url
        if not isinstance(cdp_url, str):
            self.fail(f"cdp_url = {cdp_url!r}")
        transport = WSUpstreamTransport({"upstream_ws_cdp_url": cdp_url})
        transport.connect()
        cdp = ModCDPClient(
            launcher={"launcher_mode": "remote", "launcher_remote_cdp_url": chrome.cdp_url},
            upstream={"upstream_mode": "ws", "upstream_ws_cdp_url": chrome.cdp_url},
            injector={
                "injector_mode": "discover",
                "injector_discover_extension_path": str(EXTENSION_PATH),
                "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                "injector_trust_service_worker_target": True,
                "injector_service_worker_ready_timeout_ms": 30_000,
                "injector_service_worker_probe_timeout_ms": 30_000,
            },
            router={"router_routes": {"*.*": "direct_cdp"}},
        )

        try:
            cdp.connect()
            cdp.close()
            time.sleep(0.5)
            response = transport.send("Browser.getVersion")
            product = response.get("product")
            if not isinstance(product, str):
                self.fail(f"Browser.getVersion product = {product!r}")
            self.assertRegex(product, r"Chrome|Chromium")
        finally:
            transport.close()
            cdp.close()
            chrome.close()

    def test_modcdpclient_close_keeps_injector_files_until_after_launched_browser_shutdown(self) -> None:
        cdp = ModCDPClient(
            launcher={
                "launcher_mode": "local",
                "launcher_local_headless": True,
                "launcher_local_executable_path": LOAD_EXTENSION_TEST_BROWSER_PATH,
            },
            upstream={"upstream_mode": "ws"},
            injector={
                "injector_mode": "cli",
                "injector_cli_extension_path": str(EXTENSION_PATH),
                "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                "injector_trust_service_worker_target": True,
            },
            server_config={"router": {"router_routes": {"*.*": "loopback_cdp"}}},
        )

        try:
            cdp.connect()
            self.assertIsNotNone(cdp.injector)
            injector = cdp.injector
            assert injector is not None
            unpacked_extension_path = getattr(injector, "unpacked_extension_path")
            self.assertIsInstance(unpacked_extension_path, str)
            self.assertNotEqual(unpacked_extension_path, str(EXTENSION_PATH))

            launched = cdp.launcher.launched
            if launched is None:
                self.fail("expected launched browser")
            original_close = launched.close
            browser_close_saw_extension = False

            def close_browser() -> None:
                nonlocal browser_close_saw_extension
                browser_close_saw_extension = Path(unpacked_extension_path).exists()
                original_close()

            launched.close = close_browser

            cdp.close()

            self.assertTrue(browser_close_saw_extension)
            self.assertFalse(Path(unpacked_extension_path).exists())
        finally:
            cdp.close()

        self.assertIsNone(cdp.launcher.launched)

    def test_modcdpclient_close_clears_top_level_connection_state(self) -> None:
        cdp = ModCDPClient(
            launcher={
                "launcher_mode": "local",
                "launcher_local_headless": True,
                "launcher_local_executable_path": LOAD_EXTENSION_TEST_BROWSER_PATH,
            },
            upstream={"upstream_mode": "ws"},
            injector={
                "injector_mode": "cli",
                "injector_cli_extension_path": str(EXTENSION_PATH),
                "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                "injector_trust_service_worker_target": True,
            },
        )

        cdp.connect()
        self.assertIsNotNone(cdp.launcher.launched)
        cdp.close()

        self.assertIsNone(cdp.launcher.launched)

    def test_modcdpclient_event_dispatch_snapshots_handlers_when_once_removes_itself(self) -> None:
        client = ModCDPClient()
        seen: Queue[str] = Queue()

        def persistent(_payload: Mapping[str, Any]) -> None:
            seen.put("persistent")

        client.once("Target.targetCreated", lambda _payload: seen.put("once"))
        client.on("Target.targetCreated", persistent)
        client._on_recv(
            {
                "method": "Target.targetCreated",
                "params": {
                    "targetInfo": {
                        "targetId": "target-1",
                        "type": "page",
                        "title": "about:blank",
                        "url": "about:blank",
                        "attached": False,
                        "canAccessOpener": False,
                    }
                },
            }
        )
        self.assertEqual([seen.get(timeout=1), seen.get(timeout=1)], ["once", "persistent"])

        client._on_recv(
            {
                "method": "Target.targetCreated",
                "params": {
                    "targetInfo": {
                        "targetId": "target-2",
                        "type": "page",
                        "title": "about:blank",
                        "url": "about:blank",
                        "attached": False,
                        "canAccessOpener": False,
                    }
                },
            }
        )
        self.assertEqual(seen.get(timeout=1), "persistent")
        with self.assertRaises(Empty):
            seen.get(timeout=0.1)

    def test_modcdpclient_validates_native_command_params_before_sending(self) -> None:
        client = ModCDPClient()

        with self.assertRaisesRegex(Exception, "expression"):
            client.send("Runtime.evaluate", {})

    def test_modcdpclient_validates_native_and_registered_custom_events_before_dispatch(self) -> None:
        client = ModCDPClient()

        with self.assertRaisesRegex(Exception, "targetInfo"):
            client._on_recv({"method": "Target.targetCreated", "params": {}})

        client.Mod.addCustomEvent(
            "Custom.ready",
            event_schema={
                "type": "object",
                "properties": {"ok": {"type": "boolean"}},
                "required": ["ok"],
                "additionalProperties": False,
            },
        )
        with self.assertRaisesRegex(Exception, "boolean"):
            client._on_recv({"method": "Custom.ready", "params": {"ok": "yes"}})

    def test_modcdpclient_dispatches_root_events_before_extension_session_is_attached(self) -> None:
        client = ModCDPClient()
        seen: Queue[str] = Queue()

        client.on("Target.targetCreated", lambda payload: seen.put(str(payload["targetInfo"]["targetId"])))
        client._on_recv(
            {
                "method": "Target.targetCreated",
                "params": {
                    "targetInfo": {
                        "targetId": "target-1",
                        "type": "page",
                        "title": "about:blank",
                        "url": "about:blank",
                        "attached": False,
                        "canAccessOpener": False,
                    }
                },
            }
        )
        self.assertEqual(seen.get(timeout=1), "target-1")

    def test_modcdpclient_uses_no_injector_unless_injector_mode_is_explicit(self) -> None:
        launched = ModCDPClient(launcher={"launcher_mode": "local"}, upstream={"upstream_mode": "ws"})
        self.assertEqual(launched.launcher.config.launcher_mode, "local")
        self.assertIsNone(launched.injector)

        attach_only = ModCDPClient(upstream={"upstream_mode": "ws"})
        self.assertEqual(attach_only.launcher.config.launcher_mode, "none")
        self.assertIsNone(attach_only.injector)


def object_map(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise AssertionError(f"expected object mapping, got {value!r}")
    return {str(key): raw_value for key, raw_value in value.items()}


if __name__ == "__main__":
    unittest.main()
