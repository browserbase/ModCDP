// ModCDPClient (JS): importable, no CLI, no demo code.
//
// Constructor option groups mirror the owning runtime components:
//   launcher          browser/session creation and cleanup
//   upstream          message transport to either raw CDP or a ModCDP server
//   injector          raw-CDP extension discovery/injection/borrowing
//   client            client-side routing, alias hydration, event mirroring, send/event timeouts
//   server_options    ModCDPServer.configure params
//
// Public methods: connect, send(method, params), on(event, handler), close.

// oxlint-disable typescript-eslint/no-unsafe-declaration-merging -- alias members are assigned by connect().
import type { z } from "zod";

import type { CdpAliases } from "../types/generated/aliases.js";
import * as Runtime from "../types/generated/zod/Runtime.js";
import {
  CUSTOM_EVENT_BINDING_NAME,
  UPSTREAM_EVENT_BINDING_NAME,
  wrapCommandIfNeeded,
  unwrapResponseIfNeeded,
  unwrapEventIfNeeded,
} from "../translate/translate.js";
import { type UpstreamTransportOptions, UpstreamTransport } from "../transport/UpstreamTransport.js";
import {
  CDPTypes,
  serializablePayloadSchema,
  type CDPCommandMap,
  type CDPEventMap,
  type CDPEventMapPayloads,
  type CDPEventNameInput,
  type CDPEventPayload,
  type CDPTypesOptions,
} from "../types/CDPTypes.js";
import { ChromeDebuggerUpstreamTransport } from "../transport/ChromeDebuggerUpstreamTransport.js";
import { WSUpstreamTransport } from "../transport/WSUpstreamTransport.js";
import { AutoSessionRouter } from "../router/AutoSessionRouter.js";
import { BrowserLauncher, type LauncherOptions } from "../launcher/BrowserLauncher.js";
import { NoneBrowserLauncher } from "../launcher/NoneBrowserLauncher.js";
import { ExtensionInjector, type InjectorOptions, type SendCDP } from "../injector/ExtensionInjector.js";
import type {
  CdpEventMessage,
  CdpResponseMessage,
  RuntimeBindingCalledEvent,
  ModCDPClientOptions,
  ModCDPConfigureParams,
  ModCDPServerOptions,
  ModCDPNamedValue,
  ModCDPPingLatency,
  ModCDPPongEvent,
  ModCDPRouterOptions,
  ProtocolPayload,
  ProtocolParams,
  ProtocolResult,
} from "../types/modcdp.js";

const DEFAULT_CDP_SEND_TIMEOUT_MS = 10_000;
const DEFAULT_EVENT_WAIT_TIMEOUT_MS = 10_000;
const DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS = 10_000;
const DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS = 10_000;
const DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS = 60_000;
const DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS = 100;
const DEFAULT_CLIENT_HEARTBEAT_INTERVAL_MS = 250;

type ClientOptions<TCommands extends CDPCommandMap = {}, TEvents extends CDPEventMap = {}> = {
  launcher?: LauncherOptions;
  upstream?: UpstreamTransportOptions;
  injector?: InjectorOptions;
  router?: ModCDPRouterOptions;
  client_options?: ModCDPClientOptions;
  server_options?: ModCDPServerOptions | null;
  types?: CDPTypesOptions<TCommands, TEvents> | CDPTypes<TCommands, TEvents>;
};
const upstream_transport_constructors = new Map<
  NonNullable<UpstreamTransportOptions["upstream_mode"]>,
  typeof UpstreamTransport
>([
  ["ws", WSUpstreamTransport],
  ["chromedebugger", ChromeDebuggerUpstreamTransport],
]);

const browser_launcher_constructors = new Map<NonNullable<LauncherOptions["launcher_mode"]>, typeof BrowserLauncher>([
  ["none", NoneBrowserLauncher],
]);

const extension_injector_constructors = new Map<
  NonNullable<InjectorOptions["injector_mode"]>,
  typeof ExtensionInjector
>();

class ModCDPEventEmitter {
  private listeners = new Map<string | symbol, Set<(...args: unknown[]) => void>>();

  on(event_name: CDPEventNameInput, listener: (...args: unknown[]) => void) {
    const event_key = typeof event_name === "string" || typeof event_name === "symbol" ? event_name : event_name.id;
    const listeners = this.listeners.get(event_key);
    if (listeners) listeners.add(listener);
    else this.listeners.set(event_key, new Set([listener]));
    return this;
  }

  once(event_name: CDPEventNameInput, listener: (...args: unknown[]) => void) {
    const event_key = typeof event_name === "string" || typeof event_name === "symbol" ? event_name : event_name.id;
    const wrapped = (...args: unknown[]) => {
      this.listeners.get(event_key)?.delete(wrapped);
      listener(...args);
    };
    return this.on(event_key, wrapped);
  }

  off(event_name: CDPEventNameInput, listener: (...args: unknown[]) => void) {
    const event_key = typeof event_name === "string" || typeof event_name === "symbol" ? event_name : event_name.id;
    this.listeners.get(event_key)?.delete(listener);
    return this;
  }

  emit(event_name: string | symbol, ...args: unknown[]) {
    for (const listener of this.listeners.get(event_name) ?? []) listener(...args);
    if (event_name !== "*") {
      for (const listener of this.listeners.get("*") ?? []) listener(event_name, ...args);
    }
    return true;
  }
}

class ModCDPClientBase<
  TCommands extends CDPCommandMap = {},
  TEvents extends CDPEventMap = {},
> extends ModCDPEventEmitter {
  // sub-services
  launcher: BrowserLauncher;
  upstream: UpstreamTransport;
  injector: ExtensionInjector | null;
  router: AutoSessionRouter;
  types: CDPTypes<TCommands, TEvents>;

  // configuration
  client_options: Required<ModCDPClientOptions>;
  server_options: ModCDPServerOptions | null;

  // runtime state
  event_wait_cleanups: Set<() => void>;
  heartbeat_timer: ReturnType<typeof setInterval> | null;
  latency: ModCDPPingLatency | null;
  connect_timing: Record<string, unknown> | null;
  last_command_timing: Record<string, unknown> | null;

  constructor({
    launcher = {},
    upstream = {},
    injector = {},
    router = {},
    client_options = {},
    server_options = {},
    types = {},
  }: ClientOptions<TCommands, TEvents> = {}) {
    super();
    const upstream_options = { ...upstream, upstream_mode: upstream.upstream_mode ?? "ws" };
    const launcher_options = { ...launcher, launcher_mode: launcher.launcher_mode ?? "none" };
    const injector_options = { ...injector, injector_mode: injector.injector_mode ?? "none" };
    const Upstream = upstream_transport_constructors.get(upstream_options.upstream_mode);
    if (!Upstream) throw new Error(`unknown upstream.upstream_mode=${upstream_options.upstream_mode}`);
    this.upstream = new Upstream(upstream_options);

    const Launcher = browser_launcher_constructors.get(launcher_options.launcher_mode);
    if (!Launcher) throw new Error(`unknown launcher.launcher_mode=${launcher_options.launcher_mode}`);
    this.launcher = new Launcher(launcher_options);

    if (injector_options.injector_mode === "none") this.injector = null;
    else {
      const Injector = extension_injector_constructors.get(injector_options.injector_mode);
      if (!Injector) throw new Error(`unknown injector.injector_mode=${injector_options.injector_mode}`);
      this.injector = new Injector(injector_options);
    }
    this.client_options = {
      client_hydrate_aliases: client_options.client_hydrate_aliases ?? true,
      client_mirror_upstream_events: client_options.client_mirror_upstream_events ?? true,
      client_cdp_send_timeout_ms: client_options.client_cdp_send_timeout_ms ?? DEFAULT_CDP_SEND_TIMEOUT_MS,
      client_event_wait_timeout_ms: client_options.client_event_wait_timeout_ms ?? DEFAULT_EVENT_WAIT_TIMEOUT_MS,
      client_heartbeat_interval_ms: client_options.client_heartbeat_interval_ms ?? DEFAULT_CLIENT_HEARTBEAT_INTERVAL_MS,
    };
    this.upstream.update({
      upstream_cdp_send_timeout_ms: this.client_options.client_cdp_send_timeout_ms,
    });
    this.server_options =
      server_options === null
        ? null
        : {
            ...(this.upstream.upstream_mode === "nativemessaging" ||
            this.upstream.upstream_mode === "reversews" ||
            this.upstream.upstream_mode === "nats"
              ? { router: { router_routes: { "*.*": "chromedebugger" } } }
              : {}),
            ...(server_options ?? {}),
          };
    this.types = types instanceof CDPTypes ? types : new CDPTypes(types);

    this.latency = null;
    this.connect_timing = null;
    this.last_command_timing = null;
    this.event_wait_cleanups = new Set();
    this.heartbeat_timer = null;
    this.router = new AutoSessionRouter({
      ...router,
      upstream: this.upstream,
      types: this.types,
      loopback_execution_context_timeout_ms:
        router.loopback_execution_context_timeout_ms ??
        this.injector?.injector_execution_context_timeout_ms ??
        injector_options.injector_execution_context_timeout_ms ??
        DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS,
    });
    if (this.client_options.client_hydrate_aliases)
      this.types.installAliases(this, (method, params) => this.send(method, params));
  }

  configure({
    upstream,
    router,
    client_options,
    server_options,
  }: Pick<ClientOptions<TCommands, TEvents>, "upstream" | "router" | "client_options" | "server_options"> = {}) {
    const router_routes = {
      ...this.router.router_routes,
      ...(router?.router_routes ?? {}),
    };
    const configured_router = {
      router_routes,
      loopback_execution_context_timeout_ms:
        router?.loopback_execution_context_timeout_ms ?? this.router.loopback_execution_context_timeout_ms,
    };
    const configured_loopback_cdp_url =
      upstream?.upstream_ws_cdp_url !== undefined
        ? upstream.upstream_ws_cdp_url
        : this.upstream.upstream_mode === "ws"
          ? this.upstream.upstream_ws_cdp_url
          : null;
    const configured_upstream = {
      ...(this.upstream.upstream_mode === "ws"
        ? {
            upstream_mode: "ws" as const,
            upstream_ws_cdp_url: this.upstream.upstream_ws_cdp_url,
            upstream_ws_connect_error_settle_timeout_ms: this.upstream.upstream_ws_connect_error_settle_timeout_ms,
          }
        : this.upstream.upstream_mode === "chromedebugger"
          ? {
              upstream_mode: "chromedebugger" as const,
              upstream_ws_connect_error_settle_timeout_ms: this.upstream.upstream_ws_connect_error_settle_timeout_ms,
            }
          : {}),
      ...(upstream ?? {}),
    };
    const route_upstream = router_routes["*.*"];
    const upstream_mode =
      configured_upstream.upstream_mode === "chromedebugger"
        ? "chromedebugger"
        : configured_upstream.upstream_mode === "ws"
          ? "ws"
          : route_upstream === "loopback_cdp"
            ? "ws"
            : route_upstream === "chromedebugger"
              ? "chromedebugger"
              : configured_loopback_cdp_url
                ? "ws"
                : this.upstream.upstream_mode === "ws" && !this.upstream.upstream_ws_cdp_url
                  ? "chromedebugger"
                  : this.upstream.upstream_mode;
    const selected_upstream =
      upstream_mode === "ws"
        ? {
            ...configured_upstream,
            upstream_mode: "ws" as const,
            upstream_ws_cdp_url: configured_loopback_cdp_url,
          }
        : {
            ...configured_upstream,
            upstream_mode: "chromedebugger" as const,
          };
    this.client_options = {
      client_hydrate_aliases: client_options?.client_hydrate_aliases ?? this.client_options.client_hydrate_aliases,
      client_mirror_upstream_events:
        client_options?.client_mirror_upstream_events ?? this.client_options.client_mirror_upstream_events,
      client_cdp_send_timeout_ms:
        client_options?.client_cdp_send_timeout_ms ?? this.client_options.client_cdp_send_timeout_ms,
      client_event_wait_timeout_ms:
        client_options?.client_event_wait_timeout_ms ?? this.client_options.client_event_wait_timeout_ms,
      client_heartbeat_interval_ms:
        client_options?.client_heartbeat_interval_ms ?? this.client_options.client_heartbeat_interval_ms,
    };
    this.upstream.update({
      upstream_cdp_send_timeout_ms: this.client_options.client_cdp_send_timeout_ms,
    });
    if (server_options !== undefined) {
      this.server_options =
        server_options === null
          ? null
          : {
              ...(this.upstream.upstream_mode === "nativemessaging" ||
              this.upstream.upstream_mode === "reversews" ||
              this.upstream.upstream_mode === "nats"
                ? { router: { router_routes: { "*.*": "chromedebugger" } } }
                : {}),
              ...server_options,
            };
    }

    const should_rebuild_upstream =
      upstream !== undefined ||
      router !== undefined ||
      selected_upstream.upstream_mode !== this.upstream.upstream_mode ||
      (selected_upstream.upstream_mode === "ws" &&
        (this.upstream.upstream_mode !== "ws" ||
          selected_upstream.upstream_ws_cdp_url !== this.upstream.upstream_ws_cdp_url));
    if (should_rebuild_upstream) {
      const Upstream = upstream_transport_constructors.get(selected_upstream.upstream_mode);
      if (!Upstream) throw new Error(`unknown upstream.upstream_mode=${selected_upstream.upstream_mode}`);
      this.router.stop();
      this.upstream = new Upstream(selected_upstream);
      this.upstream.update({
        upstream_cdp_send_timeout_ms: this.client_options.client_cdp_send_timeout_ms,
      });
      this.router = new AutoSessionRouter({
        ...configured_router,
        upstream: this.upstream,
        types: this.types,
        loopback_execution_context_timeout_ms: configured_router.loopback_execution_context_timeout_ms,
      });
    }
    if (this.client_options.client_hydrate_aliases)
      this.types.installAliases(this, (method, params) => this.send(method, params));
    return this;
  }

  async connect() {
    const connect_started_at = Date.now();

    const transport_started_at = Date.now();
    await this._connectUpstreamTransport();
    const transport_connected_at = Date.now();
    this.upstream.onRecv((message) => this._onRecv(message));
    this.upstream.onClose((error) => {
      this._stopHeartbeat();
      this.emit("error", error);
    });

    if (
      this.upstream.upstream_mode === "nativemessaging" ||
      this.upstream.upstream_mode === "reversews" ||
      this.upstream.upstream_mode === "nats"
    ) {
      await this.upstream.waitForPeer();
      if (this.server_options !== null) {
        await this.send("Mod.configure", this._serverConfigureParams());
      }
      this._startHeartbeat();
      void this._measurePingLatency().catch(() => {});
      const connected_at = Date.now();
      this.connect_timing = {
        started_at: connect_started_at,
        upstream_mode: this.upstream.upstream_mode,
        transport_started_at,
        transport_connected_at,
        transport_duration_ms: transport_connected_at - transport_started_at,
        connected_at,
        duration_ms: connected_at - connect_started_at,
      };
      return this;
    }

    if (this.upstream.upstream_mode === "chromedebugger" || (this.injector == null && this.server_options === null)) {
      const connected_at = Date.now();
      this.connect_timing = {
        started_at: connect_started_at,
        upstream_mode: this.upstream.upstream_mode,
        transport_started_at,
        transport_connected_at,
        transport_duration_ms: transport_connected_at - transport_started_at,
        connected_at,
        duration_ms: connected_at - connect_started_at,
      };
      return this;
    }

    await this.router.start();

    const injector_started_at = Date.now();
    if (this.injector == null) {
      throw new Error("injector.injector_mode=none cannot be used with an extension-routed browser upstream.");
    }
    const injector = this.injector;
    await this._runInjector((method, params, session_id) =>
      this.upstream.send(method, params, session_id, {
        timeout_ms: this.client_options.client_cdp_send_timeout_ms,
      }),
    );
    const injector_completed_at = Date.now();

    if (injector.target_id == null || injector.session_id == null) {
      throw new Error(`${injector.constructor.name} did not record a ModCDP extension target.`);
    }
    await this.router.send(Runtime.EnableCommand.id, {}, injector.session_id);
    await Promise.all([
      this.router.send(Runtime.AddBindingCommand.id, { name: CUSTOM_EVENT_BINDING_NAME }, injector.session_id),
      this.client_options.client_mirror_upstream_events
        ? this.router.send(Runtime.AddBindingCommand.id, { name: UPSTREAM_EVENT_BINDING_NAME }, injector.session_id)
        : Promise.resolve(),
    ]);
    if (this.server_options !== null) {
      await this.send("Mod.configure", this._serverConfigureParams());
    }

    this._startHeartbeat();
    void this._measurePingLatency().catch(() => {});
    const connected_at = Date.now();
    this.connect_timing = {
      started_at: connect_started_at,
      upstream_mode: this.upstream.upstream_mode,
      transport_started_at,
      transport_connected_at,
      transport_duration_ms: transport_connected_at - transport_started_at,
      injector_source: injector.source,
      injector_started_at,
      injector_completed_at,
      injector_duration_ms: injector_completed_at - injector_started_at,
      connected_at,
      duration_ms: connected_at - connect_started_at,
    };
    return this;
  }

  async send(method: string, params: unknown = {}, session_id: string | null = null) {
    const started_at = Date.now();
    const prepared = this.types.prepareCommand(
      method,
      params,
      method === "Mod.addCustomCommand" ||
        (method === "Mod.addCustomEvent" &&
          !this.injector?.session_id &&
          this.upstream.upstream_mode !== "nativemessaging" &&
          this.upstream.upstream_mode !== "reversews" &&
          this.upstream.upstream_mode !== "nats") ||
        (method === "Mod.addMiddleware" &&
          !this.injector?.session_id &&
          this.upstream.upstream_mode !== "nativemessaging" &&
          this.upstream.upstream_mode !== "reversews" &&
          this.upstream.upstream_mode !== "nats"),
    );
    const command_params = prepared.params;
    if (prepared.custom_command_name) {
      this.types.installCustomCommandAlias(this, prepared.custom_command_name, (alias_method, alias_params) =>
        this.send(alias_method, alias_params),
      );
    }
    if (prepared.local_result) {
      this.last_command_timing = {
        method,
        target: "client",
        started_at,
        completed_at: Date.now(),
        duration_ms: Date.now() - started_at,
      };
      return this.types.parseCommandResult(method, prepared.local_result);
    }
    if (
      this.upstream.upstream_mode === "nativemessaging" ||
      this.upstream.upstream_mode === "reversews" ||
      this.upstream.upstream_mode === "nats"
    ) {
      await this.upstream.waitForPeer();
      const result = await this.upstream.send(method, command_params as ProtocolParams, null, {
        timeout_ms: this.client_options.client_cdp_send_timeout_ms,
      });
      const completed_at = Date.now();
      this.last_command_timing = {
        method,
        target: "modcdp_server",
        started_at,
        completed_at,
        duration_ms: completed_at - started_at,
      };
      return this.types.parseCommandResult(method, result);
    }
    if (this.upstream.upstream_mode === "chromedebugger" || (this.injector == null && this.server_options === null)) {
      const result = await this.router.send(method, command_params as ProtocolParams, session_id);
      const completed_at = Date.now();
      this.last_command_timing = {
        method,
        target: "browser_targets",
        started_at,
        completed_at,
        duration_ms: completed_at - started_at,
      };
      return this.types.parseCommandResult(method, result);
    }
    const command = wrapCommandIfNeeded(method, command_params as ProtocolParams, {
      routes: this.router.router_routes,
      cdpSessionId: session_id,
    });
    let result: ProtocolResult = {};
    let unwrap = null;
    if (command.target === "direct_cdp") {
      const [step] = command.steps;
      result = await this.router.send(step.method, step.params ?? {}, step.sessionId ?? null);
      unwrap = step.unwrap ?? null;
    } else if (command.target === "service_worker") {
      const injector = this.injector;
      if (injector == null || injector.session_id == null) {
        throw new Error("service_worker commands require an injected ModCDP extension target.");
      }
      for (const step of command.steps) {
        result = await this.router.send(step.method, step.params ?? {}, injector.session_id);
        unwrap = step.unwrap ?? null;
      }
      result = unwrapResponseIfNeeded(result, unwrap);
    } else {
      throw new Error(`Unsupported command target "${command.target}"`);
    }
    const completed_at = Date.now();
    this.last_command_timing = {
      method,
      target: command.target,
      started_at,
      completed_at,
      duration_ms: completed_at - started_at,
    };
    return this.types.parseCommandResult(method, result);
  }

  _serverConfigureParams(): ModCDPConfigureParams {
    const server_config = {
      ...this.launcher.configForServer(this.upstream),
      ...(this.server_options ?? {}),
    };
    return {
      upstream: {
        upstream_ws_connect_error_settle_timeout_ms: this.upstream.upstream_ws_connect_error_settle_timeout_ms,
        ...(server_config.upstream ?? {}),
      },
      router: {
        loopback_execution_context_timeout_ms:
          this.injector?.injector_execution_context_timeout_ms ?? DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS,
        ...(server_config.router ?? {}),
      },
      client_options: {
        client_cdp_send_timeout_ms: this.client_options.client_cdp_send_timeout_ms,
        ...(server_config.client_options ?? {}),
      },
      downstream: {
        downstream_client_timeout_ms: Math.max(this.client_options.client_heartbeat_interval_ms * 4, 1_000),
        ...(server_config.downstream ?? {}),
      },
      ...(server_config.server_browser_token !== undefined
        ? { server_browser_token: server_config.server_browser_token }
        : {}),
      custom_commands: this.types.customCommandWireRegistrations({
        expression_required: true,
      }),
      custom_events: [...this.types.custom_events.values()].map((event) => ({
        name: event.name,
        event_schema: serializablePayloadSchema(event.event_schema),
      })),
      custom_middlewares: this.types.customMiddlewareWireRegistrations(),
    };
  }

  async _connectUpstreamTransport() {
    const launcher = this.launcher;
    const transport = this.upstream;
    if (this.injector) {
      this.injector.update({
        injector_cdp_send_timeout_ms: this.client_options.client_cdp_send_timeout_ms,
      });
      await this.injector.prepare();
      launcher.update(this.injector.configForLauncher());
      transport.update(this.injector.configForUpstream());
    }
    launcher.update(transport.configForLauncher());
    launcher.update({
      launcher_local_loopback_cdp:
        this.server_options != null &&
        !this.server_options.upstream?.upstream_ws_cdp_url &&
        this.server_options.router?.router_routes?.["*.*"] === "loopback_cdp",
    });
    transport.update(launcher.configForUpstream());

    if (
      this.upstream.upstream_mode === "nativemessaging" ||
      this.upstream.upstream_mode === "reversews" ||
      this.upstream.upstream_mode === "nats" ||
      this.upstream.upstream_mode === "chromedebugger"
    )
      await transport.connect();
    if (launcher.launcher_mode !== "none") {
      await launcher.launch();
      transport.update(launcher.configForUpstream());
      if (this.injector) transport.update(this.injector.configForUpstream());
    }
    if (this.upstream.upstream_mode === "ws" || this.upstream.upstream_mode === "pipe") await transport.connect();

    if (this.upstream.upstream_mode === "ws" && transport.upstream_ws_cdp_url)
      this.upstream.upstream_ws_cdp_url = transport.upstream_ws_cdp_url;
  }

  async _runInjector(send: SendCDP) {
    if (this.injector == null) throw new Error("injector.injector_mode=none cannot inject an extension.");
    const injector = this.injector;
    injector.update({
      send,
      injector_cdp_send_timeout_ms: this.client_options.client_cdp_send_timeout_ms,
    });
    await injector.prepare();
    const result = await injector.inject();
    if (result) {
      injector.recordInjectionResult(result);
      return result;
    }
    throw new Error(`${injector.constructor.name} did not return a ModCDP extension target.`);
  }

  async close() {
    this._stopHeartbeat();
    for (const cleanup of this.event_wait_cleanups) cleanup();
    this.event_wait_cleanups.clear();
    this.router.stop();
    await this.launcher.close();
    await this.upstream.close();
    await this.injector?.close();
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    if (this.server_options?.downstream?.downstream_close_browser_on_disconnect !== true) return;
    const interval_ms = this.client_options.client_heartbeat_interval_ms;
    this.heartbeat_timer = setInterval(() => {
      void this.send("Mod.ping", { sent_at: Date.now() }).catch(() => {});
    }, interval_ms);
  }

  _stopHeartbeat() {
    if (this.heartbeat_timer == null) return;
    clearInterval(this.heartbeat_timer);
    this.heartbeat_timer = null;
  }

  on<TEvent extends z.ZodType & ModCDPNamedValue>(
    event_name: TEvent,
    listener: (event: CDPEventPayload<TEvent>, sessionId: string | null) => void,
  ): this;
  on<TName extends Extract<keyof CDPEventMapPayloads<TEvents>, string>>(
    event_name: TName,
    listener: (event: CDPEventMapPayloads<TEvents>[TName], sessionId: string | null) => void,
  ): this;
  on(event_name: string | symbol, listener: (...args: unknown[]) => void): this;
  on(event_name: CDPEventNameInput, listener: (...args: any[]) => void): this;
  on(event_name: CDPEventNameInput, listener: (...args: any[]) => void) {
    return super.on(this.types.normalizeEventName(event_name), listener);
  }

  once<TEvent extends z.ZodType & ModCDPNamedValue>(
    event_name: TEvent,
    listener: (event: CDPEventPayload<TEvent>, sessionId: string | null) => void,
  ): this;
  once<TName extends Extract<keyof CDPEventMapPayloads<TEvents>, string>>(
    event_name: TName,
    listener: (event: CDPEventMapPayloads<TEvents>[TName], sessionId: string | null) => void,
  ): this;
  once(event_name: string | symbol, listener: (...args: unknown[]) => void): this;
  once(event_name: CDPEventNameInput, listener: (...args: any[]) => void): this;
  once(event_name: CDPEventNameInput, listener: (...args: any[]) => void) {
    return super.once(this.types.normalizeEventName(event_name), listener);
  }

  off<TEvent extends z.ZodType & ModCDPNamedValue>(
    event_name: TEvent,
    listener: (event: CDPEventPayload<TEvent>, sessionId: string | null) => void,
  ): this;
  off(event_name: string | symbol, listener: (...args: unknown[]) => void): this;
  off(event_name: CDPEventNameInput, listener: (...args: any[]) => void): this;
  off(event_name: CDPEventNameInput, listener: (...args: any[]) => void) {
    return super.off(this.types.normalizeEventName(event_name), listener);
  }

  _waitForEvent(event_name: CDPEventNameInput, { timeout_ms }: { timeout_ms?: number } = {}) {
    const effective_timeout_ms = timeout_ms ?? this.client_options.client_event_wait_timeout_ms;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let cancel: () => void = () => {};
    let listener: (...args: unknown[]) => void = () => {};
    const promise = new Promise((resolve) => {
      const cleanup = () => {
        if (timeout != null) clearTimeout(timeout);
        timeout = null;
        this.off(event_name, listener);
        this.event_wait_cleanups.delete(cancel);
      };
      const finish = (value: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      cancel = () => finish(null);
      listener = (payload) => finish(payload || {});
      this.event_wait_cleanups.add(cancel);
      this.on(event_name, listener);
      timeout = setTimeout(() => finish(null), effective_timeout_ms);
    });
    return { promise, cancel };
  }

  async _measurePingLatency() {
    const sent_at = Date.now();
    const pong = this._waitForEvent("Mod.pong");
    try {
      await this.send("Mod.ping", { sent_at });
      const payload = (await pong.promise) as ModCDPPongEvent | null;
      if (payload == null) return this.latency;
      const returned_at = Date.now();
      this.latency = {
        sent_at,
        received_at: payload.received_at ?? null,
        returned_at,
        round_trip_ms: returned_at - sent_at,
        service_worker_ms: typeof payload.received_at === "number" ? payload.received_at - sent_at : null,
        return_path_ms: typeof payload.received_at === "number" ? returned_at - payload.received_at : null,
      };
      return this.latency;
    } finally {
      pong.cancel();
    }
  }

  _onRecv(msg: CdpResponseMessage | CdpEventMessage) {
    if ("id" in msg && typeof msg.id === "number") {
      return;
    }
    if (!("method" in msg) || typeof msg.method !== "string") return;
    const method = msg.method;
    const sessionId = typeof msg.sessionId === "string" ? msg.sessionId : null;
    const event = msg;
    const eventParams = (event.params || {}) as ProtocolPayload;
    const extension_session_id = this.injector?.session_id ?? null;
    if (sessionId === extension_session_id) {
      if (method !== Runtime.BindingCalledEvent.id) return;
      const u = unwrapEventIfNeeded(method, eventParams as RuntimeBindingCalledEvent, sessionId, extension_session_id);
      if (u) {
        const payload = this.types.parseEventPayload(u.event, u.data);
        this.emit(u.event, payload, u.sessionId);
      }
      return;
    }
    if (method) {
      const payload = this.types.parseEventPayload(method, eventParams);
      this.emit(method, payload, sessionId);
    }
  }
}

type ModCDPClient<TCommands extends CDPCommandMap = {}, TEvents extends CDPEventMap = {}> = ModCDPClientBase<
  TCommands,
  TEvents
> &
  Omit<CdpAliases<TCommands, TEvents>, "types">;

const ModCDPClient = ModCDPClientBase as unknown as {
  new <TCommands extends CDPCommandMap = {}, TEvents extends CDPEventMap = {}>(
    options?: ClientOptions<TCommands, TEvents>,
  ): ModCDPClient<TCommands, TEvents>;
};

export {
  ModCDPClient,
  DEFAULT_CDP_SEND_TIMEOUT_MS,
  DEFAULT_EVENT_WAIT_TIMEOUT_MS,
  DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS,
  DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS,
  DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS,
  DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS,
  DEFAULT_CLIENT_HEARTBEAT_INTERVAL_MS,
  upstream_transport_constructors,
  browser_launcher_constructors,
  extension_injector_constructors,
};
export type { ClientOptions };
export type { CdpAliases } from "../types/generated/aliases.js";
export type { ModCDPClientOptions } from "../types/modcdp.js";
