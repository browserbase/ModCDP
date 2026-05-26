// ModCDPClient (JS): importable, no CLI, no demo code.
//
// Constructor option groups mirror the owning runtime components:
//   launcher          browser/session creation and cleanup
//   upstream          message transport to either raw CDP or a ModCDP server
//   injector          raw-CDP extension discovery/injection/borrowing
//   client            client-side routing, alias hydration, event mirroring, send/event timeouts
//   server            ModCDPServer.configure params
//
// Public methods: connect, send(method, params), on(event, handler), close.

// oxlint-disable typescript-eslint/no-unsafe-declaration-merging -- alias members are assigned by connect().
import type { z } from "zod";

import type { CdpAliases } from "../types/generated/aliases.js";
export type { CdpAliases } from "../types/generated/aliases.js";
import * as Runtime from "../types/generated/zod/Runtime.js";
import {
  CUSTOM_EVENT_BINDING_NAME,
  UPSTREAM_EVENT_BINDING_NAME,
  wrapCommandIfNeeded,
  unwrapResponseIfNeeded,
  unwrapEventIfNeeded,
} from "../translate/translate.js";
import {
  type UpstreamOptions,
  type UpstreamTransport,
} from "../transport/UpstreamTransport.js";
import {
  CDPTypes,
  type CDPCommandAliases,
  type CDPCommandMap,
  type CDPEventMap,
  type CDPEventMapPayloads,
  type CDPEventNameInput,
  type CDPEventPayload,
  type CDPTypesOptions,
} from "../types/CDPTypes.js";
import { ChromeDebuggerUpstreamTransport } from "../transport/ChromeDebuggerUpstreamTransport.js";
import { NativeMessagingUpstreamTransport } from "../transport/NativeMessagingUpstreamTransport.js";
import { NATSUpstreamTransport } from "../transport/NATSUpstreamTransport.js";
import { PipeUpstreamTransport } from "../transport/PipeUpstreamTransport.js";
import { ReverseWSUpstreamTransport } from "../transport/ReverseWSUpstreamTransport.js";
import { WSUpstreamTransport } from "../transport/WSUpstreamTransport.js";
import {
  AutoSessionRouter,
  type AutoSessionRouterOptions,
} from "../router/AutoSessionRouter.js";
import {
  BrowserLauncher,
  type LauncherOptions,
} from "../launcher/BrowserLauncher.js";
import { BBBrowserLauncher } from "../launcher/BBBrowserLauncher.js";
import { LocalBrowserLauncher } from "../launcher/LocalBrowserLauncher.js";
import { NoneBrowserLauncher } from "../launcher/NoneBrowserLauncher.js";
import { RemoteBrowserLauncher } from "../launcher/RemoteBrowserLauncher.js";
import {
  ExtensionInjector,
  type InjectorOptions,
  type SendCDP,
} from "../injector/ExtensionInjector.js";
import { BBExtensionInjector } from "../injector/BBExtensionInjector.js";
import { BorrowExtensionInjector } from "../injector/BorrowExtensionInjector.js";
import { DiscoverExtensionInjector } from "../injector/DiscoverExtensionInjector.js";
import { CDPExtensionInjector } from "../injector/CDPExtensionInjector.js";
import { CLIExtensionInjector } from "../injector/CLIExtensionInjector.js";
import type {
  CdpEventMessage,
  CdpResponseMessage,
  RuntimeBindingCalledEvent,
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
import { Mod, normalizeModCDPName } from "../types/modcdp.js";

export const DEFAULT_CDP_SEND_TIMEOUT_MS = 10_000;
export const DEFAULT_EVENT_WAIT_TIMEOUT_MS = 10_000;
export const DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS = 10_000;
export const DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS = 10_000;
export const DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS = 60_000;
export const DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS = 100;
export const DEFAULT_CLIENT_HEARTBEAT_INTERVAL_MS = 250;

export type ClientConfigOptions = {
  client_hydrate_aliases?: boolean;
  client_mirror_upstream_events?: boolean;
  client_cdp_send_timeout_ms?: number;
  client_event_wait_timeout_ms?: number;
  client_heartbeat_interval_ms?: number;
};
export type ClientRouterOptions = ModCDPRouterOptions &
  Pick<
    Partial<AutoSessionRouterOptions>,
    "loopback_execution_context_timeout_ms"
  >;
export type ClientOptions<
  TCommands extends CDPCommandMap = Record<never, never>,
  TEvents extends CDPEventMap = Record<never, never>,
> = {
  launcher?: LauncherOptions;
  upstream?: UpstreamOptions;
  injector?: InjectorOptions;
  router?: ClientRouterOptions;
  client?: ClientConfigOptions;
  server?: ModCDPServerOptions | null;
  types?: CDPTypesOptions<TCommands, TEvents> | CDPTypes<TCommands, TEvents>;
};
type ClientConfig = Required<ClientConfigOptions>;
export type ModCDPClientInstance<
  TCommands extends CDPCommandMap = Record<never, never>,
  TEvents extends CDPEventMap = Record<never, never>,
> = ModCDPClientBase<TCommands, TEvents> &
  Omit<CdpAliases, "types"> &
  CDPCommandAliases<TCommands>;

class ModCDPEventEmitter {
  private listeners = new Map<
    string | symbol,
    Set<(...args: unknown[]) => void>
  >();

  on(event_name: string | symbol, listener: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event_name);
    if (listeners) listeners.add(listener);
    else this.listeners.set(event_name, new Set([listener]));
    return this;
  }

  once(event_name: string | symbol, listener: (...args: unknown[]) => void) {
    const wrapped = (...args: unknown[]) => {
      this.listeners.get(event_name)?.delete(wrapped);
      listener(...args);
    };
    return this.on(event_name, wrapped);
  }

  off(event_name: string | symbol, listener: (...args: unknown[]) => void) {
    this.listeners.get(event_name)?.delete(listener);
    return this;
  }

  emit(event_name: string | symbol, ...args: unknown[]) {
    for (const listener of this.listeners.get(event_name) ?? [])
      listener(...args);
    if (event_name !== "*") {
      for (const listener of this.listeners.get("*") ?? [])
        listener(event_name, ...args);
    }
    return true;
  }
}

export class ModCDPClientBase<
  TCommands extends CDPCommandMap = Record<never, never>,
  TEvents extends CDPEventMap = Record<never, never>,
> extends ModCDPEventEmitter {
  // setup options
  launcher: BrowserLauncher;
  upstream: UpstreamTransport;
  injector: ExtensionInjector | null;
  router: AutoSessionRouter;
  client: ClientConfig;
  server: ModCDPServerOptions | null;

  // runtime state
  types: CDPTypes<TCommands, TEvents>;
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
    client = {},
    server = {},
    types = {},
  }: ClientOptions<TCommands, TEvents> = {}) {
    super();
    switch (upstream.upstream_mode) {
      case undefined:
        throw new Error("upstream.upstream_mode must be set explicitly");
        // Auto mode, might support eventually...
        break;
      case "ws":
        this.upstream = new WSUpstreamTransport(upstream);
        break;
      case "pipe":
        this.upstream = new PipeUpstreamTransport(upstream);
        break;
      case "reversews":
        this.upstream = new ReverseWSUpstreamTransport(upstream);
        break;
      case "nativemessaging":
        this.upstream = new NativeMessagingUpstreamTransport(upstream);
        break;
      case "nats":
        this.upstream = new NATSUpstreamTransport(upstream);
        break;
      case "chrome_debugger":
        this.upstream = new ChromeDebuggerUpstreamTransport(upstream);
        break;
      default:
        throw new Error(
          `unknown upstream.upstream_mode=${upstream.upstream_mode}`,
        );
    }
    switch (launcher.launcher_mode) {
      case undefined:
        throw new Error("launcher.launcher_mode must be set explicitly");
        // Auto mode, might support eventually:
        // if (this.upstream.upstream_mode === "pipe") {
        //   this.launcher = new LocalBrowserLauncher(launcher);
        // } else if (this.upstream.upstream_mode === "ws" && this.upstream.upstream_ws_cdp_url) {
        //   this.launcher = new RemoteBrowserLauncher(launcher);
        // } else if (this.upstream.upstream_mode === "ws") {
        //   this.launcher = new LocalBrowserLauncher(launcher);
        // } else {
        //   this.launcher = new NoneBrowserLauncher(launcher);
        // }
        break;
      case "local":
        this.launcher = new LocalBrowserLauncher(launcher);
        break;
      case "remote":
        this.launcher = new RemoteBrowserLauncher(launcher);
        break;
      case "bb":
        this.launcher = new BBBrowserLauncher(launcher);
        break;
      case "none":
        this.launcher = new NoneBrowserLauncher(launcher);
        break;
      default:
        throw new Error(
          `unknown launcher.launcher_mode=${launcher.launcher_mode}`,
        );
    }
    switch (injector.injector_mode) {
      case undefined:
        throw new Error("injector.injector_mode must be set explicitly");
        // Auto mode, might support eventually...
        break;
      case "cli":
        this.injector = new CLIExtensionInjector(injector);
        break;
      case "cdp":
        this.injector = new CDPExtensionInjector(injector);
        break;
      case "bb":
        this.injector = new BBExtensionInjector(injector);
        break;
      case "discover":
        this.injector = new DiscoverExtensionInjector(injector);
        break;
      case "borrow":
        this.injector = new BorrowExtensionInjector(injector);
        break;
      case "none":
        this.injector = null;
        break;
      default:
        throw new Error(
          `unknown injector.injector_mode=${injector.injector_mode}`,
        );
    }
    this.client = {
      client_hydrate_aliases: client.client_hydrate_aliases ?? true,
      client_mirror_upstream_events:
        client.client_mirror_upstream_events ?? true,
      client_cdp_send_timeout_ms:
        client.client_cdp_send_timeout_ms ?? DEFAULT_CDP_SEND_TIMEOUT_MS,
      client_event_wait_timeout_ms:
        client.client_event_wait_timeout_ms ?? DEFAULT_EVENT_WAIT_TIMEOUT_MS,
      client_heartbeat_interval_ms:
        client.client_heartbeat_interval_ms ??
        DEFAULT_CLIENT_HEARTBEAT_INTERVAL_MS,
    };
    this.upstream.update({
      upstream_cdp_send_timeout_ms: this.client.client_cdp_send_timeout_ms,
    });
    this.server =
      server === null
        ? null
        : {
            ...(this.upstream.upstream_mode === "nativemessaging" ||
            this.upstream.upstream_mode === "reversews" ||
            this.upstream.upstream_mode === "nats"
              ? { router: { router_routes: { "*.*": "chrome_debugger" } } }
              : {}),
            ...(server ?? {}),
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
        injector.injector_execution_context_timeout_ms ??
        DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS,
    });
    if (this.client.client_hydrate_aliases)
      this.types.installAliases(this, (method, params) =>
        this.send(method, params),
      );
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
      if (this.server !== null) {
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

    if (
      this.upstream.upstream_mode === "chrome_debugger" ||
      (this.injector == null && this.server === null)
    ) {
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
      throw new Error(
        "injector.injector_mode=none cannot be used with an extension-routed browser upstream.",
      );
    }
    const injector = this.injector;
    await this._runInjector((method, params, session_id) =>
      this.upstream.send(method, params, session_id, {
        timeout_ms: this.client.client_cdp_send_timeout_ms,
      }),
    );
    const injector_completed_at = Date.now();

    if (injector.target_id == null || injector.session_id == null) {
      throw new Error(
        `${injector.constructor.name} did not record a ModCDP extension target.`,
      );
    }
    const ext_context = this.router.waitForExecutionContext(
      injector.session_id,
      {
        timeout_ms: injector.injector_execution_context_timeout_ms,
      },
    );
    await this.upstream.send(
      Runtime.EnableCommand,
      {},
      { targetId: injector.target_id, sessionId: injector.session_id },
    );
    injector.execution_context_id = await ext_context;
    await Promise.all([
      this.upstream.send(
        Runtime.AddBindingCommand,
        { name: CUSTOM_EVENT_BINDING_NAME },
        { targetId: injector.target_id, sessionId: injector.session_id },
      ),
      this.client.client_mirror_upstream_events
        ? this.upstream.send(
            Runtime.AddBindingCommand,
            { name: UPSTREAM_EVENT_BINDING_NAME },
            { targetId: injector.target_id, sessionId: injector.session_id },
          )
        : Promise.resolve(),
    ]);
    if (this.server !== null) {
      await this.send("Mod.configure", this._serverConfigureParams());
    }
    // MV3 service workers cannot run arbitrary extension code through normal page eval paths.
    // Run the offscreen keepalive startup through the configured upstream CDP route, which
    // executes Runtime.callFunctionOn inside the service worker execution context.
    await this.send(
      "Mod.evaluate",
      Mod.EvaluateParams.parse({
        expression: "ModCDP.ensureOffscreenKeepAlive()",
      }),
    );

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

  async send(
    method: string,
    params: unknown = {},
    session_id: string | null = null,
  ) {
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
      this.types.installCustomCommandAlias(
        this,
        prepared.custom_command_name,
        (alias_method, alias_params) => this.send(alias_method, alias_params),
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
      const result = await this.upstream.send(
        method,
        command_params as ProtocolParams,
        null,
        {
          timeout_ms: this.client.client_cdp_send_timeout_ms,
        },
      );
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
    if (
      this.upstream.upstream_mode === "chrome_debugger" ||
      (this.injector == null && this.server === null)
    ) {
      const result = await this.router.send(
        method,
        command_params as ProtocolParams,
        session_id,
      );
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
    const command = wrapCommandIfNeeded(
      method,
      command_params as ProtocolParams,
      {
        routes: this.router.router_routes,
        cdpSessionId: session_id,
      },
    );
    let result: ProtocolResult = {};
    let unwrap = null;
    if (command.target === "direct_cdp") {
      const [step] = command.steps;
      result = await this.router.send(
        step.method,
        step.params ?? {},
        step.sessionId ?? null,
      );
      unwrap = step.unwrap ?? null;
    } else if (command.target === "service_worker") {
      const injector = this.injector;
      if (injector == null || injector.session_id == null) {
        throw new Error(
          "service_worker commands require an injected ModCDP extension target.",
        );
      }
      for (const step of command.steps) {
        const step_params = step.params ?? {};
        if (step.method === Runtime.CallFunctionOnCommand.id) {
          const existing_execution_context_id =
            step_params &&
            typeof step_params === "object" &&
            "executionContextId" in step_params &&
            typeof step_params.executionContextId === "number"
              ? step_params.executionContextId
              : null;
          const executionContextId =
            existing_execution_context_id ??
            injector.execution_context_id ??
            (await this.router.waitForExecutionContext(injector.session_id, {
              timeout_ms:
                this.injector?.injector_execution_context_timeout_ms ??
                DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS,
            }));
          result = await this.upstream.send(
            Runtime.CallFunctionOnCommand.id,
            this.types.parseCommandParams(Runtime.CallFunctionOnCommand.id, {
              ...step_params,
              executionContextId,
            }),
            injector.session_id,
            {
              timeout_ms: this.client.client_cdp_send_timeout_ms,
            },
          );
        } else {
          result = await this.upstream.send(
            step.method,
            step_params,
            injector.session_id,
            {
              timeout_ms: this.client.client_cdp_send_timeout_ms,
            },
          );
        }
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
    return {
      server: {
        ...this._serverDefaults(),
        ...this.launcher.configForServer(this.upstream),
        ...(this.server ?? {}),
      },
      custom_commands: this.types.customCommandWireRegistrations({
        expression_required: true,
      }),
      custom_events: this.types.customEventWireRegistrations(),
      custom_middlewares: this.types.customMiddlewareWireRegistrations(),
    };
  }

  _serverDefaults(): ModCDPServerOptions {
    return {
      server_cdp_send_timeout_ms: this.client.client_cdp_send_timeout_ms,
      server_loopback_execution_context_timeout_ms:
        this.injector?.injector_execution_context_timeout_ms ??
        DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS,
      server_ws_connect_error_settle_timeout_ms:
        this.upstream.upstream_ws_connect_error_settle_timeout_ms,
      server_downstream_client_timeout_ms: Math.max(
        this.client.client_heartbeat_interval_ms * 4,
        1_000,
      ),
    };
  }

  async _connectUpstreamTransport() {
    const launcher = this.launcher;
    const transport = this.upstream;
    if (this.injector) {
      this.injector.update({
        injector_cdp_send_timeout_ms: this.client.client_cdp_send_timeout_ms,
      });
      await this.injector.prepare();
      launcher.update(this.injector.configForLauncher());
      transport.update(this.injector.configForUpstream());
    }
    launcher.update(transport.configForLauncher());
    launcher.update({
      launcher_local_loopback_cdp:
        this.server != null &&
        !this.server.server_loopback_cdp_url &&
        this.server.router?.router_routes?.["*.*"] === "loopback_cdp",
    });
    transport.update(launcher.configForUpstream());

    if (
      this.upstream.upstream_mode === "nativemessaging" ||
      this.upstream.upstream_mode === "reversews" ||
      this.upstream.upstream_mode === "nats" ||
      this.upstream.upstream_mode === "chrome_debugger"
    )
      await transport.connect();
    if (launcher.launcher_mode !== "none") {
      await launcher.launch();
      transport.update(launcher.configForUpstream());
      if (this.injector) transport.update(this.injector.configForUpstream());
    }
    if (
      this.upstream.upstream_mode === "ws" ||
      this.upstream.upstream_mode === "pipe"
    )
      await transport.connect();

    if (this.upstream.upstream_mode === "ws" && transport.upstream_ws_cdp_url)
      this.upstream.upstream_ws_cdp_url = transport.upstream_ws_cdp_url;
  }

  async _runInjector(send: SendCDP) {
    if (this.injector == null)
      throw new Error(
        "injector.injector_mode=none cannot inject an extension.",
      );
    const injector = this.injector;
    injector.update({
      send,
      injector_cdp_send_timeout_ms: this.client.client_cdp_send_timeout_ms,
    });
    try {
      await injector.prepare();
      const result = await injector.inject();
      if (result) {
        injector.recordInjectionResult(result);
        return result;
      }
    } catch (error) {
      injector.last_error =
        error instanceof Error ? error : new Error(String(error));
      throw error;
    }
    throw new Error(
      `${injector.constructor.name} did not return a ModCDP extension target.`,
    );
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
    if (this.server?.server_close_browser_on_downstream_disconnect !== true)
      return;
    const interval_ms = this.client.client_heartbeat_interval_ms;
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
    listener: (
      event: CDPEventPayload<TEvent>,
      sessionId: string | null,
    ) => void,
  ): this;
  on<TName extends Extract<keyof CDPEventMapPayloads<TEvents>, string>>(
    event_name: TName,
    listener: (
      event: CDPEventMapPayloads<TEvents>[TName],
      sessionId: string | null,
    ) => void,
  ): this;
  on(event_name: string | symbol, listener: (...args: unknown[]) => void): this;
  on(event_name: CDPEventNameInput, listener: (...args: any[]) => void): this;
  on(event_name: CDPEventNameInput, listener: (...args: any[]) => void) {
    return super.on(this.types.normalizeEventName(event_name), listener);
  }

  once<TEvent extends z.ZodType & ModCDPNamedValue>(
    event_name: TEvent,
    listener: (
      event: CDPEventPayload<TEvent>,
      sessionId: string | null,
    ) => void,
  ): this;
  once<TName extends Extract<keyof CDPEventMapPayloads<TEvents>, string>>(
    event_name: TName,
    listener: (
      event: CDPEventMapPayloads<TEvents>[TName],
      sessionId: string | null,
    ) => void,
  ): this;
  once(
    event_name: string | symbol,
    listener: (...args: unknown[]) => void,
  ): this;
  once(event_name: CDPEventNameInput, listener: (...args: any[]) => void): this;
  once(event_name: CDPEventNameInput, listener: (...args: any[]) => void) {
    return super.once(this.types.normalizeEventName(event_name), listener);
  }

  off<TEvent extends z.ZodType & ModCDPNamedValue>(
    event_name: TEvent,
    listener: (
      event: CDPEventPayload<TEvent>,
      sessionId: string | null,
    ) => void,
  ): this;
  off(
    event_name: string | symbol,
    listener: (...args: unknown[]) => void,
  ): this;
  off(event_name: CDPEventNameInput, listener: (...args: any[]) => void): this;
  off(event_name: CDPEventNameInput, listener: (...args: any[]) => void) {
    return super.off(this.types.normalizeEventName(event_name), listener);
  }

  _waitForEvent(
    event_name: CDPEventNameInput,
    { timeout_ms }: { timeout_ms?: number } = {},
  ) {
    const effective_timeout_ms =
      timeout_ms ?? this.client.client_event_wait_timeout_ms;
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
        service_worker_ms:
          typeof payload.received_at === "number"
            ? payload.received_at - sent_at
            : null,
        return_path_ms:
          typeof payload.received_at === "number"
            ? returned_at - payload.received_at
            : null,
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
      const u = unwrapEventIfNeeded(
        method,
        eventParams as RuntimeBindingCalledEvent,
        sessionId,
        extension_session_id,
      );
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

export type ModCDPClient<
  TCommands extends CDPCommandMap = Record<never, never>,
  TEvents extends CDPEventMap = Record<never, never>,
> = ModCDPClientInstance<TCommands, TEvents>;

export type ModCDPClientConstructor = {
  new <
    TCommands extends CDPCommandMap = Record<never, never>,
    TEvents extends CDPEventMap = Record<never, never>,
  >(
    options?: ClientOptions<TCommands, TEvents>,
  ): ModCDPClientInstance<TCommands, TEvents>;
};

const ModCDPClient = ModCDPClientBase as ModCDPClientConstructor;
export { ModCDPClient };
