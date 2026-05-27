"""Python demo for ModCDPClient. Mirrors js/examples/demo.js.

Modes (mirror the JS / Go demos):
    --live        Use the running Google Chrome enabled via chrome://inspect.
    --direct      *.* -> direct_cdp on the client.
    --loopback    *.* -> service_worker on the client; *.* -> loopback_cdp on
                  the server. Default.
    --debugger    *.* -> service_worker on the client; *.* -> chromedebugger
                  on the server.
    --upstream    ws. Defaults to ws.
"""

import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modcdp import ModCDPClient
from modcdp.types import ProtocolPayload
from modcdp.types.modcdp import _isObjectMap

ROOT = Path(__file__).resolve().parent.parent.parent
EXTENSION_PATH = ROOT / "dist" / "extension"
DEMO_CDP_SEND_TIMEOUT_MS = 60_000
DEMO_EXECUTION_CONTEXT_TIMEOUT_MS = 60_000
LIVE_DEVTOOLS_ACTIVE_PORTS = [
    Path.home() / "Library" / "Application Support" / "Google" / "Chrome" / "DevToolsActivePort",
    Path.home() / "Library" / "Application Support" / "Google" / "Chrome Beta" / "DevToolsActivePort",
] if sys.platform == "darwin" else [
    Path.home() / ".config" / "google-chrome" / "DevToolsActivePort",
    Path.home() / ".config" / "chromium" / "DevToolsActivePort",
]


def expect_object(value: object, label: str) -> ProtocolPayload:
    if not _isObjectMap(value):
        raise RuntimeError(f"{label} returned non-object value: {value!r}")
    return value


def server_router_routes_for(mode: str, upstream_mode: str) -> ProtocolPayload:
    del upstream_mode
    route = "loopback_cdp" if mode == "loopback" else "chromedebugger" if mode == "debugger" else "auto"
    return {
        "Mod.*": "service_worker",
        "Custom.*": "service_worker",
        "*.*": route,
    }


def client_routes_for(mode: str) -> ProtocolPayload:
    routes: ProtocolPayload = {
        "Mod.*": "service_worker",
        "Custom.*": "service_worker",
        "*.*": "direct_cdp" if mode == "direct" else "service_worker",
    }
    routes["Runtime.*"] = "service_worker"
    return routes


UPSTREAM_MODES = {"ws"}


def parse_args(argv):
    flags = {a[2:] for a in argv if a.startswith("--")}
    upstream_mode = "ws"
    for index, arg in enumerate(argv):
        if arg == "--upstream" and index + 1 < len(argv):
            upstream_mode = argv[index + 1]
            break
        if arg.startswith("--upstream="):
            upstream_mode = arg.split("=", 1)[1]
            break
    else:
        for candidate in UPSTREAM_MODES:
            if candidate in flags:
                upstream_mode = candidate
                break
    if upstream_mode not in UPSTREAM_MODES:
        raise RuntimeError(f"unknown --upstream={upstream_mode}; expected {'|'.join(sorted(UPSTREAM_MODES))}")
    live = "live" in flags
    mode = "debugger" if "debugger" in flags else "direct" if "direct" in flags else "loopback" if "loopback" in flags else "direct" if live else "loopback"
    return mode, live, upstream_mode


def client_config_for(mode, upstream_mode, cdp_url, launcher_config=None):
    upstream: ProtocolPayload = {"upstream_mode": upstream_mode, "upstream_ws_cdp_url": cdp_url}
    injector: ProtocolPayload = {
        "injector_mode": "discover" if cdp_url else "cli",
        "injector_execution_context_timeout_ms": DEMO_EXECUTION_CONTEXT_TIMEOUT_MS,
    }
    if cdp_url:
        injector["injector_discover_extension_path"] = str(EXTENSION_PATH)
    else:
        injector["injector_cli_extension_path"] = str(EXTENSION_PATH)
    if mode == "direct":
        return {
            "launcher": {"launcher_mode": "remote" if cdp_url else "local", **(launcher_config or {}), **({"launcher_remote_cdp_url": cdp_url} if cdp_url else {})},
            "upstream": upstream,
            "injector": injector,
            "router": {"router_routes": client_routes_for(mode)},
            "client_config": {"client_cdp_send_timeout_ms": DEMO_CDP_SEND_TIMEOUT_MS},
        }
    server_config = {
        "router": {"router_routes": server_router_routes_for(mode, upstream_mode), "loopback_execution_context_timeout_ms": DEMO_EXECUTION_CONTEXT_TIMEOUT_MS},
    }
    return {
        "launcher": {"launcher_mode": "remote" if cdp_url else "local", **(launcher_config or {}), **({"launcher_remote_cdp_url": cdp_url} if cdp_url else {})},
        "upstream": upstream,
        "injector": injector,
        "router": {"router_routes": client_routes_for(mode)},
        "client_config": {"client_cdp_send_timeout_ms": DEMO_CDP_SEND_TIMEOUT_MS},
        "server_config": server_config,
    }


def wait_for_live_cdp_url():
    started_at = time.time()
    opener = ["open", "chrome://inspect/#remote-debugging"] if sys.platform == "darwin" else ["xdg-open", "chrome://inspect/#remote-debugging"]
    subprocess.Popen(opener, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("opened chrome://inspect/#remote-debugging")
    print("waiting for Chrome to expose DevToolsActivePort; click Allow when Chrome asks.")
    while True:
        for path in LIVE_DEVTOOLS_ACTIVE_PORTS:
            try:
                if path.stat().st_mtime < started_at - 1:
                    continue
                lines = [line.strip() for line in path.read_text().splitlines() if line.strip()]
                if len(lines) >= 2:
                    return f"ws://127.0.0.1:{lines[0]}{lines[1]}"
            except Exception:
                pass
        time.sleep(0.25)


def main():
    mode, live, upstream_mode = parse_args(sys.argv[1:])
    print(f"== mode: {'live/' if live else ''}{mode}; upstream: {upstream_mode} ==")

    cdp = None
    try:
        if live:
            cdp_url = wait_for_live_cdp_url()
            launcher_config: dict[str, object] = {}
        else:
            cdp_url = None
            launcher_config: dict[str, object] = {
                "launcher_local_chrome_ready_timeout_ms": 60_000,
                "launcher_local_headless": sys.platform.startswith("linux") and not os.environ.get("DISPLAY"),
                "launcher_local_sandbox": not sys.platform.startswith("linux"),
            }
            if os.environ.get("CHROME_PATH"):
                launcher_config["launcher_local_executable_path"] = os.environ["CHROME_PATH"]

        cdp = ModCDPClient(**client_config_for(mode, upstream_mode, cdp_url, launcher_config))

        cdp.connect()
        print(f"upstream cdp: {cdp.cdp_url}")
        print(
            f"connected; ext {cdp.injector.extension_id if cdp.injector else None} "
            f"session {cdp.injector.session_id if cdp.injector else None}"
        )
        print(f"connect timing    -> {cdp.connect_timing}")

        configure_params: ProtocolPayload = {
            "router": {
                "router_routes": server_router_routes_for(mode, upstream_mode),
                "loopback_execution_context_timeout_ms": DEMO_EXECUTION_CONTEXT_TIMEOUT_MS,
            },
        }
        configure_result = expect_object(cdp.send("Mod.configure", configure_params), "Mod.configure")
        if expect_object(expect_object(configure_result.get("router"), "Mod.configure.router").get("router_routes"), "Mod.configure.router.router_routes").get("*.*") != server_router_routes_for(mode, upstream_mode)["*.*"]:
            raise RuntimeError(f"unexpected Mod.configure result {configure_result}")
        print(f"Mod.configure    -> {expect_object(configure_result.get('router'), 'Mod.configure.router').get('router_routes')}")

        pong_events = []
        pong_lock = threading.Lock()
        ping_sent_at = int(time.time() * 1000)

        def on_pong(payload, *_):
            with pong_lock:
                pong_events.append(payload)

        cdp.on("Mod.pong", on_pong)
        ping_result = expect_object(cdp.send("Mod.ping", {"sent_at": ping_sent_at}), "Mod.ping")
        deadline = time.monotonic() + 3.0
        while True:
            with pong_lock:
                pong = next((event for event in pong_events if event.get("sent_at") == ping_sent_at), None)
            if pong or time.monotonic() >= deadline:
                break
            time.sleep(0.02)
        if ping_result.get("ok") is not True or not pong or pong.get("from") != "extension-service-worker":
            raise RuntimeError(f"unexpected Mod.ping/Mod.pong result ping={ping_result} pong={pong}")
        ping_returned_at = int(time.time() * 1000)
        print(f"Mod.ping/pong    -> {ping_result} {pong}")
        pong_received_at = pong.get("received_at") if pong else None
        ping_latency = {
            "round_trip_ms": ping_returned_at - ping_sent_at,
            "service_worker_ms": pong_received_at - ping_sent_at if isinstance(pong_received_at, int | float) else None,
            "return_path_ms": ping_returned_at - pong_received_at if isinstance(pong_received_at, int | float) else None,
        }
        print(f"ping latency      -> {ping_latency}")

        modcdp_eval = expect_object(cdp.send("Mod.evaluate", {"expression": "({ extension_id: chrome.runtime.id })"}), "Mod.evaluate")
        injector_extension_id = cdp.injector.extension_id if cdp.injector else None
        if not isinstance(modcdp_eval.get("extension_id"), str) or (injector_extension_id and modcdp_eval.get("extension_id") != injector_extension_id):
            raise RuntimeError(f"unexpected Mod.evaluate result {modcdp_eval}")
        print(f"Mod.evaluate     -> {modcdp_eval}")

        topology_checked = False
        if mode != "direct":
            topology = expect_object(cdp.Mod.getTopology(), "Mod.getTopology")
            root_frame_id = topology.get("rootFrameId")
            frames = expect_object(topology.get("frames"), "Mod.getTopology.frames")
            roots = expect_object(topology.get("roots"), "Mod.getTopology.roots")
            contexts = expect_object(topology.get("contexts"), "Mod.getTopology.contexts")
            if (
                not isinstance(root_frame_id, str)
                or root_frame_id not in frames
                or not any(_isObjectMap(root) and root.get("kind") == "document" for root in roots.values())
                or not any(_isObjectMap(context) and context.get("world") == "piercer" for context in contexts.values())
            ):
                raise RuntimeError(f"unexpected Mod.getTopology result {topology}")
            topology_checked = True
            print(f"Mod.getTopology -> {{'rootFrameId': {root_frame_id!r}, 'frames': {len(frames)}, 'roots': {len(roots)}, 'contexts': {len(contexts)}}}")

        response_middleware_registration = expect_object(cdp.send("Mod.addMiddleware", {
            "name": "Custom.echo",
            "phase": "response",
            "expression": '''async (payload, next) => next({ ...payload, responseMiddleware: "ok" })''',
        }), "Mod.addMiddleware response")
        if response_middleware_registration.get("registered") is not True or response_middleware_registration.get("phase") != "response":
            raise RuntimeError(f"unexpected response middleware registration {response_middleware_registration}")

        event_middleware_registration = expect_object(cdp.send("Mod.addMiddleware", {
            "name": "Custom.demoEvent",
            "phase": "event",
            "expression": '''async (payload, next) => next({ ...payload, eventMiddleware: "ok" })''',
        }), "Mod.addMiddleware event")
        if event_middleware_registration.get("registered") is not True or event_middleware_registration.get("phase") != "event":
            raise RuntimeError(f"unexpected event middleware registration {event_middleware_registration}")

        echo_registration = expect_object(cdp.send("Mod.addCustomCommand", {
            "name": "Custom.echo",
            "expression": "async (params, method) => ({ echoed: params.value, method })",
        }), "Mod.addCustomCommand Custom.echo")
        if echo_registration.get("registered") is not True or echo_registration.get("name") != "Custom.echo":
            raise RuntimeError(f"unexpected Custom.echo registration {echo_registration}")
        echo_result = expect_object(cdp.send("Custom.echo", {"value": "custom-command-ok"}), "Custom.echo")
        if (
            echo_result.get("echoed") != "custom-command-ok"
            or echo_result.get("method") != "Custom.echo"
            or echo_result.get("responseMiddleware") != "ok"
        ):
            raise RuntimeError(f"unexpected Custom.echo result {echo_result}")
        print(f"Custom.echo      -> {echo_result}")

        demo_events = []
        demo_lock = threading.Lock()

        def on_demo_event(payload, *_):
            with demo_lock:
                demo_events.append(payload)

        demo_event_registration = expect_object(cdp.send("Mod.addCustomEvent", {"name": "Custom.demoEvent"}), "Mod.addCustomEvent Custom.demoEvent")
        if demo_event_registration.get("registered") is not True or demo_event_registration.get("name") != "Custom.demoEvent":
            raise RuntimeError(f"unexpected Custom.demoEvent registration {demo_event_registration}")
        cdp.on("Custom.demoEvent", on_demo_event)
        emit_expression = (
            """async () => {
                await globalThis.__ModCDP_custom_event__(JSON.stringify({
                  event: "Custom.demoEvent",
                  data: { value: "custom-event-ok" },
                  cdpSessionId: null,
                }));
                return { emitted: true };
              }"""
            if mode == "direct"
            else """async () => {
                const params = await ModCDP.runMiddleware("event", "Custom.demoEvent", { value: "custom-event-ok" }, {
                  cdpSessionId,
                  event: {
                    method: "Custom.demoEvent",
                    params: { value: "custom-event-ok" },
                  },
                });
                const sent = downstream.sendEvent({
                  method: "Custom.demoEvent",
                  params,
                });
                return { emitted: sent > 0 };
              }"""
        )
        emit_result = expect_object(cdp.send("Mod.evaluate", {"expression": emit_expression}), "Custom.demoEvent emit")
        if emit_result.get("emitted") is not True:
            raise RuntimeError(f"unexpected Custom.demoEvent emit result {emit_result}")
        deadline = time.monotonic() + 3.0
        while True:
            with demo_lock:
                demo_event = next(
                    (
                        event
                        for event in demo_events
                        if event.get("value") == "custom-event-ok" and (mode == "direct" or event.get("eventMiddleware") == "ok")
                    ),
                    None,
                )
            if demo_event or time.monotonic() >= deadline:
                break
            time.sleep(0.02)
        if not demo_event:
            raise RuntimeError("expected Custom.demoEvent")
        print(f"Custom.demoEvent -> {demo_event}")

        runtime_eval = expect_object(cdp.send("Runtime.evaluate", {"expression": "(() => 42)()", "returnByValue": True}), "Runtime.evaluate")
        result = expect_object(runtime_eval.get("result"), "Runtime.evaluate.result")
        if result.get("value") != 42:
            raise RuntimeError(f"unexpected Runtime.evaluate result {runtime_eval}")
        print(f"Runtime.evaluate -> {runtime_eval}")

        topology_label = "topology, " if topology_checked else ""
        print(f"\nSUCCESS ({mode}/{upstream_mode}): native command, {topology_label}custom commands, custom event, and middleware all passed")

        # TTY-only: drop into a REPL where you can send live commands and
        # watch events as they print. Skip when run non-interactively so the
        # demo stays CI-friendly.
        if sys.stdin.isatty():
            cdp.on("Mod.pong", lambda e: print(f"\n[event] Mod.pong {e}"))
            run_repl(cdp, mode)

        return 0
    finally:
        if cdp is not None:
            try: cdp.close()
            except Exception: pass


def run_repl(cdp, mode):
    import re
    print(f"\nBrowser remains running. Mode: {mode}.")
    print("Enter commands as Domain.method({...JSON params...}). Examples:")
    print('  Browser.getVersion({})')
    print('  Mod.evaluate({"expression": "chrome.tabs.query({active: true})"})')
    print('  Runtime.evaluate({"expression": "document.title", "returnByValue": true})')
    print("Type exit or quit to disconnect (browser keeps running).")
    cmd_re = re.compile(r"^([A-Za-z_]\w*\.[A-Za-z_]\w*)(?:\((.*)\))?$")
    while True:
        try:
            line = input("ModCDP> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not line: continue
        if line in ("exit", "quit"): break
        try:
            m = cmd_re.match(line)
            if not m:
                raise ValueError("format: Domain.method({...JSON...})")
            method = m.group(1)
            raw = (m.group(2) or "").strip()
            params = json.loads(raw) if raw else {}
            result = cdp.send(method, params)
            print(json.dumps(result, indent=2))
        except Exception as e:
            print(f"error: {e}")


if __name__ == "__main__":
    sys.exit(main())
