# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/client/ModCDPClient.ts
# - ./go/modcdp/client/ModCDPClient.go
"""ModCDPClient (Python): importable, no CLI, no demo code.

Constructor config groups mirror the JS / Go ports:
    launcher          browser/session creation and cleanup
    upstream          message transport to raw CDP or a ModCDP server
    injector          raw-CDP extension discovery/injection/borrowing
    server_config    ModCDPServer.configure params
    client            client routing and client-owned send/event timings

Public methods: connect(), send(method, params), on(event, handler), close().
Synchronous (blocking) API; upstream transports own their read loops.
"""

import asyncio
import inspect
import threading
import time
from collections.abc import Mapping
from queue import Queue, Empty
from typing import Any, cast

from pydantic import BaseModel, ConfigDict
from ..router.AutoSessionRouter import AutoSessionRouter, RouterConfig
from ..types.generated.cdp import AwaitableDict, CDPEvent, CDPModel, CDPParams, CDPSurfaceMixin, cdp_event_name, install_cdp_surface
from ..types.CDPTypes import CDPTypes
from ..launcher.BBBrowserLauncher import BBBrowserLauncher
from ..injector.BBExtensionInjector import BBExtensionInjector
from ..injector.BorrowExtensionInjector import BorrowExtensionInjector
from ..injector.DiscoverExtensionInjector import DiscoverExtensionInjector
from ..injector.ExtensionInjector import ExtensionInjector, InjectorConfig
from ..injector.CDPExtensionInjector import CDPExtensionInjector
from ..injector.CLIExtensionInjector import CLIExtensionInjector
from ..launcher.LocalBrowserLauncher import LocalBrowserLauncher
from ..launcher.NoneBrowserLauncher import NoneBrowserLauncher
from ..launcher.RemoteBrowserLauncher import RemoteBrowserLauncher
from ..transport.UpstreamTransport import UpstreamMode, UpstreamTransport, UpstreamTransportConfig
from ..transport.WSUpstreamTransport import WSUpstreamTransport
from ..translate.translate import (
    CUSTOM_EVENT_BINDING_NAME,
    UPSTREAM_EVENT_BINDING_NAME,
    wrap_command_if_needed,
    unwrap_event_if_needed,
    unwrap_response_if_needed,
)
from ..launcher.BrowserLauncher import LauncherConfig
from ..types.modcdp import (
    ModCDPCommandTiming,
    ModCDPConnectTiming,
    ModCDPPingLatency,
    ModCDPServerConfig,
    CdpMessage,
    ExtensionInfo,
    Handler,
    JsonValue,
    ProtocolParams,
    ProtocolPayload,
    ProtocolResult,
)
from ..types.toJSON import modCDPToJSON


def _defaulted(value: Any, fallback: Any) -> Any:
    return fallback if value is None else value


class AwaitableValue:
    def __init__(self, value: Any) -> None:
        self.value = value

    def __await__(self):
        async def _value():
            return self.value

        return _value().__await__()

    def __bool__(self) -> bool:
        return bool(self.value)

    def __getattr__(self, name: str) -> Any:
        return getattr(self.value, name)

    def __getitem__(self, key: Any) -> Any:
        return self.value[key]

    def __eq__(self, other: object) -> bool:
        return self.value == other

    def __repr__(self) -> str:
        return repr(self.value)

    def __str__(self) -> str:
        return str(self.value)


class _ModDomain:
    def __init__(self, client: "ModCDPClient") -> None:
        self._client = client

    def evaluate(
        self,
        *,
        expression: str,
        params: Mapping[str, Any] | None = None,
        cdpSessionId: str | None = None,
    ) -> AwaitableDict | AwaitableValue:
        payload: dict[str, Any] = {"expression": expression}
        if params is not None:
            payload["params"] = dict(params)
        if cdpSessionId is not None:
            payload["cdpSessionId"] = cdpSessionId
        return self._client._send_command("Mod.evaluate", payload)

    def addCustomCommand(
        self,
        name: str,
        *,
        params_schema: Any | None = None,
        result_schema: Any | None = None,
        expression: str | None = None,
    ) -> AwaitableDict | AwaitableValue:
        payload: dict[str, Any] = {"name": name}
        if params_schema is not None:
            payload["params_schema"] = params_schema
        if result_schema is not None:
            payload["result_schema"] = result_schema
        if expression is not None:
            payload["expression"] = expression
        return self._client._send_command("Mod.addCustomCommand", payload)

    def addCustomEvent(self, name: str, *, event_schema: Any | None = None) -> AwaitableDict | AwaitableValue:
        payload: dict[str, Any] = {"name": name}
        if event_schema is not None:
            payload["event_schema"] = event_schema
        return self._client._send_command("Mod.addCustomEvent", payload)

    def addMiddleware(
        self,
        *,
        phase: str,
        expression: str,
        name: str | None = None,
    ) -> AwaitableDict | AwaitableValue:
        payload: dict[str, Any] = {"phase": phase, "expression": expression}
        if name is not None:
            payload["name"] = name
        return self._client._send_command("Mod.addMiddleware", payload)

    def configure(self, **params: Any) -> AwaitableDict | AwaitableValue:
        return self._client._send_command("Mod.configure", params)

    def ping(self, **params: Any) -> AwaitableDict | AwaitableValue:
        return self._client._send_command("Mod.ping", params)

    def getTopology(self, **params: Any) -> AwaitableDict | AwaitableValue:
        return self._client._send_command("Mod.getTopology", params)

MODCDP_READY_EXPRESSION = (
    "Boolean(globalThis.ModCDP?.handleCommand && globalThis.ModCDP?.addCustomEvent)"
)
DEFAULT_SERVER = object()
DEFAULT_CDP_SEND_TIMEOUT_MS = 10_000
DEFAULT_EVENT_WAIT_TIMEOUT_MS = 10_000
DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS = 10_000
DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS = 60_000
DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS = 100
DEFAULT_TARGET_SESSION_POLL_INTERVAL_MS = 20
DEFAULT_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS = 250
DEFAULT_CLIENT_HEARTBEAT_INTERVAL_MS = 250


class ClientConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True)

    client_hydrate_aliases: bool = True
    client_mirror_upstream_events: bool = True
    client_cdp_send_timeout_ms: int = DEFAULT_CDP_SEND_TIMEOUT_MS
    client_event_wait_timeout_ms: int = DEFAULT_EVENT_WAIT_TIMEOUT_MS
    client_heartbeat_interval_ms: int = DEFAULT_CLIENT_HEARTBEAT_INTERVAL_MS


class ModCDPClient(CDPSurfaceMixin):
    def __init__(
        self,
        launcher: Mapping[str, Any] | None = None,
        upstream: Mapping[str, Any] | None = None,
        injector: Mapping[str, Any] | None = None,
        router: Mapping[str, Any] | None = None,
        client_config: Mapping[str, Any] | None = None,
        server_config: Mapping[str, JsonValue] | None | object = DEFAULT_SERVER,
        types: CDPTypes | Mapping[str, Any] | None = None,
    ) -> None:
        launcher_input = dict(launcher or {})
        upstream_input = dict(upstream or {})
        injector_input = dict(injector or {})
        router_input = dict(router or {})
        client_config_input = dict(client_config or {})
        upstream_mode_input = upstream_input.get("upstream_mode") or "ws"
        if upstream_mode_input != "ws":
            raise RuntimeError(f"unknown upstream.upstream_mode={upstream_mode_input}")
        upstream_mode: UpstreamMode = upstream_mode_input
        upstream_config = UpstreamTransportConfig.model_validate({**upstream_input, "upstream_mode": upstream_mode})
        launcher_mode = launcher_input.get("launcher_mode") or "none"
        launcher_config = LauncherConfig.model_validate({**launcher_input, "launcher_mode": launcher_mode})
        injector_config = InjectorConfig.model_validate(injector_input)
        parsed_router_config = RouterConfig.model_validate(router_input)
        parsed_client_config = ClientConfig.model_validate(client_config_input)
        if server_config is DEFAULT_SERVER:
            parsed_server_config: ModCDPServerConfig | None = {}
        elif server_config is None:
            parsed_server_config = None
        elif isinstance(server_config, Mapping):
            parsed_server_config = cast(ModCDPServerConfig, dict(server_config))
        else:
            raise TypeError("server_config must be a mapping, None, or omitted")
        self.config = parsed_client_config
        self.server_config = parsed_server_config
        if launcher_config.launcher_mode == "local":
            self.launcher = LocalBrowserLauncher(launcher_config)
        elif launcher_config.launcher_mode == "remote":
            self.launcher = RemoteBrowserLauncher(launcher_config)
        elif launcher_config.launcher_mode == "bb":
            self.launcher = BBBrowserLauncher(launcher_config)
        elif launcher_config.launcher_mode == "none":
            self.launcher = NoneBrowserLauncher(launcher_config)
        else:
            raise RuntimeError(f"unknown launcher.launcher_mode={launcher_config.launcher_mode}")
        self.upstream = WSUpstreamTransport(upstream_config)
        if injector_config.injector_mode == "none":
            self.injector: ExtensionInjector | None = None
        elif injector_config.injector_mode == "cli":
            self.injector = CLIExtensionInjector(injector_config)
        elif injector_config.injector_mode == "cdp":
            self.injector = CDPExtensionInjector(injector_config)
        elif injector_config.injector_mode == "bb":
            self.injector = BBExtensionInjector(injector_config)
        elif injector_config.injector_mode == "discover":
            self.injector = DiscoverExtensionInjector(injector_config)
        elif injector_config.injector_mode == "borrow":
            self.injector = BorrowExtensionInjector(injector_config)
        else:
            raise RuntimeError(f"unknown injector.injector_mode={injector_config.injector_mode}")
        self.cdp_url: str | None = self.upstream.config.upstream_ws_cdp_url
        if isinstance(types, CDPTypes):
            self.types = types
        elif isinstance(types, Mapping):
            self.types = CDPTypes(
                cast(Any, types.get("custom_commands")),
                cast(Any, types.get("custom_events")),
                cast(Any, types.get("custom_middlewares")),
            )
        else:
            self.types = CDPTypes()

        self.extension_id: str | None = None
        self.ext_target_id: str | None = None
        self.ext_session_id: str | None = None
        self.ext_execution_context_id: int | None = None
        self.latency: ModCDPPingLatency | None = None
        self.connect_timing: ModCDPConnectTiming | None = None
        self.last_command_timing: ModCDPCommandTiming | None = None

        self._handlers: dict[str, list[Handler]] = {}
        self._handler_wrappers: dict[tuple[str, Handler], Handler] = {}
        self.router = AutoSessionRouter(
            lambda method, params=None, session_id=None: self.upstream.send(method, dict(params or {}), session_id) or {},
            parsed_router_config.model_dump(),
        )
        if self.config.client_hydrate_aliases:
            install_cdp_surface(self)
        self.Mod = _ModDomain(self)
        self._closed = False
        self._heartbeat_stop: threading.Event | None = None
        self._heartbeat_thread: threading.Thread | None = None

    def toJSON(self) -> dict[str, object]:
        return modCDPToJSON(
            self,
            {
                "config": {
                    "client_config": self.config,
                    "server_config": self.server_config or {},
                },
                "state": {
                    "event_wait_cleanups": len(self._handlers),
                    "heartbeat_timer": self._heartbeat_thread is not None,
                    "latency": self.latency.get("round_trip_ms") if self.latency else None,
                    "connected": self.connect_timing is not None,
                },
                "children": {
                    "launcher": self.launcher,
                    "upstream": self.upstream,
                    "injector": self.injector,
                    "router": self.router,
                    "types": self.types,
                },
            },
        )

    def connect(self) -> "ModCDPClient":
        connect_started_at = int(time.time() * 1000)
        transport_started_at = int(time.time() * 1000)
        self._connect_upstream_transport()
        transport_connected_at = int(time.time() * 1000)
        self.upstream.onRecv(lambda message: self._on_recv(cast(CdpMessage, message)))
        self.upstream.onClose(lambda error: self._handle_transport_close(error))

        if self.injector is None and self.server_config is None:
            connected_at = int(time.time() * 1000)
            self.connect_timing = cast(ModCDPConnectTiming, {
                "started_at": connect_started_at,
                "upstream_mode": self.upstream.config.upstream_mode,
                "transport_started_at": transport_started_at,
                "transport_connected_at": transport_connected_at,
                "transport_duration_ms": transport_connected_at - transport_started_at,
                "connected_at": connected_at,
                "duration_ms": connected_at - connect_started_at,
            })
            return self

        self._initialize_raw_cdp_transport()

        injector_started_at = int(time.time() * 1000)
        if self.injector is None:
            raise RuntimeError("injector.injector_mode='none' cannot be used with a raw_cdp upstream.")
        ext = self._inject_extension()
        injector_completed_at = int(time.time() * 1000)
        self.extension_id = ext["extension_id"]
        self.ext_target_id = ext["target_id"]
        self.ext_session_id = ext["session_id"]
        self.router.send("Runtime.enable", {}, self.ext_session_id)
        self.ext_execution_context_id = self.router.waitForExecutionContext(
            self.ext_session_id,
            self.injector.config.injector_execution_context_timeout_ms,
        )
        self.router.send("Runtime.addBinding", {"name": CUSTOM_EVENT_BINDING_NAME}, self.ext_session_id)
        if self.config.client_mirror_upstream_events:
            self.router.send("Runtime.addBinding", {"name": UPSTREAM_EVENT_BINDING_NAME}, self.ext_session_id)

        if self.server_config is not None:
            self.send("Mod.configure", self._server_configure_params())
        self._start_heartbeat()
        threading.Thread(target=self._measure_ping_latency, daemon=True).start()
        connected_at = int(time.time() * 1000)
        self.connect_timing = cast(ModCDPConnectTiming, {
            "started_at": connect_started_at,
            "upstream_mode": self.upstream.config.upstream_mode,
            "transport_started_at": transport_started_at,
            "transport_connected_at": transport_connected_at,
            "transport_duration_ms": transport_connected_at - transport_started_at,
            "injector_source": ext.get("source"),
            "injector_started_at": injector_started_at,
            "injector_completed_at": injector_completed_at,
            "injector_duration_ms": injector_completed_at - injector_started_at,
            "connected_at": connected_at,
            "duration_ms": connected_at - connect_started_at,
        })
        return self

    def _send_command(
        self,
        method: str,
        params: Mapping[str, Any] | None = None,
        session_id: str | None = None,
        validate_custom_schema: bool = True,
    ) -> Any:
        started_at = int(time.time() * 1000)
        preparation = self.types.prepareCommand(
            method,
            dict(params or {}),
            can_register_locally=method == "Mod.addCustomCommand"
            or (method in ("Mod.addCustomEvent", "Mod.addMiddleware") and self.ext_session_id is None),
        )
        if preparation.local_result is not None:
            completed_at = int(time.time() * 1000)
            self.last_command_timing = {
                "method": method,
                "target": "client",
                "started_at": started_at,
                "completed_at": completed_at,
                "duration_ms": completed_at - started_at,
            }
            result = self.types.parseCommandResult(method, preparation.local_result) if validate_custom_schema else preparation.local_result
            return AwaitableDict(dict(result)) if isinstance(result, Mapping) else AwaitableValue(result)
        command_params = preparation.params
        if self.injector is None and self.server_config is None:
            result = self.router.send(method, command_params, session_id)
            result = self.types.parseCommandResult(method, result) if validate_custom_schema else result
            completed_at = int(time.time() * 1000)
            self.last_command_timing = {
                "method": method,
                "target": "browser_targets",
                "started_at": started_at,
                "completed_at": completed_at,
                "duration_ms": completed_at - started_at,
            }
            return AwaitableDict(dict(result)) if isinstance(result, Mapping) else AwaitableValue(result)

        command = wrap_command_if_needed(
            method,
            command_params,
            routes=self.router.config.router_routes,
            cdp_session_id=session_id,
        )
        if command["target"] == "direct_cdp":
            step = command["steps"][0]
            step_params = step.get("params")
            result = self.router.send(step["method"], step_params if isinstance(step_params, Mapping) else {}, step.get("sessionId"))
        elif command["target"] == "service_worker":
            if self.injector is None:
                raise RuntimeError("injector.injector_mode='none' cannot route commands through the service worker.")
            result = {}
            unwrap: str | None = None
            for step in command["steps"]:
                params = dict(step.get("params") or {})
                if step["method"] == "Runtime.callFunctionOn" and "executionContextId" not in params:
                    if self.ext_execution_context_id is None:
                        self.ext_execution_context_id = self.router.waitForExecutionContext(
                            self.ext_session_id,
                            self.injector.config.injector_execution_context_timeout_ms,
                        )
                    params["executionContextId"] = self.ext_execution_context_id
                result = self.router.send(step["method"], params, self.ext_session_id)
                unwrap = step.get("unwrap")
            result = unwrap_response_if_needed(result, unwrap)
        else:
            raise RuntimeError(f"Unsupported command target {command['target']!r}")
        if validate_custom_schema:
            result = self.types.parseCommandResult(method, result)
        completed_at = int(time.time() * 1000)
        self.last_command_timing = {
            "method": method,
            "target": command["target"],
            "started_at": started_at,
            "completed_at": completed_at,
            "duration_ms": completed_at - started_at,
        }
        return AwaitableDict(dict(result)) if isinstance(result, Mapping) else AwaitableValue(result)

    def send(
        self,
        method: str,
        params: Mapping[str, Any] | None = None,
        session_id: str | None = None,
    ) -> AwaitableDict | AwaitableValue:
        result = self._send_command(method, params, session_id=session_id)
        if isinstance(result, AwaitableDict):
            return result
        if isinstance(result, AwaitableValue):
            return result
        return AwaitableDict(dict(result)) if isinstance(result, Mapping) else AwaitableValue(result)

    def on(self, event: str | type[CDPEvent], handler: Handler) -> "ModCDPClient":
        event_name = cdp_event_name(event) if not isinstance(event, str) else event
        if event_name is None:
            raise TypeError("event must be a CDP event class or event name string")
        wrapped_handler = handler
        if not isinstance(event, str):
            event_class = event

            def typed_handler(payload):
                typed_payload = event_class.model_validate(payload) if isinstance(payload, Mapping) else payload
                return handler(typed_payload)

            wrapped_handler = typed_handler
        self._handler_wrappers[(event_name, handler)] = wrapped_handler
        handlers = self._handlers.setdefault(event_name, [])
        if wrapped_handler not in handlers:
            handlers.append(wrapped_handler)
        return self

    def once(self, event: str | type[CDPEvent], handler: Handler) -> "ModCDPClient":
        def wrapped_handler(payload: Any) -> Any:
            self.off(event, wrapped_handler)
            return handler(payload)

        return self.on(event, wrapped_handler)

    def off(self, event: str | type[CDPEvent], handler: Handler) -> "ModCDPClient":
        event_name = cdp_event_name(event) if not isinstance(event, str) else event
        if event_name is None:
            raise TypeError("event must be a CDP event class or event name string")
        wrapped_handler = self._handler_wrappers.pop((event_name, handler), handler)
        handlers = self._handlers.get(event_name)
        if handlers and wrapped_handler in handlers:
            handlers.remove(wrapped_handler)
            if not handlers:
                self._handlers.pop(event_name, None)
        return self

    def __await__(self):
        async def _value():
            return self

        return _value().__await__()

    def configure(
        self,
        *,
        upstream: Mapping[str, Any] | None = None,
        router: Mapping[str, Any] | None = None,
        client_config: Mapping[str, Any] | None = None,
        server_config: Mapping[str, JsonValue] | None | object = DEFAULT_SERVER,
    ) -> "ModCDPClient":
        if client_config is not None:
            self.config = ClientConfig.model_validate({**self.config.model_dump(), **dict(client_config)})
            self.upstream.update({"upstream_cdp_send_timeout_ms": self.config.client_cdp_send_timeout_ms})
        if upstream is not None:
            self.upstream.update(dict(upstream))
        if router is not None:
            current_routes = dict(self.router.config.router_routes)
            incoming_routes = dict(cast(Mapping[str, str], router.get("router_routes") or {}))
            self.router.config = RouterConfig.model_validate(
                {
                    **self.router.config.model_dump(),
                    **dict(router),
                    "router_routes": {
                        **current_routes,
                        **incoming_routes,
                    },
                }
            )
        if server_config is not DEFAULT_SERVER:
            self.server_config = None if server_config is None else cast(ModCDPServerConfig, dict(cast(Mapping[str, JsonValue], server_config)))
        return self

    def _run_handler(self, handler: Handler, payload: Any, event_name: str) -> None:
        try:
            result = handler(payload)
            if inspect.iscoroutine(result):
                asyncio.run(result)
        except Exception as e:
            print(f"[ModCDPClient] handler error for {event_name}: {e}")

    def __getattr__(self, domain: str):
        if domain.startswith("_"):
            raise AttributeError(domain)
        if not self.config.client_hydrate_aliases:
            raise AttributeError(domain)
        from ..types.generated.cdp import DynamicDomain

        dynamic = DynamicDomain(self, domain)
        setattr(self, domain, dynamic)
        return dynamic

    def _server_configure_params(self) -> ModCDPServerConfig:
        server_config = dict(self.server_config or {})
        upstream = dict(cast(Mapping[str, JsonValue], server_config.pop("upstream", {})))
        router = dict(cast(Mapping[str, JsonValue], server_config.pop("router", {})))
        server_client_config = dict(cast(Mapping[str, JsonValue], server_config.pop("client_config", {})))
        downstream = dict(cast(Mapping[str, JsonValue], server_config.pop("downstream", {})))
        server_browser_token = server_config.pop("server_browser_token", None)
        custom_events = self.types.customEventWireRegistrations()
        custom_commands = self.types.customCommandWireRegistrations(expression_required=True)
        custom_middlewares = self.types.customMiddlewareWireRegistrations()
        return cast(ModCDPServerConfig, {
            "upstream": {
                "upstream_ws_connect_error_settle_timeout_ms": self.upstream.config.upstream_ws_connect_error_settle_timeout_ms,
                **upstream,
            },
            "router": {
                "loopback_execution_context_timeout_ms": self.injector.config.injector_execution_context_timeout_ms
                if self.injector is not None
                else self.router.config.loopback_execution_context_timeout_ms,
                **router,
            },
            "client_config": {
                "client_cdp_send_timeout_ms": self.config.client_cdp_send_timeout_ms,
                **server_client_config,
            },
            "downstream": {
                "downstream_client_timeout_ms": max(self.config.client_heartbeat_interval_ms * 4, 1_000),
                **downstream,
            },
            **({"server_browser_token": server_browser_token} if server_browser_token is not None else {}),
            **server_config,
            "custom_events": custom_events,
            "custom_commands": custom_commands,
            "custom_middlewares": custom_middlewares,
        })

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._stop_heartbeat()
        self.launcher.close()
        try:
            self.upstream.close()
        except Exception:
            pass
        if self.injector is not None:
            try:
                self.injector.close()
            except Exception:
                pass

    def _handle_transport_close(self, error: Exception) -> None:
        self._stop_heartbeat()

    def _start_heartbeat(self) -> None:
        self._stop_heartbeat()
        if not self.server_config or (self.server_config.get("downstream") or {}).get("downstream_close_browser_on_disconnect") is not True:
            return
        interval_ms = self.config.client_heartbeat_interval_ms
        stop = threading.Event()
        self._heartbeat_stop = stop

        def run() -> None:
            while not stop.wait(interval_ms / 1000):
                try:
                    self.send("Mod.ping", {"sent_at": int(time.time() * 1000)})
                except Exception:
                    return

        self._heartbeat_thread = threading.Thread(target=run, daemon=True)
        self._heartbeat_thread.start()

    def _stop_heartbeat(self) -> None:
        stop = self._heartbeat_stop
        self._heartbeat_stop = None
        if stop is not None:
            stop.set()
        self._heartbeat_thread = None

    def _connect_upstream_transport(self) -> None:
        launcher = self.launcher
        transport = self.upstream
        initial_upstream_ws_cdp_url = self.upstream.config.upstream_ws_cdp_url

        if self.injector is not None:
            self.injector.update({"injector_cdp_send_timeout_ms": self.config.client_cdp_send_timeout_ms})
            self.injector.prepare()
            launcher.update(self.injector.configForLauncher())
            transport.update(self.injector.configForUpstream())
        launcher.update(transport.configForLauncher())
        needs_loopback_cdp = (
            self.server_config is not None
            and not (self.server_config.get("upstream") or {}).get("upstream_ws_cdp_url")
            and ((self.server_config.get("router") or {}).get("router_routes") or {}).get("*.*") == "loopback_cdp"
        )
        launcher.update({"launcher_local_loopback_cdp": needs_loopback_cdp})
        transport.update(launcher.configForUpstream())

        if self.launcher.config.launcher_mode != "none":
            launched = launcher.launch()
            transport.update(launcher.configForUpstream())
            if self.injector is not None:
                transport.update(self.injector.configForUpstream())
        launched_cdp_url = launcher.launched.get("cdp_url") if launcher.launched else None
        transport.connect()

        self.cdp_url = transport.url or launched_cdp_url
        if transport.upstream_mode == "ws" and transport.url:
            # For ws mode, cdp_url has been resolved to the concrete WebSocket CDP endpoint after connect().
            self.upstream.config = UpstreamTransportConfig.model_validate({**self.upstream.config.model_dump(), "upstream_ws_cdp_url": transport.url})
        server_config = {"upstream": {"upstream_ws_cdp_url": transport.url}} if self.upstream.config.upstream_mode == "ws" and transport.url else {}
        transport_server_config = transport.configForServer()
        server_config.update(launcher.configForServer(transport))
        server_config.update(transport_server_config)
        server_upstream = cast(Mapping[str, Any], server_config.get("upstream") or {})
        server_upstream_ws_cdp_url = server_upstream.get("upstream_ws_cdp_url")
        if self.server_config is not None and server_upstream_ws_cdp_url:
            configured_loopback = cast(Mapping[str, Any], self.server_config.get("upstream") or {}).get("upstream_ws_cdp_url")
            if "upstream" not in self.server_config or configured_loopback in (
                initial_upstream_ws_cdp_url,
                launched_cdp_url,
            ):
                self.server_config = {**self.server_config, **server_config}

    def _initialize_raw_cdp_transport(self) -> None:
        self.upstream.send("Target.setAutoAttach", {
            "autoAttach": True,
            "waitForDebuggerOnStart": False,
            "flatten": True,
        })
        self.upstream.send("Target.setDiscoverTargets", {"discover": True})

    def _inject_extension(self) -> ExtensionInfo:
        if self.injector is None:
            raise RuntimeError("injector.injector_mode=none cannot inject an extension.")
        self.injector.update({
            "send": self.upstream.send,
            "injector_cdp_send_timeout_ms": self.config.client_cdp_send_timeout_ms,
        })
        self.injector.prepare()
        result = self.injector.inject()
        if not result:
            raise RuntimeError(f"{type(self.injector).__name__} did not return a ModCDP extension target.")
        self.injector.recordInjectionResult(result)
        return cast(ExtensionInfo, result)

    def _measure_ping_latency(self) -> ModCDPPingLatency | None:
        sent_at = int(time.time() * 1000)
        done: Queue[ProtocolPayload] = Queue()

        def on_pong(payload: ProtocolPayload) -> None:
            done.put(payload or {})

        self._handlers.setdefault("Mod.pong", []).append(on_pong)
        try:
            self.send("Mod.ping", {"sent_at": sent_at})
            payload = done.get(timeout=10)
        except Empty:
            return self.latency
        except Exception:
            return self.latency
        finally:
            handlers = self._handlers.get("Mod.pong") or []
            if on_pong in handlers:
                handlers.remove(on_pong)

        returned_at = int(time.time() * 1000)
        raw_received_at = payload.get("received_at")
        received_at = raw_received_at if isinstance(raw_received_at, (int, float)) else None
        latency: ModCDPPingLatency = {
            "sent_at": sent_at,
            "received_at": received_at,
            "returned_at": returned_at,
            "round_trip_ms": returned_at - sent_at,
            "service_worker_ms": received_at - sent_at if received_at is not None else None,
            "return_path_ms": returned_at - received_at if received_at is not None else None,
        }
        self.latency = latency
        return latency

    def _on_recv(self, msg: CdpMessage) -> None:
        if "id" in msg and msg["id"] is not None:
            return
        method = msg.get("method")
        raw_params = msg.get("params")
        params = raw_params if isinstance(raw_params, Mapping) else {}
        if isinstance(method, str):
            session_id = msg.get("sessionId")
            self.router.recordProtocolEvent(method, params, session_id if isinstance(session_id, str) else None)
        if method and self.ext_session_id is not None and msg.get("sessionId") == self.ext_session_id:
            session_id = msg.get("sessionId")
            u = unwrap_event_if_needed(
                method,
                params,
                session_id if isinstance(session_id, str) else None,
                self.ext_session_id,
            )
            if u:
                validated_payload = self.types.parseEventPayload(u["event"], u["data"])
                for handler in list(self._handlers.get(u["event"], [])):
                    def run_wrapped_event(handler=handler, payload=validated_payload, event_name=u["event"]):
                        self._run_handler(handler, payload, event_name)
                    threading.Thread(target=run_wrapped_event, daemon=True).start()
            return
        if method:
            validated_payload = self.types.parseEventPayload(method, dict(params))
            for handler in list(self._handlers.get(method, [])):
                def run_method_event(handler=handler, payload=validated_payload, event_name=method):
                    self._run_handler(handler, payload, event_name)
                threading.Thread(target=run_method_event, daemon=True).start()
