# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.ModCDPClient.ts
# - ./go/modcdp/client/ModCDPClient_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import asyncio
import json
import time
import unittest
from collections.abc import Mapping
from pathlib import Path
from queue import Empty, Queue
from typing import Any, cast

from websocket import create_connection

from modcdp import ModCDPClient
from modcdp.launcher.LocalBrowserLauncher import LocalBrowserLauncher

HERE = Path(__file__).resolve().parent
EXTENSION_PATH = HERE.parents[1] / "dist" / "extension"


class ModCDPClientTests(unittest.TestCase):
    def test_constructor_normalizes_nested_config_owners(self) -> None:
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
                "server_browser_token": "token-1",
                "client_config": {"client_cdp_send_timeout_ms": 9876},
                "upstream": {"upstream_ws_connect_error_settle_timeout_ms": 7654},
                "downstream": {"downstream_client_timeout_ms": 4567},
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
        router_config = params.get("router")
        client_config = params.get("client_config")
        upstream_config = params.get("upstream")
        downstream_config = params.get("downstream")
        self.assertIsInstance(router_config, dict)
        self.assertIsInstance(client_config, dict)
        self.assertIsInstance(upstream_config, dict)
        self.assertIsInstance(downstream_config, dict)
        assert isinstance(router_config, dict)
        assert isinstance(client_config, dict)
        assert isinstance(upstream_config, dict)
        assert isinstance(downstream_config, dict)
        self.assertEqual(router_config.get("router_routes", {}).get("*.*"), "loopback_cdp")
        self.assertEqual(params.get("server_browser_token"), "token-1")
        self.assertEqual(client_config.get("client_cdp_send_timeout_ms"), 9876)
        self.assertEqual(router_config.get("loopback_execution_context_timeout_ms"), 4321)
        self.assertEqual(upstream_config.get("upstream_ws_connect_error_settle_timeout_ms"), 7654)
        self.assertEqual(downstream_config.get("downstream_client_timeout_ms"), 4567)

    def test_preserves_explicit_empty_service_worker_suffix_config(self) -> None:
        cdp = ModCDPClient(injector={"injector_mode": "borrow", "injector_service_worker_url_suffixes": []})

        self.assertIsNotNone(cdp.injector)
        injector = cdp.injector
        assert injector is not None
        self.assertEqual(injector.config.injector_service_worker_url_suffixes, [])

    def test_defaults_service_worker_suffix_config_to_modcdp_worker(self) -> None:
        cdp = ModCDPClient(injector={"injector_mode": "discover"})

        self.assertIsNotNone(cdp.injector)
        injector = cdp.injector
        assert injector is not None
        self.assertEqual(injector.config.injector_service_worker_url_suffixes, ["/modcdp/service_worker.js"])

    def test_preserves_explicit_none_server_config(self) -> None:
        cdp = ModCDPClient(server_config=None)

        self.assertIsNone(cdp.server_config)

    def test_selects_exactly_one_injector_from_explicit_injector_mode(self) -> None:
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
        self.assertEqual(
            type(ModCDPClient(launcher={"launcher_mode": "remote"}, injector={"injector_mode": "borrow"}).injector).__name__,
            "BorrowExtensionInjector",
        )

    def test_rejects_unknown_component_modes_at_their_owning_factory_boundary(self) -> None:
        with self.assertRaisesRegex(Exception, r"unknown upstream\.upstream_mode=bogus"):
            ModCDPClient(upstream={"upstream_mode": "bogus"})
        with self.assertRaisesRegex(Exception, r"Input should be"):
            ModCDPClient(launcher={"launcher_mode": "bogus"})
        with self.assertRaisesRegex(Exception, r"Input should be"):
            ModCDPClient(injector={"injector_mode": "bogus"})

    def test_connects_with_cli_injector_chain(self) -> None:
        cdp = ModCDPClient(
            launcher={"launcher_mode": "local", "launcher_local_headless": True, "launcher_local_chrome_ready_timeout_ms": 60_000},
            upstream={"upstream_mode": "ws"},
            injector={
                "injector_mode": "cli",
                "injector_cli_extension_path": str(EXTENSION_PATH),
                "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                "injector_trust_service_worker_target": True,
                "injector_service_worker_probe_timeout_ms": 30_000,
            },
            client_config={
                "client_cdp_send_timeout_ms": 30_000,
                "client_event_wait_timeout_ms": 30_000,
            },
        )

        try:
            cdp.connect()
            self.assertIn(
                cdp.connect_timing.get("injector_source") if cdp.connect_timing else None,
                ("discover", "cli", "cdp", "borrow"),
            )
            self.assertEqual(cdp.extension_id, "mdedooklbnfejodmnhmkdpkaedafkehf")
            self.assertEqual(
                cdp.Mod.evaluate(expression="chrome.runtime.getURL('modcdp/service_worker.js')"),
                "chrome-extension://mdedooklbnfejodmnhmkdpkaedafkehf/modcdp/service_worker.js",
            )
            contexts = cdp.Mod.evaluate(
                expression=(
                    "chrome.runtime.getContexts({}).then((contexts) => contexts.map((context) => "
                    "({ type: context.contextType, url: context.documentUrl || context.origin || '' })))"
                )
            )
            self.assertTrue(
                any(
                    isinstance(context, Mapping)
                    and context.get("type") == "OFFSCREEN_DOCUMENT"
                    and context.get("url") == "chrome-extension://mdedooklbnfejodmnhmkdpkaedafkehf/offscreen/keepalive.html"
                    for context in cast(list[Any], contexts)
                )
            )
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

    def test_close_does_not_close_a_remote_browser_it_did_not_launch(self) -> None:
        chrome = LocalBrowserLauncher(
            {
                "launcher_local_headless": True,
                "launcher_local_chrome_ready_timeout_ms": 60_000,
                # This test manually supplies --load-extension, so it intentionally uses
                # the launch-flag browser path instead of relying on the client fallback.
                "launcher_local_executable_path": LocalBrowserLauncher.findChromeBinary(),
                "launcher_local_extra_args": [f"--load-extension={EXTENSION_PATH}"],
            }
        ).launch()
        raw_ws = create_connection(cast(str, chrome["cdp_url"]), timeout=5)
        cdp = ModCDPClient(
            launcher={"launcher_mode": "remote", "launcher_remote_cdp_url": chrome["cdp_url"]},
            upstream={"upstream_mode": "ws", "upstream_ws_cdp_url": chrome["cdp_url"]},
            injector={
                "injector_mode": "cli",
                "injector_cli_extension_path": str(EXTENSION_PATH),
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
            raw_ws.send(json.dumps({"id": 1, "method": "Browser.getVersion", "params": {}}))
            response = json.loads(raw_ws.recv())
            self.assertEqual(response["id"], 1)
            self.assertRegex(response["result"]["product"], r"Chrome|Chromium")
        finally:
            raw_ws.close()
            cdp.close()
            chrome["close"]()

    def test_close_keeps_injector_files_until_after_launched_browser_shutdown(self) -> None:
        cdp = ModCDPClient(
            launcher={
                "launcher_mode": "local",
                "launcher_local_headless": True,
                "launcher_local_executable_path": LocalBrowserLauncher.findChromeBinary(),
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
            original_close = launched["close"]
            browser_close_saw_extension = False

            def close_browser() -> None:
                nonlocal browser_close_saw_extension
                browser_close_saw_extension = Path(unpacked_extension_path).exists()
                original_close()

            launched["close"] = close_browser

            cdp.close()

            self.assertTrue(browser_close_saw_extension)
            self.assertFalse(Path(unpacked_extension_path).exists())
        finally:
            cdp.close()

        self.assertIsNone(cdp.launcher.launched)

    def test_close_clears_top_level_connection_state(self) -> None:
        cdp = ModCDPClient(
            launcher={"launcher_mode": "local", "launcher_local_headless": True},
            upstream={"upstream_mode": "ws"},
            injector={
                "injector_mode": "cli",
                "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                "injector_trust_service_worker_target": True,
            },
        )

        cdp.connect()
        self.assertIsNotNone(cdp.launcher.launched)
        cdp.close()

        self.assertIsNone(cdp.launcher.launched)

    def test_generated_cdp_surface_exposes_direct_domain_commands(self) -> None:
        client = ModCDPClient(
            launcher={"launcher_mode": "local", "launcher_local_headless": True},
            upstream={"upstream_mode": "ws"},
            injector={
                "injector_mode": "cli",
                "injector_cli_extension_path": str(EXTENSION_PATH),
                "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                "injector_trust_service_worker_target": True,
            },
            router={"router_routes": {"Mod.*": "service_worker", "Custom.*": "service_worker", "*.*": "direct_cdp"}},
            server_config={"router": {"router_routes": {"*.*": "loopback_cdp"}}},
        )
        target_ids: list[str] = []

        client.connect()
        try:
            result = client.Target.createTarget(url="https://example.com")
            raw_result = client.send("Target.createTarget", {"url": "https://example.org"})
            target_ids.append(str(result.targetId))
            target_ids.append(str(raw_result["targetId"]))

            self.assertRegex(str(result.targetId), r"^[A-F0-9]+$")
            self.assertRegex(str(raw_result["targetId"]), r"^[A-F0-9]+$")
            attached = client.Target.attachToTarget(targetId=result.targetId, flatten=True)
            evaluated = client.Runtime.evaluate(expression="1 + 1", returnByValue=True, session_id=str(attached.sessionId))
            self.assertEqual(evaluated.result["value"], 2)
            self.assertIsNotNone(client.last_command_timing)
            timing = cast(Mapping[str, Any], client.last_command_timing)
            self.assertEqual(timing["target"], "direct_cdp")
            raw_version = cast(Mapping[str, Any], client.send("Browser.getVersion"))
            self.assertIn("product", raw_version)
            self.assertIsNotNone(client.last_command_timing)
            timing = cast(Mapping[str, Any], client.last_command_timing)
            self.assertEqual(timing["target"], "direct_cdp")
        finally:
            for target_id in target_ids:
                try:
                    client.Target.closeTarget(targetId=target_id)
                except Exception:
                    pass
            client.close()

        with self.assertRaises(Exception):
            client.Target._CreateTargetParams.model_validate({"url": "https://example.com", "unknown": True})

        async def run_awaited_calls() -> None:
            awaited_result = await client.Target.createTarget(url="https://example.com")
            target_ids.append(str(awaited_result.targetId))
            self.assertRegex(str(awaited_result.targetId), r"^[A-F0-9]+$")
            awaited_raw_result = await client.send("Target.createTarget", {"url": "https://example.net"})
            target_ids.append(str(awaited_raw_result["targetId"]))
            self.assertRegex(str(awaited_raw_result["targetId"]), r"^[A-F0-9]+$")

        client = ModCDPClient(
            launcher={"launcher_mode": "local", "launcher_local_headless": True},
            upstream={"upstream_mode": "ws"},
            injector={
                "injector_mode": "cli",
                "injector_cli_extension_path": str(EXTENSION_PATH),
                "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                "injector_trust_service_worker_target": True,
            },
            router={"router_routes": {"Mod.*": "service_worker", "Custom.*": "service_worker", "*.*": "direct_cdp"}},
            server_config={"router": {"router_routes": {"*.*": "loopback_cdp"}}},
        )
        target_ids = []
        client.connect()
        try:
            asyncio.run(run_awaited_calls())
        finally:
            for target_id in target_ids:
                try:
                    client.Target.closeTarget(targetId=target_id)
                except Exception:
                    pass
            client.close()

    def test_generated_event_surface_supports_awaited_on_and_async_callbacks(self) -> None:
        client = ModCDPClient()
        seen: list[str] = []

        async def callback(event: Any) -> None:
            seen.append(event.targetId)

        async def register() -> None:
            await client.on(client.Target.targetCreated, callback)

        asyncio.run(register())
        client._run_handler(
            client._handlers["Target.targetCreated"][0],
            {"targetInfo": {"targetId": "target-1", "type": "page", "url": "https://example.com"}},
            "Target.targetCreated",
        )
        self.assertEqual(seen, ["target-1"])

    def test_event_dispatch_snapshots_handlers_when_once_removes_itself(self) -> None:
        client = ModCDPClient()
        client.ext_session_id = "ext-session"
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

    def test_validates_native_command_params_before_sending(self) -> None:
        client = ModCDPClient()

        with self.assertRaisesRegex(Exception, "expression"):
            client.send("Runtime.evaluate", {})

    def test_validates_native_and_registered_custom_events_before_dispatch(self) -> None:
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

    def test_root_events_dispatch_before_extension_session_is_attached(self) -> None:
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

    def test_uses_no_injector_unless_injector_mode_is_explicit(self) -> None:
        launched = ModCDPClient(launcher={"launcher_mode": "local"}, upstream={"upstream_mode": "ws"})
        self.assertEqual(launched.launcher.config.launcher_mode, "local")
        self.assertIsNone(launched.injector)

        attach_only = ModCDPClient(upstream={"upstream_mode": "ws"})
        self.assertEqual(attach_only.launcher.config.launcher_mode, "none")
        self.assertIsNone(attach_only.injector)


if __name__ == "__main__":
    unittest.main()
