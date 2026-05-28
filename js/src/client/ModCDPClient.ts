// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/client/ModCDPClient.py
// - ./go/modcdp/client/ModCDPClient.go
// ModCDPClient (JS): importable, no CLI, no demo code.
//
// Constructor config groups mirror the owning runtime components:
//   launcher          browser/session creation and cleanup
//   upstream          message transport to either raw CDP or a ModCDP server
//   injector          raw-CDP extension discovery/injection
//   client            client-side routing, alias hydration, event mirroring, send/event timeouts
//   server_config    ModCDPServer.configure params
//
// Public methods: connect, send(method, params), on(event, handler), close.

// oxlint-disable typescript-eslint/no-unsafe-declaration-merging -- alias members are assigned by connect().
import type { z } from "zod";

import type { CdpAliases, CdpCommandAliases } from "../types/generated/aliases.js";
import * as Runtime from "../types/generated/zod/Runtime.js";
import {
  CUSTOM_EVENT_BINDING_NAME,
  UPSTREAM_EVENT_BINDING_NAME,
  wrapCommandIfNeeded,
  unwrapResponseIfNeeded,
  unwrapEventIfNeeded,
} from "../translate/translate.js";
import { type UpstreamTransportConfig, UpstreamTransport } from "../transport/UpstreamTransport.js";
import {
  CDPTypes,
  type CDPCommandMap,
  type CDPEventMap,
  type CDPEventMapPayloads,
  type CDPEventNameInput,
  type CDPEventPayload,
  type CDPTypesConfig,
} from "../types/CDPTypes.js";
import { WSUpstreamTransport } from "../transport/WSUpstreamTransport.js";
import { AutoSessionRouter, DEFAULT_CLIENT_ROUTER_ROUTES } from "../router/AutoSessionRouter.js";
import { BrowserLauncher, type LauncherConfig } from "../launcher/BrowserLauncher.js";
import { NoneBrowserLauncher } from "../launcher/NoneBrowserLauncher.js";
import {
  ExtensionInjector,
  InjectorConfigSchema,
  type InjectorConfig,
  type SendCDP,
} from "../injector/ExtensionInjector.js";
import {
  ModCDPClientConfigSchema,
  ModCDPConfigureParamsSchema,
  ModCDPLauncherConfigSchema,
  ModCDPServerConfigSchema,
  ModCDPRouterConfigSchema,
  ModCDPUpstreamConfigSchema,
} from "../types/modcdp.js";
import { modCDPToJSON } from "../types/toJSON.js";
import type {
  CdpEventMessage,
  CdpResponseMessage,
  RuntimeBindingCalledEvent,
  ModCDPConfigureParams,
  ModCDPServerConfig,
  ModCDPNamedValue,
  ModCDPPingLatency,
  ModCDPPongEvent,
  ProtocolPayload,
  ProtocolParams,
  ProtocolResult,
} from "../types/modcdp.js";

type ModCDPClientConfig<TCommands extends CDPCommandMap = {}, TEvents extends CDPEventMap = {}> = {
  launcher?: LauncherConfig;
  upstream?: UpstreamTransportConfig;
  injector?: z.input<typeof InjectorConfigSchema>;
  router?: z.input<typeof ModCDPRouterConfigSchema>;
  client_config?: z.input<typeof ModCDPClientConfigSchema>;
  server_config?: z.input<typeof ModCDPServerConfigSchema> | null;
  types?: CDPTypesConfig<TCommands, TEvents> | CDPTypes<TCommands, TEvents>;
};
type UpstreamTransportConstructor = new (config?: Record<string, unknown>) => UpstreamTransport;
type ExtensionInjectorConstructor = new (config?: Record<string, unknown>) => ExtensionInjector;
const upstream_transport_constructors = new Map<string, UpstreamTransportConstructor>([["ws", WSUpstreamTransport]]);

const browser_launcher_constructors = new Map<NonNullable<LauncherConfig["launcher_mode"]>, typeof BrowserLauncher>([
  ["none", NoneBrowserLauncher],
]);

const extension_injector_constructors = new Map<string, ExtensionInjectorConstructor>();

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

export class ModCDPClient<
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
  config: z.infer<typeof ModCDPClientConfigSchema>;
  server_config: ModCDPServerConfig | null;

  // runtime state
  event_wait_cleanups: Set<() => void>;
  heartbeat_timer: ReturnType<typeof setInterval> | null;
  latency: ModCDPPingLatency | null;
  connect_timing: Record<string, unknown> | null;
  last_command_timing: Record<string, unknown> | null;
  private readonly on_upstream_recv: (message: CdpResponseMessage | CdpEventMessage) => void;
  private readonly on_upstream_close: (error: Error) => void;

  constructor({
    launcher = {},
    upstream = {},
    injector = {},
    router = {},
    client_config = {},
    server_config = {},
    types = {},
  }: ModCDPClientConfig<TCommands, TEvents> = {}) {
    super();
    const raw_upstream = upstream as Record<string, unknown>;
    const upstream_mode_input = typeof raw_upstream.upstream_mode === "string" ? raw_upstream.upstream_mode : "ws";
    if (upstream_mode_input !== "ws" && !upstream_transport_constructors.has(upstream_mode_input)) {
      throw new Error(`unknown upstream_mode=${upstream_mode_input}`);
    }
    const upstream_config =
      upstream_mode_input === "ws" || !upstream_transport_constructors.has(upstream_mode_input)
        ? ModCDPUpstreamConfigSchema.parse(upstream)
        : raw_upstream;
    const launcher_config = ModCDPLauncherConfigSchema.parse(launcher);
    const raw_injector = injector as Record<string, unknown>;
    const injector_mode_input = typeof raw_injector.injector_mode === "string" ? raw_injector.injector_mode : "none";
    const injector_config =
      injector_mode_input === "none" ||
      ["cli", "cdp", "bb", "discover"].includes(injector_mode_input) ||
      !extension_injector_constructors.has(injector_mode_input)
        ? InjectorConfigSchema.parse(injector)
        : raw_injector;
    const router_config = ModCDPRouterConfigSchema.parse({
      ...router,
      router_routes: {
        ...DEFAULT_CLIENT_ROUTER_ROUTES,
        ...(router.router_routes ?? {}),
      },
    });
    const parsed_client_config = ModCDPClientConfigSchema.parse(client_config);
    const parsed_server_config = server_config === null ? null : ModCDPServerConfigSchema.parse(server_config ?? {});
    const upstream_mode = upstream_config.upstream_mode as string;
    const launcher_mode = launcher_config.launcher_mode;
    const injector_mode = injector_config.injector_mode as string;
    const Upstream = upstream_transport_constructors.get(upstream_mode);
    if (!Upstream) throw new Error(`unknown upstream_mode=${upstream_mode}`);
    this.upstream = new Upstream(upstream_config);

    const Launcher = browser_launcher_constructors.get(launcher_mode);
    if (!Launcher) throw new Error(`unknown launcher_mode=${launcher_mode}`);
    this.launcher = new Launcher(launcher_config);

    if (injector_mode === "none") this.injector = null;
    else {
      const Injector = extension_injector_constructors.get(injector_mode);
      if (!Injector) throw new Error(`unknown injector.injector_mode=${injector_mode}`);
      this.injector = new Injector(injector_config);
    }
    this.config = parsed_client_config;
    this.upstream.update({
      upstream_cdp_send_timeout_ms: this.config.client_cdp_send_timeout_ms,
    });
    this.server_config = parsed_server_config === null ? null : parsed_server_config;
    this.types = types instanceof CDPTypes ? types : new CDPTypes(types);

    this.latency = null;
    this.connect_timing = null;
    this.last_command_timing = null;
    this.event_wait_cleanups = new Set();
    this.heartbeat_timer = null;
    this.on_upstream_recv = (message) => this._onRecv(message);
    this.on_upstream_close = (error) => {
      this._stopHeartbeat();
      this.emit("error", error);
    };
    this.router = new AutoSessionRouter({
      ...router_config,
      upstream: this.upstream,
      types: this.types,
    });
    if (this.config.client_hydrate_aliases)
      this.types.installAliases(this, (method, params) => this.send(method, params));
  }

  toJSON() {
    return modCDPToJSON(this, {
      config: { client_config: this.config, server_config: this.server_config },
      state: {
        event_wait_cleanups: this.event_wait_cleanups.size,
        heartbeat_timer: this.heartbeat_timer != null,
        latency: this.latency?.round_trip_ms ?? null,
        connected: this.connect_timing != null,
      },
      children: {
        launcher: this.launcher,
        upstream: this.upstream,
        injector: this.injector,
        router: this.router,
        types: this.types,
      },
    });
  }

  configure({
    upstream,
    router,
    client_config,
    server_config,
  }: Pick<ModCDPClientConfig<TCommands, TEvents>, "upstream" | "router" | "client_config" | "server_config"> = {}) {
    if (client_config !== undefined) {
      this.config = ModCDPClientConfigSchema.parse({ ...this.config, ...client_config });
    }
    this.upstream.update({
      upstream_cdp_send_timeout_ms: this.config.client_cdp_send_timeout_ms,
    });
    if (upstream !== undefined) {
      const upstream_mode =
        typeof (upstream as { upstream_mode?: unknown }).upstream_mode === "string"
          ? (upstream as { upstream_mode: string }).upstream_mode
          : this.upstream.config.upstream_mode;
      if (upstream_mode !== this.upstream.config.upstream_mode) {
        const Upstream = upstream_transport_constructors.get(upstream_mode);
        if (!Upstream) throw new Error(`unknown upstream_mode=${upstream_mode}`);
        const previous_upstream = this.upstream;
        this.upstream = new Upstream(upstream);
        this.upstream.update({
          upstream_cdp_send_timeout_ms: this.config.client_cdp_send_timeout_ms,
        });
        this.router.stop();
        this.router = new AutoSessionRouter({
          ...this.router.config,
          upstream: this.upstream,
          types: this.types,
        });
        void previous_upstream.close();
      } else {
        this.upstream.update(upstream);
      }
    }
    if (router !== undefined) {
      this.router.config = ModCDPRouterConfigSchema.parse({
        ...this.router.config,
        ...router,
        router_routes: {
          ...this.router.config.router_routes,
          ...(router.router_routes ?? {}),
        },
      });
    }
    if (server_config !== undefined) {
      const parsed_server_config = server_config === null ? null : ModCDPServerConfigSchema.parse(server_config);
      this.server_config = parsed_server_config;
    }
    if (this.config.client_hydrate_aliases)
      this.types.installAliases(this, (method, params) => this.send(method, params));
    return this;
  }

  async connect() {
    const connect_started_at = Date.now();

    const transport_started_at = Date.now();
    await this._connectUpstreamTransport();
    const transport_connected_at = Date.now();
    this.upstream.onRecv(this.on_upstream_recv);
    this.upstream.onClose(this.on_upstream_close);

    if (this.injector == null && this.server_config === null) {
      const connected_at = Date.now();
      this.connect_timing = {
        started_at: connect_started_at,
        upstream_mode: this.upstream.config.upstream_mode,
        transport_started_at,
        transport_connected_at,
        transport_duration_ms: transport_connected_at - transport_started_at,
        connected_at,
        duration_ms: connected_at - connect_started_at,
      };
      return this;
    }

    if (this.upstream.peer_kind === "modcdp_server") {
      const configure_started_at = Date.now();
      if (this.server_config !== null) await this.upstream.send("Mod.configure", this._serverConfigureParams());
      const configure_completed_at = Date.now();
      this._startHeartbeat();
      void this._measurePingLatency().catch(() => {});
      const connected_at = Date.now();
      this.connect_timing = {
        started_at: connect_started_at,
        upstream_mode: this.upstream.config.upstream_mode,
        transport_started_at,
        transport_connected_at,
        transport_duration_ms: transport_connected_at - transport_started_at,
        configure_started_at,
        configure_completed_at,
        configure_duration_ms: configure_completed_at - configure_started_at,
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
        timeout_ms: this.config.client_cdp_send_timeout_ms,
      }),
    );
    const injector_completed_at = Date.now();

    if (injector.target_id == null || injector.session_id == null) {
      throw new Error(`${injector.constructor.name} did not record a ModCDP extension target.`);
    }
    await this.router.send(Runtime.EnableCommand.id, {}, injector.session_id);
    await Promise.all([
      this.router.send(Runtime.AddBindingCommand.id, { name: CUSTOM_EVENT_BINDING_NAME }, injector.session_id),
      this.config.client_mirror_upstream_events
        ? this.router.send(Runtime.AddBindingCommand.id, { name: UPSTREAM_EVENT_BINDING_NAME }, injector.session_id)
        : Promise.resolve(),
    ]);
    if (this.server_config !== null) {
      await this.send("Mod.configure", this._serverConfigureParams());
    }

    this._startHeartbeat();
    void this._measurePingLatency().catch(() => {});
    const connected_at = Date.now();
    this.connect_timing = {
      started_at: connect_started_at,
      upstream_mode: this.upstream.config.upstream_mode,
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

  async send(method: string, params: unknown = {}, session_id: string | null = null): Promise<Record<string, unknown>> {
    const started_at = Date.now();
    const can_register_locally =
      this.upstream.peer_kind !== "modcdp_server" &&
      (method === "Mod.addCustomCommand" ||
        (method === "Mod.addCustomEvent" && !this.injector?.session_id) ||
        (method === "Mod.addMiddleware" && !this.injector?.session_id));
    const prepared = this.types.prepareCommand(method, params, can_register_locally);
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
    if (this.upstream.peer_kind === "modcdp_server") {
      const result = await this.upstream.send(method, command_params as ProtocolPayload, session_id, {
        timeout_ms: this.config.client_cdp_send_timeout_ms,
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
    if (this.injector == null && this.server_config === null) {
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
      routes: this.router.config.router_routes,
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
      const step = this.types.serviceWorkerCommandStep(method, command_params as ProtocolParams, session_id);
      result = await this.router.send(step.method, step.params ?? {}, injector.session_id);
      unwrap = step.unwrap ?? null;
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

  _serverConfigureParams(): z.input<typeof ModCDPConfigureParamsSchema> {
    const configured_server_config = this.server_config ?? {};
    const launcher_server_config = this.launcher.configForServer(this.upstream);
    const has_upstream_config = launcher_server_config.upstream != null || configured_server_config.upstream != null;
    const server_config = {
      ...launcher_server_config,
      ...configured_server_config,
      upstream: {
        ...(launcher_server_config.upstream ?? {}),
        ...(configured_server_config.upstream ?? {}),
      },
      router: {
        ...(launcher_server_config.router ?? {}),
        ...(configured_server_config.router ?? {}),
      },
      client_config: {
        ...(launcher_server_config.client_config ?? {}),
        ...(configured_server_config.client_config ?? {}),
      },
      downstream: {
        ...(launcher_server_config.downstream ?? {}),
        ...(configured_server_config.downstream ?? {}),
      },
    };
    const loopback_execution_context_timeout_ms = this.injector
      ? this.injector.config.injector_execution_context_timeout_ms
      : this.router.config.loopback_execution_context_timeout_ms;
    return {
      ...(has_upstream_config
        ? {
            upstream: {
              upstream_ws_connect_error_settle_timeout_ms:
                this.upstream.config.upstream_ws_connect_error_settle_timeout_ms,
              ...server_config.upstream,
            },
          }
        : {}),
      router: {
        ...(server_config.router ?? {}),
        loopback_execution_context_timeout_ms,
      },
      client_config: {
        client_cdp_send_timeout_ms: this.config.client_cdp_send_timeout_ms,
        ...(server_config.client_config ?? {}),
      },
      downstream: {
        downstream_client_timeout_ms: Math.max(this.config.client_heartbeat_interval_ms * 4, 1_000),
        ...(server_config.downstream ?? {}),
      },
      ...(server_config.server_browser_token !== undefined
        ? { server_browser_token: server_config.server_browser_token }
        : {}),
      custom_commands: this.types.customCommandWireRegistrations({
        expression_required: true,
      }),
      custom_events: this.types.customEventWireRegistrations(),
      custom_middlewares: this.types.customMiddlewareWireRegistrations(),
    };
  }

  async _connectUpstreamTransport() {
    const launcher = this.launcher;
    const transport = this.upstream;
    if (this.injector) {
      this.injector.update({
        injector_cdp_send_timeout_ms: this.config.client_cdp_send_timeout_ms,
      });
      await this.injector.prepare();
      launcher.update(this.injector.configForLauncher());
      transport.update(this.injector.configForUpstream());
    }
    launcher.update(transport.configForLauncher());
    launcher.update({
      launcher_local_loopback_cdp:
        this.server_config != null &&
        !this.server_config.upstream?.upstream_ws_cdp_url &&
        this.server_config.router?.router_routes?.["*.*"] === "loopback_cdp",
    });
    transport.update(launcher.configForUpstream());

    if (launcher.config.launcher_mode !== "none") {
      await launcher.launch();
      transport.update(launcher.configForUpstream());
      if (this.injector) transport.update(this.injector.configForUpstream());
    }
    const peer_wait_started_at = Date.now();
    await transport.connect();
    await transport.waitForPeer({ connected_after_ms: peer_wait_started_at });

    if (this.upstream.config.upstream_mode === "ws" && transport.config.upstream_ws_cdp_url)
      this.upstream.update({ upstream_ws_cdp_url: transport.config.upstream_ws_cdp_url });
  }

  async _runInjector(send: SendCDP) {
    if (this.injector == null) throw new Error("injector.injector_mode=none cannot inject an extension.");
    const injector = this.injector;
    injector.update({
      send,
      injector_cdp_send_timeout_ms: this.config.client_cdp_send_timeout_ms,
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
    if (this.server_config?.downstream?.downstream_close_browser_on_disconnect !== true) return;
    const interval_ms = this.config.client_heartbeat_interval_ms;
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
  on(event_name: CDPEventNameInput, listener: (...args: never[]) => void): this;
  on(event_name: CDPEventNameInput, listener: (...args: never[]) => void) {
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
  once(event_name: CDPEventNameInput, listener: (...args: never[]) => void): this;
  once(event_name: CDPEventNameInput, listener: (...args: never[]) => void) {
    return super.once(this.types.normalizeEventName(event_name), listener);
  }

  off<TEvent extends z.ZodType & ModCDPNamedValue>(
    event_name: TEvent,
    listener: (event: CDPEventPayload<TEvent>, sessionId: string | null) => void,
  ): this;
  off(event_name: string | symbol, listener: (...args: unknown[]) => void): this;
  off(event_name: CDPEventNameInput, listener: (...args: never[]) => void): this;
  off(event_name: CDPEventNameInput, listener: (...args: never[]) => void) {
    return super.off(this.types.normalizeEventName(event_name), listener);
  }

  _waitForEvent(event_name: CDPEventNameInput, { timeout_ms }: { timeout_ms?: number } = {}) {
    const effective_timeout_ms = timeout_ms ?? this.config.client_event_wait_timeout_ms;
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
    if (extension_session_id != null && sessionId === extension_session_id) {
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

export interface ModCDPClient<TCommands extends CDPCommandMap = {}, TEvents extends CDPEventMap = {}> extends Omit<
  CdpAliases,
  "types"
> {
  Custom: CdpCommandAliases<TCommands> extends { Custom: infer TCustom } ? TCustom : never;
}

export { upstream_transport_constructors, browser_launcher_constructors, extension_injector_constructors };
export type { ModCDPClientConfig };
export type { CdpAliases } from "../types/generated/aliases.js";
