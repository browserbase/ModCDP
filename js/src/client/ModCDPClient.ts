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

import { createCdpAliases, type CdpAliases } from "../types/generated/aliases.js";
export type { CdpAliases } from "../types/generated/aliases.js";
import { commands as nativeCommandSchemas, events as nativeEventSchemas } from "../types/generated/zod.js";
import type { CdpNamedSchema } from "../types/generated/zod/helpers.js";
import * as Runtime from "../types/generated/zod/Runtime.js";
import * as Target from "../types/generated/zod/Target.js";
import {
  CUSTOM_EVENT_BINDING_NAME,
  DEFAULT_CLIENT_ROUTES,
  UPSTREAM_EVENT_BINDING_NAME,
  wrapCommandIfNeeded,
  unwrapResponseIfNeeded,
  unwrapEventIfNeeded,
} from "../translate/translate.js";
import { type UpstreamOptions, type UpstreamTransport } from "../transport/UpstreamTransport.js";
import { ChromeDebuggerTransport } from "../transport/ChromeDebuggerTransport.js";
import { NativeMessagingUpstreamTransport } from "../transport/NativeMessagingUpstreamTransport.js";
import { NatsUpstreamTransport } from "../transport/NatsUpstreamTransport.js";
import { PipeUpstreamTransport } from "../transport/PipeUpstreamTransport.js";
import { ReverseWebSocketUpstreamTransport } from "../transport/ReverseWebSocketUpstreamTransport.js";
import { WebSocketUpstreamTransport } from "../transport/WebSocketUpstreamTransport.js";
import { AutoSessionRouter } from "../router/AutoSessionRouter.js";
import type {
  BrowserLaunchOptions,
  BrowserLauncher,
  LaunchedBrowser,
  LauncherMode,
  LauncherOptions,
} from "../launcher/BrowserLauncher.js";
import type {
  ExtensionInjector,
  ExtensionInjectorConfig,
  InjectorMode,
  InjectorOptions,
  SendCDP,
} from "../injector/ExtensionInjector.js";
import type {
  CdpEventMessage,
  CdpResponseMessage,
  RuntimeBindingCalledEvent,
  ModCDPConfigureParams,
  ModCDPServerOptions,
  ModCDPAddCustomCommandParams,
  ModCDPAddCustomEventObjectParams,
  ModCDPAddMiddlewareParams,
  ModCDPNamedValue,
  ModCDPPingLatency,
  ModCDPPongEvent,
  ModCDPRoutes,
  ProtocolPayload,
  ProtocolParams,
  ProtocolResult,
  TranslatedCommand,
} from "../types/modcdp.js";
import { CdpEventMessageSchema, Mod, normalizeModCDPName, normalizeModCDPPayloadSchema } from "../types/modcdp.js";

export const DEFAULT_CDP_SEND_TIMEOUT_MS = 10_000;
export const DEFAULT_EVENT_WAIT_TIMEOUT_MS = 10_000;
export const DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS = 10_000;
export const DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS = 10_000;
export const DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS = 60_000;
export const DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS = 100;
export const DEFAULT_TARGET_SESSION_POLL_INTERVAL_MS = 20;
export const DEFAULT_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS = 250;
export const DEFAULT_CLIENT_HEARTBEAT_INTERVAL_MS = 250;
export const DEFAULT_MODCDP_SERVICE_WORKER_URL_SUFFIXES = ["/modcdp/service_worker.js"];
export const DEFAULT_UPSTREAM_REVERSEWS_BIND = "127.0.0.1:29292";
export const DEFAULT_UPSTREAM_REVERSEWS_WAIT_TIMEOUT_MS = 10_000;
export const DEFAULT_UPSTREAM_NATS_WAIT_TIMEOUT_MS = 10_000;

const launcher_module_path: Record<LauncherMode, string> = {
  local: "../launcher/LocalBrowserLauncher.js",
  remote: "../launcher/RemoteBrowserLauncher.js",
  bb: "../launcher/BrowserbaseBrowserLauncher.js",
  none: "../launcher/NoopBrowserLauncher.js",
};
const injector_module_path: Record<Exclude<InjectorMode, "none">, string> = {
  auto: "../injector/DiscoveredExtensionInjector.js",
  discover: "../injector/DiscoveredExtensionInjector.js",
  inject: "../injector/ExtensionsLoadUnpackedInjector.js",
  borrow: "../injector/BorrowedExtensionInjector.js",
};
const browserbase_extension_injector_module_path = "../injector/BBBrowserExtensionInjector.js";
const local_launch_extension_injector_module_path = "../injector/LocalBrowserLaunchExtensionInjector.js";
type InjectorConfig = Omit<Required<InjectorOptions>, "injector_service_worker_url_suffixes"> & {
  injector_service_worker_url_suffixes: string[];
};
export type ClientConfigOptions = {
  client_routes?: ModCDPRoutes;
  client_hydrate_aliases?: boolean;
  client_mirror_upstream_events?: boolean;
  client_cdp_send_timeout_ms?: number;
  client_event_wait_timeout_ms?: number;
  client_heartbeat_interval_ms?: number;
};
export type ClientOptions = {
  launcher?: LauncherOptions;
  upstream?: UpstreamOptions;
  injector?: InjectorOptions;
  client?: ClientConfigOptions;
  server?: ModCDPServerOptions | null;
  custom_commands?: ModCDPClientCustomCommandParams[];
  custom_events?: ModCDPAddCustomEventObjectParams[];
  custom_middlewares?: ModCDPAddMiddlewareParams[];
};
type ClientConfig = Required<ClientConfigOptions>;
type ModCDPEventNameInput = string | symbol | (z.ZodType & ModCDPNamedValue);
type ModCDPEventPayload<TEvent extends z.ZodType> = TEvent extends z.ZodType<infer TPayload> ? TPayload : never;
type ModCDPClientCustomCommandParams = Omit<ModCDPAddCustomCommandParams, "expression"> & {
  expression?: string | null;
};
type ProtocolCommandSchema = {
  params: z.ZodType;
  result: z.ZodType;
};

export type ModCDPCommandSpec<Params = unknown, Result = unknown> = {
  params: Params;
  result: Result;
};
export type ModCDPCommandMap = Record<string, ModCDPCommandSpec>;
export type ModCDPEventMap = Record<string, unknown>;
type MethodName<TName extends string> = TName extends `${string}.${infer TMethod}` ? TMethod : never;
type DomainName<TName extends string> = TName extends `${infer TDomain}.${string}` ? TDomain : never;
type CommandsForDomain<TCommands extends ModCDPCommandMap, TDomain extends string> = {
  [TName in keyof TCommands as TName extends `${TDomain}.${string}`
    ? MethodName<Extract<TName, string>>
    : never]: undefined extends TCommands[TName]["params"]
    ? (params?: TCommands[TName]["params"]) => Promise<TCommands[TName]["result"]>
    : (params: TCommands[TName]["params"]) => Promise<TCommands[TName]["result"]>;
};
export type ModCDPClientInstance<
  TCommands extends ModCDPCommandMap = Record<never, never>,
  TEvents extends ModCDPEventMap = Record<never, never>,
> = ModCDPClient & {
  [TDomain in DomainName<Extract<keyof TCommands, string>>]: CommandsForDomain<TCommands, TDomain>;
} & {
  on<TName extends Extract<keyof TEvents, string>>(
    eventName: TName,
    listener: (event: TEvents[TName], sessionId: string | null) => void,
  ): ModCDPClient;
  once<TName extends Extract<keyof TEvents, string>>(
    eventName: TName,
    listener: (event: TEvents[TName], sessionId: string | null) => void,
  ): ModCDPClient;
};

class ModCDPEventEmitter {
  private listeners = new Map<string | symbol, Set<(...args: unknown[]) => void>>();

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
    for (const listener of this.listeners.get(event_name) ?? []) listener(...args);
    if (event_name !== "*") {
      for (const listener of this.listeners.get("*") ?? []) listener(event_name, ...args);
    }
    return true;
  }
}

function defineCustomCommandMethod(client: ModCDPClient, name: string) {
  const parts = name.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Custom command must use Domain.method format, got ${name}`);
  }
  const [domain, method] = parts;
  const target = client as unknown as Record<string, Record<string, unknown>>;
  if (method === "*") {
    target[domain] = new Proxy(target[domain] ?? {}, {
      get(existing, property, receiver) {
        if (typeof property !== "string") return Reflect.get(existing, property, receiver);
        if (property in existing) return Reflect.get(existing, property, receiver);
        const command_name = `${domain}.${property}`;
        const alias = (params?: unknown) => client.send(command_name, params ?? {});
        Object.defineProperties(alias, {
          cdp_command_name: {
            value: command_name,
            enumerable: true,
            configurable: true,
          },
          id: { value: command_name, enumerable: true, configurable: true },
          name: { value: command_name, configurable: true },
          kind: { value: "command", enumerable: true, configurable: true },
          meta: {
            value: () => ({
              cdp_command_name: command_name,
              id: command_name,
              name: command_name,
              kind: "command",
            }),
            configurable: true,
          },
        });
        existing[property] = alias;
        return alias;
      },
    });
    return;
  }
  target[domain] ??= {};
  const alias = (params?: unknown) => client.send(name, params ?? {});
  Object.defineProperties(alias, {
    cdp_command_name: { value: name, enumerable: true, configurable: true },
    id: { value: name, enumerable: true, configurable: true },
    name: { value: name, configurable: true },
    kind: { value: "command", enumerable: true, configurable: true },
    meta: {
      value: () => ({
        cdp_command_name: name,
        id: name,
        name,
        kind: "command",
      }),
      configurable: true,
    },
  });
  target[domain][method] = alias;
}

function hasCommandExpression(
  command: ModCDPClientCustomCommandParams,
): command is ModCDPClientCustomCommandParams & { expression: string } {
  return typeof command.expression === "string" && command.expression.length > 0;
}

export class ModCDPClient extends ModCDPEventEmitter {
  launcher: Required<LauncherOptions>;
  upstream: UpstreamTransport;
  injector: InjectorConfig;
  client: ClientConfig;
  cdp_url: string | null;
  server: ModCDPServerOptions | null;
  custom_commands: ModCDPClientCustomCommandParams[];
  custom_events: ModCDPAddCustomEventObjectParams[];
  custom_middlewares: ModCDPAddMiddlewareParams[];
  ext_session_id: string | null;
  ext_target_id: string | null;
  ext_execution_context_id: number | null;
  extension_id: string | null;
  latency: ModCDPPingLatency | null;
  connect_timing: Record<string, unknown> | null;
  last_command_timing: Record<string, unknown> | null;
  last_raw_timing: Record<string, unknown> | null;
  event_schemas: Map<string, z.ZodType>;
  command_params_schemas: Map<string, z.ZodType>;
  command_result_schemas: Map<string, z.ZodType>;
  command_result_unwrap_keys: Map<string, string>;
  cdp_aliases_hydrated: boolean;
  event_wait_cleanups: Set<() => void>;
  router: AutoSessionRouter;
  heartbeat_timer: ReturnType<typeof setInterval> | null;
  _injectors: ExtensionInjector[];
  _cdp: {
    send: (method: string, params?: ProtocolParams, sessionId?: string | null) => Promise<ProtocolResult>;
    on: (eventName: string | symbol, listener: (...args: unknown[]) => void) => ModCDPClient;
    once: (eventName: string | symbol, listener: (...args: unknown[]) => void) => ModCDPClient;
  };
  _launched: LaunchedBrowser | null;

  constructor({
    launcher = {},
    upstream = {},
    injector = {},
    client = {},
    server = {},
    custom_commands = [],
    custom_events = [],
    custom_middlewares = [],
  }: ClientOptions = {}) {
    super();
    const upstream_mode = upstream.upstream_mode ?? "ws";
    switch (upstream_mode) {
      case "ws":
        this.upstream = new WebSocketUpstreamTransport({ cdp_url: upstream.upstream_cdp_url ?? null });
        break;
      case "pipe":
        this.upstream = new PipeUpstreamTransport();
        break;
      case "reversews":
        this.upstream = new ReverseWebSocketUpstreamTransport({
          upstream_reversews_bind: upstream.upstream_reversews_bind ?? DEFAULT_UPSTREAM_REVERSEWS_BIND,
          upstream_reversews_wait_timeout_ms:
            upstream.upstream_reversews_wait_timeout_ms ?? DEFAULT_UPSTREAM_REVERSEWS_WAIT_TIMEOUT_MS,
        });
        break;
      case "nativemessaging":
        this.upstream = new NativeMessagingUpstreamTransport({
          upstream_nativemessaging_host_name: upstream.upstream_nativemessaging_host_name ?? null,
        });
        break;
      case "nats":
        this.upstream = new NatsUpstreamTransport({
          upstream_nats_url: upstream.upstream_nats_url ?? null,
          upstream_nats_subject_prefix: upstream.upstream_nats_subject_prefix ?? null,
          upstream_nats_wait_timeout_ms:
            upstream.upstream_nats_wait_timeout_ms ?? DEFAULT_UPSTREAM_NATS_WAIT_TIMEOUT_MS,
        });
        break;
      case "loopback_cdp":
        this.upstream = new WebSocketUpstreamTransport({
          cdp_url: upstream.upstream_cdp_url ?? null,
          upstream_mode: "loopback_cdp",
        });
        break;
      case "chrome_debugger":
        this.upstream = new ChromeDebuggerTransport();
        break;
      default:
        throw new Error(`unknown upstream.upstream_mode=${upstream_mode}`);
    }
    const endpoint_kind = this.upstream.endpoint_kind;
    const launcher_mode =
      launcher.launcher_mode ?? (endpoint_kind === "raw_cdp" ? (upstream.upstream_cdp_url ? "remote" : "local") : "none");
    const injector_mode =
      injector.injector_mode ?? (endpoint_kind === "raw_cdp" || launcher_mode !== "none" ? "auto" : "none");
    this.upstream.upstream_nats_wait_timeout_ms =
      upstream.upstream_nats_wait_timeout_ms ?? DEFAULT_UPSTREAM_NATS_WAIT_TIMEOUT_MS;
    this.upstream.upstream_reversews_wait_timeout_ms =
      upstream.upstream_reversews_wait_timeout_ms ?? DEFAULT_UPSTREAM_REVERSEWS_WAIT_TIMEOUT_MS;
    if (upstream.upstream_nativemessaging_host_name)
      this.upstream.upstream_nativemessaging_host_name = upstream.upstream_nativemessaging_host_name;
    this.upstream.upstream_ws_connect_error_settle_timeout_ms =
      upstream.upstream_ws_connect_error_settle_timeout_ms ?? DEFAULT_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS;
    this.launcher = {
      launcher_mode,
      launcher_executable_path: launcher.launcher_executable_path ?? null,
      launcher_user_data_dir: launcher.launcher_user_data_dir ?? null,
      launcher_options: launcher.launcher_options ?? {},
    };
    this.injector = {
      injector_mode,
      injector_extension_path: injector.injector_extension_path ?? null,
      injector_extension_id: injector.injector_extension_id ?? null,
      injector_service_worker_url_includes: injector.injector_service_worker_url_includes ?? [],
      injector_service_worker_url_suffixes:
        injector.injector_service_worker_url_suffixes ?? DEFAULT_MODCDP_SERVICE_WORKER_URL_SUFFIXES,
      injector_trust_service_worker_target: injector.injector_trust_service_worker_target ?? false,
      injector_require_service_worker_target: injector.injector_require_service_worker_target ?? false,
      injector_service_worker_ready_expression: injector.injector_service_worker_ready_expression ?? null,
      injector_execution_context_timeout_ms:
        injector.injector_execution_context_timeout_ms ?? DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS,
      injector_service_worker_probe_timeout_ms:
        injector.injector_service_worker_probe_timeout_ms ?? DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS,
      injector_service_worker_ready_timeout_ms:
        injector.injector_service_worker_ready_timeout_ms ?? DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS,
      injector_service_worker_poll_interval_ms:
        injector.injector_service_worker_poll_interval_ms ?? DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS,
      injector_target_session_poll_interval_ms:
        injector.injector_target_session_poll_interval_ms ?? DEFAULT_TARGET_SESSION_POLL_INTERVAL_MS,
    };
    this.client = {
      client_routes: {
        ...DEFAULT_CLIENT_ROUTES,
        ...(client.client_routes ?? {}),
      },
      client_hydrate_aliases: client.client_hydrate_aliases ?? true,
      client_mirror_upstream_events: client.client_mirror_upstream_events ?? true,
      client_cdp_send_timeout_ms: client.client_cdp_send_timeout_ms ?? DEFAULT_CDP_SEND_TIMEOUT_MS,
      client_event_wait_timeout_ms: client.client_event_wait_timeout_ms ?? DEFAULT_EVENT_WAIT_TIMEOUT_MS,
      client_heartbeat_interval_ms: client.client_heartbeat_interval_ms ?? DEFAULT_CLIENT_HEARTBEAT_INTERVAL_MS,
    };
    this.upstream.cdp_send_timeout_ms = this.client.client_cdp_send_timeout_ms;
    this.cdp_url = this.upstream.upstream_cdp_url ?? null;
    this.server =
      server === null
        ? null
        : {
            ...(endpoint_kind === "modcdp_server" ? { server_routes: { "*.*": "chrome_debugger" } } : {}),
            ...(server ?? {}),
          };
    this.custom_commands = custom_commands;
    this.custom_events = custom_events;
    this.custom_middlewares = custom_middlewares;

    this.ext_session_id = null;
    this.ext_target_id = null;
    this.ext_execution_context_id = null;
    this.extension_id = null;
    this.latency = null;
    this.connect_timing = null;
    this.last_command_timing = null;
    this.last_raw_timing = null;
    this.event_schemas = new Map();
    this.command_params_schemas = new Map();
    this.command_result_schemas = new Map();
    this.command_result_unwrap_keys = new Map();
    this.cdp_aliases_hydrated = false;
    this.event_wait_cleanups = new Set();
    this.heartbeat_timer = null;
    this.router = new AutoSessionRouter({
      upstream: this.upstream,
      loopback_execution_context_timeout_ms: this.injector.injector_execution_context_timeout_ms,
    });
    this.router.listen();
    this._injectors = [];
    this._launched = null;

    this._cdp = {
      send: (method: string, params: ProtocolParams = {}, session_id: string | null = null) =>
        this._sendMessage(method, params, session_id, {
          record_raw_timing: true,
        }) as Promise<ProtocolResult>,
      on: (event_name: string | symbol, listener: (...args: unknown[]) => void) => this.on(event_name, listener),
      once: (event_name: string | symbol, listener: (...args: unknown[]) => void) => this.once(event_name, listener),
    };
    this._hydrateNativeProtocolSchemas();
    void this._hydrateCdpAliases();
    this._hydrateCustomSurface();
  }

  async connect() {
    const connect_started_at = Date.now();
    await this._hydrateCdpAliases();

    const transport_started_at = Date.now();
    await this._connectUpstreamTransport();
    const transport_connected_at = Date.now();
    this.upstream.onRecv((message) => this._onRecv(message));
    this.upstream.onClose((error) => {
      this._stopHeartbeat();
      this.emit("error", error);
    });

    if (this.upstream.endpoint_kind === "modcdp_server") {
      await this.upstream.waitForPeer();
      this.event_schemas.set("Mod.pong", Mod.PongEvent);
      if (this.server !== null) {
        await this._sendMessage("Mod.configure", this._serverConfigureParams(), null);
      }
      this._startHeartbeat();
      void this._measurePingLatency().catch(() => {});
      const connected_at = Date.now();
      this.connect_timing = {
        started_at: connect_started_at,
        upstream_mode: this.upstream.upstream_mode,
        upstream_endpoint_kind: this.upstream.endpoint_kind,
        transport_started_at,
        transport_connected_at,
        transport_duration_ms: transport_connected_at - transport_started_at,
        connected_at,
        duration_ms: connected_at - connect_started_at,
      };
      return this;
    }

    if (this.upstream.endpoint_kind === "browser_targets") {
      this.event_schemas.set("Mod.pong", Mod.PongEvent);
      const connected_at = Date.now();
      this.connect_timing = {
        started_at: connect_started_at,
        upstream_mode: this.upstream.upstream_mode,
        upstream_endpoint_kind: this.upstream.endpoint_kind,
        transport_started_at,
        transport_connected_at,
        transport_duration_ms: transport_connected_at - transport_started_at,
        connected_at,
        duration_ms: connected_at - connect_started_at,
      };
      return this;
    }

    await this._initializeRawCDPTransport();

    const injector_started_at = Date.now();
    if (this.injector.injector_mode === "none") {
      throw new Error("injector.injector_mode=none cannot be used with a raw_cdp upstream.");
    }
    const ext = await this._runInjectors(
      (method, params, session_id) => this._sendMessage(method, params, session_id) as Promise<ProtocolResult>,
    );
    const injector_completed_at = Date.now();
    this.extension_id = typeof ext.extension_id === "string" ? ext.extension_id : null;
    this.ext_target_id = ext.target_id as string;
    this.ext_session_id = ext.session_id as string;
    this.event_schemas.set("Mod.pong", Mod.PongEvent);

    const ext_context = this.router.waitForExecutionContext(this.ext_session_id, {
      timeout_ms: this.injector.injector_execution_context_timeout_ms,
    });
    await this._sendMessage(Runtime.EnableCommand.id, Runtime.EnableCommand.params.parse({}), this.ext_session_id);
    this.ext_execution_context_id = await ext_context;
    await Promise.all([
      this._sendMessage(
        Runtime.AddBindingCommand.id,
        Runtime.AddBindingCommand.params.parse({ name: CUSTOM_EVENT_BINDING_NAME }),
        this.ext_session_id,
      ),
      this.client.client_mirror_upstream_events
        ? this._sendMessage(
            Runtime.AddBindingCommand.id,
            Runtime.AddBindingCommand.params.parse({ name: UPSTREAM_EVENT_BINDING_NAME }),
            this.ext_session_id,
          )
        : Promise.resolve(),
    ]);
    if (this.server !== null) {
      await this._sendRaw(
        wrapCommandIfNeeded("Mod.configure", this._serverConfigureParams(), {
          routes: this.client.client_routes,
          cdpSessionId: this.ext_session_id,
        }),
      );
    }
    // MV3 service workers cannot run arbitrary extension code through normal page eval paths.
    // Run the offscreen keepalive startup through the configured upstream CDP route, which
    // executes Runtime.callFunctionOn inside the service worker execution context.
    await this._sendRaw(
      wrapCommandIfNeeded(
        "Mod.evaluate",
        Mod.EvaluateParams.parse({
          expression: "ModCDP.ensureOffscreenKeepAlive()",
        }),
        {
          routes: this.client.client_routes,
          cdpSessionId: this.ext_session_id,
        },
      ),
    );

    this._startHeartbeat();
    void this._measurePingLatency().catch(() => {});
    const connected_at = Date.now();
    this.connect_timing = {
      started_at: connect_started_at,
      upstream_mode: this.upstream.upstream_mode,
      upstream_endpoint_kind: this.upstream.endpoint_kind,
      transport_started_at,
      transport_connected_at,
      transport_duration_ms: transport_connected_at - transport_started_at,
      injector_source: ext.source,
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
    let command_params = this.command_params_schemas.get(method)?.parse(params ?? {}) ?? params ?? {};
    if (method === "Mod.addCustomCommand") {
      const parsed = Mod.AddCustomCommandParams.parse(command_params);
      const name = normalizeModCDPName(parsed.name);
      const params_schema = normalizeModCDPPayloadSchema(parsed.params_schema);
      const result_schema = normalizeModCDPPayloadSchema(parsed.result_schema);
      if (params_schema) this.command_params_schemas.set(name, params_schema);
      if (result_schema) {
        this.command_result_schemas.set(name, result_schema);
        this._setResultUnwrapKey(name, result_schema);
      }
      defineCustomCommandMethod(this, name);
      if (!parsed.expression) {
        this.last_command_timing = {
          method,
          target: "client",
          started_at,
          completed_at: Date.now(),
          duration_ms: Date.now() - started_at,
        };
        return this.command_result_schemas.get(method)?.parse({ name, registered: true }) ?? { name, registered: true };
      }
      command_params = {
        ...parsed,
        name,
        params_schema: null,
        result_schema: null,
      };
    } else if (method === "Mod.addCustomEvent") {
      const parsed = Mod.AddCustomEventObjectParams.parse(params ?? {});
      const name = normalizeModCDPName(parsed.name);
      const event_schema = normalizeModCDPPayloadSchema(parsed.event_schema);
      if (event_schema) this.event_schemas.set(name, event_schema);
      if (!this.ext_session_id && this.upstream.endpoint_kind !== "modcdp_server") {
        this.last_command_timing = {
          method,
          target: "client",
          started_at,
          completed_at: Date.now(),
          duration_ms: Date.now() - started_at,
        };
        return this.command_result_schemas.get(method)?.parse({ name, registered: true }) ?? { name, registered: true };
      }
      command_params = { ...parsed, name, event_schema: null };
    }
    if (this.upstream.endpoint_kind === "modcdp_server") {
      const result = await this._sendMessage(method, command_params as ProtocolParams);
      const completed_at = Date.now();
      this.last_command_timing = {
        method,
        target: "modcdp_server",
        started_at,
        completed_at,
        duration_ms: completed_at - started_at,
      };
      return result;
    }
    if (this.upstream.endpoint_kind === "browser_targets") {
      const result = await this._sendMessage(method, command_params as ProtocolParams, session_id);
      const completed_at = Date.now();
      this.last_command_timing = {
        method,
        target: "browser_targets",
        started_at,
        completed_at,
        duration_ms: completed_at - started_at,
      };
      return result;
    }
    const command = wrapCommandIfNeeded(method, command_params as ProtocolParams, {
      routes: this.client.client_routes,
      cdpSessionId: session_id,
    });
    const result = await this._sendRaw(command);
    const completed_at = Date.now();
    this.last_command_timing = {
      method,
      target: command.target,
      started_at,
      completed_at,
      duration_ms: completed_at - started_at,
    };
    const result_schema = this.command_result_schemas.get(method);
    if (!result_schema) return result;
    const parsed_result = result_schema.parse(result);
    const unwrap_key = this.command_result_unwrap_keys.get(method);
    return unwrap_key && parsed_result && typeof parsed_result === "object"
      ? (parsed_result as Record<string, unknown>)[unwrap_key]
      : parsed_result;
  }

  async sendRaw(method: string, params: ProtocolParams = {}, session_id: string | null = null) {
    return await this._sendMessage(method, params, session_id);
  }

  async _hydrateCdpAliases() {
    if (!this.client.client_hydrate_aliases || this.cdp_aliases_hydrated) return;
    Object.assign(
      this,
      createCdpAliases((method, params) => this.send(method, params), {
        onCustomCommand: (name, params_schema, result_schema) => {
          if (params_schema) this.command_params_schemas.set(name, params_schema);
          if (result_schema) {
            this.command_result_schemas.set(name, result_schema);
            this._setResultUnwrapKey(name, result_schema);
          }
          defineCustomCommandMethod(this, name);
        },
        onCustomEvent: (name, event_schema) => {
          if (event_schema) this.event_schemas.set(name, event_schema);
        },
      }),
    );
    this.cdp_aliases_hydrated = true;
  }

  _hydrateCustomSurface() {
    for (const command of this.custom_commands) {
      const name = normalizeModCDPName(command.name);
      const params_schema = command.params_schema ? Mod.PayloadSchemaSpec.parse(command.params_schema) : null;
      const result_schema = command.result_schema ? Mod.PayloadSchemaSpec.parse(command.result_schema) : null;
      const normalized_params_schema = params_schema == null ? null : this._normalizePayloadSchema(params_schema);
      const normalized_result_schema = result_schema == null ? null : this._normalizePayloadSchema(result_schema);
      if (normalized_params_schema) this.command_params_schemas.set(name, normalized_params_schema);
      if (normalized_result_schema) {
        this.command_result_schemas.set(name, normalized_result_schema);
        this._setResultUnwrapKey(name, normalized_result_schema);
      }
      defineCustomCommandMethod(this, name);
    }
    for (const event of this.custom_events) {
      const name = normalizeModCDPName(event.name);
      const event_schema = event.event_schema ? this._normalizePayloadSchema(event.event_schema) : null;
      if (event_schema) this.event_schemas.set(name, event_schema);
    }
  }

  _hydrateNativeProtocolSchemas() {
    for (const [method, schema] of Object.entries(nativeCommandSchemas) as [string, ProtocolCommandSchema][]) {
      this.command_params_schemas.set(method, schema.params);
      this.command_result_schemas.set(method, schema.result);
    }
    this.command_params_schemas.set("Mod.evaluate", Mod.EvaluateParams);
    this.command_result_schemas.set("Mod.evaluate", Mod.EvaluateResponse);
    this.command_params_schemas.set("Mod.getTopology", Mod.GetTopologyParams);
    this.command_result_schemas.set("Mod.getTopology", Mod.GetTopologyResponse);
    this.command_params_schemas.set("Mod.addCustomCommand", Mod.AddCustomCommandParams);
    this.command_result_schemas.set("Mod.addCustomCommand", Mod.AddCustomCommandResponse);
    this.command_params_schemas.set("Mod.addCustomEvent", Mod.AddCustomEventParams);
    this.command_result_schemas.set("Mod.addCustomEvent", Mod.AddCustomEventResponse);
    this.command_params_schemas.set("Mod.addMiddleware", Mod.AddMiddlewareParams);
    this.command_result_schemas.set("Mod.addMiddleware", Mod.AddMiddlewareResponse);
    this.command_params_schemas.set("Mod.configure", Mod.ConfigureParams);
    this.command_result_schemas.set("Mod.configure", Mod.ConfigureResponse);
    this.command_params_schemas.set("Mod.ping", Mod.PingParams);
    this.command_result_schemas.set("Mod.ping", Mod.PingResponse);

    for (const [event, schema] of Object.entries(nativeEventSchemas) as [string, z.ZodType][]) {
      this.event_schemas.set(event, schema);
    }
    this.event_schemas.set("Mod.pong", Mod.PongEvent);
  }

  _normalizePayloadSchema(schema: unknown) {
    return normalizeModCDPPayloadSchema(Mod.PayloadSchemaSpec.parse(schema));
  }

  _setResultUnwrapKey(name: string, schema: z.ZodType) {
    const shape = "shape" in schema && schema.shape && typeof schema.shape === "object" ? schema.shape : null;
    const keys = shape ? Object.keys(shape) : [];
    if (keys.length === 1) this.command_result_unwrap_keys.set(name, keys[0]);
    else this.command_result_unwrap_keys.delete(name);
  }

  _parseEventPayload(method: string, data: unknown) {
    return this.event_schemas.get(method)?.parse(data) ?? data;
  }

  _serviceWorkerUrlSuffixes() {
    return this.injector.injector_service_worker_url_suffixes;
  }

  _serverConfigureParams(): ModCDPConfigureParams {
    const upstream: NonNullable<ModCDPConfigureParams["upstream"]> = {};
    switch (this.upstream.upstream_mode) {
      case "ws":
      case "pipe":
      case "nativemessaging":
      case "reversews":
      case "nats":
        upstream.upstream_mode = this.upstream.upstream_mode;
        break;
      default:
        throw new Error(`unsupported client upstream_mode=${this.upstream.upstream_mode}`);
    }
    if (this.upstream.upstream_mode === "nats") {
      if (this.upstream.upstream_nats_url) upstream.upstream_nats_url = this.upstream.upstream_nats_url;
      if (this.upstream.upstream_nats_subject_prefix)
        upstream.upstream_nats_subject_prefix = this.upstream.upstream_nats_subject_prefix;
    }
    return {
      upstream,
      client: {
        client_routes: this.client.client_routes,
      },
      server: {
        ...this._serverDefaults(),
        ...(this.server ?? {}),
      },
      custom_commands: this.custom_commands.filter(hasCommandExpression).map((command) => ({
        name: normalizeModCDPName(command.name),
        expression: command.expression,
        params_schema: null as null,
        result_schema: null as null,
      })),
      custom_events: this.custom_events.map((event) => ({
        name: normalizeModCDPName(event.name),
        event_schema: null as null,
      })),
      custom_middlewares: this.custom_middlewares.map(({ name, phase, expression }) => ({
        ...(name == null ? {} : { name: normalizeModCDPName(name) }),
        phase,
        expression,
      })),
    };
  }

  _serverDefaults(): ModCDPServerOptions {
    return {
      server_cdp_send_timeout_ms: this.client.client_cdp_send_timeout_ms,
      server_loopback_execution_context_timeout_ms: this.injector.injector_execution_context_timeout_ms,
      server_ws_connect_error_settle_timeout_ms: this.upstream.upstream_ws_connect_error_settle_timeout_ms,
      server_downstream_client_timeout_ms: Math.max(this.client.client_heartbeat_interval_ms * 4, 1_000),
    };
  }

  async _connectUpstreamTransport() {
    const launcher = await this._browserLauncher();
    const transport = this.upstream;
    const injectors = await this._injectorsForConfig();
    this._injectors = injectors;
    const initial_transport_config = this._upstreamTransportConfig();
    transport.update(initial_transport_config);
    launcher.update(this._launcherOptions());
    for (const injector of injectors) injector.update(this._baseInjectorConfig());
    for (const injector of injectors) injector.update(launcher.getInjectorConfig());
    for (const injector of injectors) injector.update(transport.getInjectorConfig());
    for (const injector of injectors) await injector.prepare();
    for (const injector of injectors) launcher.update(injector.getLauncherConfig());
    for (const injector of injectors) transport.update(injector.getTransportConfig());
    launcher.update(transport.getLauncherConfig());
    launcher.update({ loopback_cdp: this._serverNeedsLoopbackCdp() });
    transport.update(launcher.getTransportConfig());

    if (transport.endpoint_kind === "modcdp_server" || transport.endpoint_kind === "browser_targets")
      await transport.connect();
    if (this.launcher.launcher_mode !== "none") {
      this._launched = await launcher.launch();
      transport.update(launcher.getTransportConfig());
      for (const injector of injectors) injector.update(launcher.getInjectorConfig());
      for (const injector of injectors) transport.update(injector.getTransportConfig());
    }
    const launched_cdp_url = this._launched?.cdp_url ?? null;
    if (transport.endpoint_kind === "raw_cdp") await transport.connect();

    this.cdp_url =
      transport.endpoint_kind === "raw_cdp" && transport.upstream_mode === "ws"
        ? ((transport.upstream_cdp_url || launched_cdp_url) ?? null)
        : launched_cdp_url;
    // For ws mode, cdp_url has been resolved to the concrete WebSocket CDP endpoint after connect().
    if (transport.upstream_mode === "ws" && transport.upstream_cdp_url)
      this.upstream.upstream_cdp_url = transport.upstream_cdp_url;
    const server_config = {
      ...(transport.endpoint_kind === "modcdp_server" && launched_cdp_url
        ? { server_loopback_cdp_url: launched_cdp_url }
        : {}),
      ...launcher.getServerConfig(),
      ...transport.getServerConfig(),
    };
    if (this.server !== null && server_config.server_loopback_cdp_url) {
      const configured_loopback = this.server.server_loopback_cdp_url;
      if (
        !Object.hasOwn(this.server, "server_loopback_cdp_url") ||
        configured_loopback === initial_transport_config.cdp_url ||
        configured_loopback === launched_cdp_url
      ) {
        this.server = { ...this.server, ...server_config };
      }
    }
  }

  async _browserLauncher(): Promise<BrowserLauncher> {
    switch (this.launcher.launcher_mode as LauncherMode) {
      case "local": {
        const { LocalBrowserLauncher } = await import(launcher_module_path.local);
        return new LocalBrowserLauncher(this.launcher.launcher_options);
      }
      case "remote": {
        const { RemoteBrowserLauncher } = await import(launcher_module_path.remote);
        return new RemoteBrowserLauncher(this.launcher.launcher_options, this.upstream.upstream_cdp_url);
      }
      case "bb": {
        const { BrowserbaseBrowserLauncher } = await import(launcher_module_path.bb);
        return new BrowserbaseBrowserLauncher(this.launcher.launcher_options);
      }
      case "none": {
        const { NoopBrowserLauncher } = await import(launcher_module_path.none);
        return new NoopBrowserLauncher(this.launcher.launcher_options);
      }
      default:
        throw new Error(`unknown launcher.launcher_mode=${this.launcher.launcher_mode}`);
    }
  }

  _launcherOptions(): BrowserLaunchOptions {
    return {
      ...this.launcher.launcher_options,
      ...(this.launcher.launcher_executable_path ? { executable_path: this.launcher.launcher_executable_path } : {}),
      ...(this.launcher.launcher_user_data_dir ? { user_data_dir: this.launcher.launcher_user_data_dir } : {}),
    };
  }

  _serverNeedsLoopbackCdp() {
    if (!this.server || this.server.server_loopback_cdp_url) return false;
    return this.server.server_routes?.["*.*"] === "loopback_cdp";
  }

  _upstreamTransportConfig() {
    return {
      cdp_url: this.upstream.upstream_cdp_url,
      upstream_nats_url: this.upstream.upstream_nats_url,
      upstream_nats_subject_prefix: this.upstream.upstream_nats_subject_prefix,
      upstream_nats_wait_timeout_ms: this.upstream.upstream_nats_wait_timeout_ms,
      upstream_reversews_bind: this.upstream.upstream_reversews_bind,
      upstream_reversews_wait_timeout_ms: this.upstream.upstream_reversews_wait_timeout_ms,
      upstream_nativemessaging_host_name: this.upstream.upstream_nativemessaging_host_name,
      injector_extension_id: this.injector.injector_extension_id,
    };
  }

  async _injectorsForConfig() {
    if (this.injector.injector_mode === "none") return [];
    const injectors: ExtensionInjector[] = [];
    const prefer_launch_injection = this.injector.injector_mode === "auto" && this.launcher.launcher_mode === "local";
    if (
      (this.injector.injector_mode === "auto" || this.injector.injector_mode === "discover") &&
      !prefer_launch_injection
    ) {
      const { DiscoveredExtensionInjector } = await import(injector_module_path.discover);
      injectors.push(new DiscoveredExtensionInjector());
    }
    if (this.injector.injector_mode === "auto" || this.injector.injector_mode === "inject") {
      if (this.launcher.launcher_mode === "bb") {
        const { BBBrowserExtensionInjector } = await import(browserbase_extension_injector_module_path);
        injectors.push(new BBBrowserExtensionInjector());
      }
      if (this.launcher.launcher_mode === "local") {
        const { LocalBrowserLaunchExtensionInjector } = await import(local_launch_extension_injector_module_path);
        injectors.push(new LocalBrowserLaunchExtensionInjector());
      }
      const { ExtensionsLoadUnpackedInjector } = await import(injector_module_path.inject);
      injectors.push(new ExtensionsLoadUnpackedInjector());
    }
    if (prefer_launch_injection) {
      const { DiscoveredExtensionInjector } = await import(injector_module_path.discover);
      injectors.push(new DiscoveredExtensionInjector());
    }
    if (this.injector.injector_mode === "auto" || this.injector.injector_mode === "borrow") {
      const { BorrowedExtensionInjector } = await import(injector_module_path.borrow);
      injectors.push(new BorrowedExtensionInjector());
    }
    if (injectors.length === 0) throw new Error(`unknown injector.injector_mode=${this.injector.injector_mode}`);
    return injectors;
  }

  _baseInjectorConfig(send: SendCDP | null = null): ExtensionInjectorConfig {
    const service_worker_url_suffixes = this._serviceWorkerUrlSuffixes();
    const trust_service_worker_target =
      this.injector.injector_trust_service_worker_target ||
      this.injector.injector_service_worker_url_includes.length > 0 ||
      service_worker_url_suffixes.some((suffix) => suffix.split("/").filter(Boolean).length > 1);
    return {
      send,
      sessionId_from_targetId: this.router.sessionId_from_targetId,
      ensureSessionForTarget: send
        ? (target_id, timeout_ms, allow_attach) => this.ensureSessionForTarget(target_id, timeout_ms, allow_attach)
        : null,
      waitForExecutionContext: (session_id, timeout_ms) =>
        this.router.waitForExecutionContext(session_id, { timeout_ms }),
      injector_extension_path: this.injector.injector_extension_path,
      injector_extension_id: this.injector.injector_extension_id,
      injector_service_worker_url_includes: this.injector.injector_service_worker_url_includes,
      injector_service_worker_url_suffixes: service_worker_url_suffixes,
      injector_trust_service_worker_target: trust_service_worker_target,
      injector_require_service_worker_target:
        this.injector.injector_require_service_worker_target || this.injector.injector_mode === "discover",
      injector_service_worker_ready_expression: this.injector.injector_service_worker_ready_expression,
      injector_cdp_send_timeout_ms: this.client.client_cdp_send_timeout_ms,
      injector_execution_context_timeout_ms: this.injector.injector_execution_context_timeout_ms,
      injector_service_worker_probe_timeout_ms: this.injector.injector_service_worker_probe_timeout_ms,
      injector_service_worker_ready_timeout_ms: this.injector.injector_service_worker_ready_timeout_ms,
      injector_service_worker_poll_interval_ms: this.injector.injector_service_worker_poll_interval_ms,
      injector_target_session_poll_interval_ms: this.injector.injector_target_session_poll_interval_ms,
    };
  }

  private async ensureSessionForTarget(target_id: string, timeout_ms = 0, allow_attach = false) {
    const session_id = this.router.sessionId_from_targetId.get(target_id);
    if (session_id) return session_id;
    if (allow_attach) return await this.router.ensureSessionForTarget(target_id);
    const deadline = Date.now() + timeout_ms;
    while (Date.now() <= deadline) {
      const current_session_id = this.router.sessionId_from_targetId.get(target_id);
      if (current_session_id) return current_session_id;
      await new Promise((resolve) => setTimeout(resolve, this.injector.injector_target_session_poll_interval_ms));
    }
    return null;
  }

  async _runInjectors(send: SendCDP, injectors: ExtensionInjector[] | null = null) {
    injectors ??= await this._injectorsForConfig();
    const errors: string[] = [];
    for (const injector of injectors) {
      injector.update(this._baseInjectorConfig(send));
      try {
        await injector.prepare();
        const result = await injector.inject();
        if (result) return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        injector.last_error = error instanceof Error ? error : new Error(message);
        errors.push(`${injector.constructor.name}: ${message}`);
      }
    }
    throw new Error(
      `Cannot install, discover, or borrow the ModCDP extension in the running browser.` +
        (errors.length ? `\n\n${errors.join("\n")}` : ""),
    );
  }

  async _initializeRawCDPTransport() {
    await Promise.all([
      this._sendMessage(
        Target.SetAutoAttachCommand.id,
        Target.SetAutoAttachCommand.params.parse({
          autoAttach: true,
          waitForDebuggerOnStart: false,
          flatten: true,
        }),
      ),
      this._sendMessage(
        Target.SetDiscoverTargetsCommand.id,
        Target.SetDiscoverTargetsCommand.params.parse({ discover: true }),
      ),
    ]);
  }

  async close() {
    this._stopHeartbeat();
    for (const cleanup of this.event_wait_cleanups) cleanup();
    this.event_wait_cleanups.clear();
    if (this._launched) await this._launched.close();
    this._launched = null;
    await this.upstream.close();
    for (const injector of this._injectors) await injector.close();
    this._injectors = [];
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    if (this.server?.server_close_browser_on_downstream_disconnect !== true) return;
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
    listener: (event: ModCDPEventPayload<TEvent>, sessionId: string | null) => void,
  ): this;
  on(event_name: string | symbol, listener: (...args: unknown[]) => void): this;
  on(event_name: ModCDPEventNameInput, listener: (...args: any[]) => void): this;
  on(event_name: ModCDPEventNameInput, listener: (...args: any[]) => void) {
    if (typeof event_name !== "string" && typeof event_name !== "symbol") {
      const name = normalizeModCDPName(event_name);
      this.event_schemas.set(name, event_name);
      return super.on(name, listener);
    }
    return super.on(typeof event_name === "symbol" ? event_name : normalizeModCDPName(event_name), listener);
  }

  once<TEvent extends z.ZodType & ModCDPNamedValue>(
    event_name: TEvent,
    listener: (event: ModCDPEventPayload<TEvent>, sessionId: string | null) => void,
  ): this;
  once(event_name: string | symbol, listener: (...args: unknown[]) => void): this;
  once(event_name: ModCDPEventNameInput, listener: (...args: any[]) => void): this;
  once(event_name: ModCDPEventNameInput, listener: (...args: any[]) => void) {
    if (typeof event_name !== "string" && typeof event_name !== "symbol") {
      const name = normalizeModCDPName(event_name);
      this.event_schemas.set(name, event_name);
      return super.once(name, listener);
    }
    return super.once(typeof event_name === "symbol" ? event_name : normalizeModCDPName(event_name), listener);
  }

  off<TEvent extends z.ZodType & ModCDPNamedValue>(
    event_name: TEvent,
    listener: (event: ModCDPEventPayload<TEvent>, sessionId: string | null) => void,
  ): this;
  off(event_name: string | symbol, listener: (...args: unknown[]) => void): this;
  off(event_name: ModCDPEventNameInput, listener: (...args: any[]) => void): this;
  off(event_name: ModCDPEventNameInput, listener: (...args: any[]) => void) {
    if (typeof event_name !== "string" && typeof event_name !== "symbol") {
      return super.off(normalizeModCDPName(event_name), listener);
    }
    return super.off(typeof event_name === "symbol" ? event_name : normalizeModCDPName(event_name), listener);
  }

  _waitForEvent(event_name: ModCDPEventNameInput, { timeout_ms }: { timeout_ms?: number } = {}) {
    const effective_timeout_ms = timeout_ms ?? this.client.client_event_wait_timeout_ms;
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

  async _sendRaw(command: TranslatedCommand) {
    if (command.target === "direct_cdp") {
      const [step] = command.steps;
      return this._sendMessage(step.method, step.params ?? {}, step.sessionId ?? null) as Promise<ProtocolResult>;
    }
    if (command.target !== "service_worker") {
      throw new Error(`Unsupported command target "${command.target}"`);
    }

    let result: ProtocolResult = {};
    let unwrap = null;
    for (const step of command.steps) {
      const step_params =
        step.method === Runtime.CallFunctionOnCommand.id &&
        step.params &&
        !Object.hasOwn(step.params, "executionContextId")
          ? {
              ...step.params,
              executionContextId:
                this.ext_execution_context_id ??
                (await this.router.waitForExecutionContext(this.ext_session_id, {
                  timeout_ms: this.injector.injector_execution_context_timeout_ms,
                })),
            }
          : (step.params ?? {});
      result = (await this._sendMessage(step.method, step_params, this.ext_session_id)) as ProtocolResult;
      unwrap = step.unwrap ?? null;
    }
    return unwrapResponseIfNeeded(result, unwrap);
  }

  async _sendMessage(
    method: string,
    params: ProtocolParams = {},
    session_id: string | null = null,
    options: { record_raw_timing?: boolean; timeout_ms?: number | null } = {},
  ) {
    const started_at = Date.now();
    if (this.upstream.endpoint_kind === "modcdp_server") await this.upstream.waitForPeer();
    const result =
      this.upstream.endpoint_kind === "browser_targets"
        ? await this.router.send(method, params, session_id)
        : await this.upstream.send(method, params, session_id, {
            timeout_ms: options.timeout_ms ?? this.client.client_cdp_send_timeout_ms,
          });
    if (options.record_raw_timing) {
      const completed_at = Date.now();
      this.last_raw_timing = {
        method,
        started_at,
        completed_at,
        duration_ms: completed_at - started_at,
      };
    }
    return result;
  }

  _onRecv(msg: CdpResponseMessage | CdpEventMessage) {
    if ("id" in msg && typeof msg.id === "number") {
      return;
    }
    const event = CdpEventMessageSchema.parse(msg);
    const eventParams = (event.params || {}) as ProtocolPayload;
    if (event.sessionId === this.ext_session_id) {
      if (event.method !== Runtime.BindingCalledEvent.id) return;
      const u = unwrapEventIfNeeded(
        event.method,
        eventParams as RuntimeBindingCalledEvent,
        event.sessionId || null,
        this.ext_session_id,
      );
      if (u) {
        const payload = this._parseEventPayload(u.event, u.data);
        this.emit(u.event, payload, u.sessionId);
      }
      return;
    }
    if (event.method) {
      const payload = this._parseEventPayload(event.method, eventParams);
      this.emit(event.method, payload, event.sessionId || null);
    }
  }
}

export interface ModCDPClient extends CdpAliases {}
