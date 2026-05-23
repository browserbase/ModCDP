// ModCDPServer: lives inside an extension service worker. Owns the registry
// of custom commands and event bindings, and emits events through the binding
// API installed by the client (Runtime.addBinding -> globalThis[__ModCDP_custom_event__]).
//
// The installer is intentionally self-contained so the bridge can inject the
// same server implementation into an already-running extension service worker
// when Chrome refuses Extensions.loadUnpacked.

import { commands as nativeCommandSchemas, events as nativeEventSchemas } from "../types/generated/zod.js";
import * as Browser from "../types/generated/zod/Browser.js";
import * as Runtime from "../types/generated/zod/Runtime.js";
import { ProtocolPayloadSchema, normalizeModCDPPayloadSchema } from "../types/modcdp.js";
import { AutoSessionRouter } from "../router/AutoSessionRouter.js";
import { ChromeDebuggerTransport } from "./ChromeDebuggerTransport.js";
import { LoopbackCdpTransport } from "./LoopbackCdpTransport.js";
import {
  DEFAULT_NATIVE_BRIDGE_HOST_NAME,
  DEFAULT_NATIVE_BRIDGE_RECONNECT_INTERVAL_MS,
  NativeHostDownstreamTransport,
} from "./NativeHostDownstreamTransport.js";
import {
  DEFAULT_NATS_BRIDGE_RECONNECT_INTERVAL_MS,
  DEFAULT_NATS_BRIDGE_SUBJECT_PREFIX,
  NATSDownstreamTransport,
} from "./NATSDownstreamTransport.js";
import {
  DEFAULT_REVERSE_BRIDGE_RECONNECT_INTERVAL_MS,
  ReverseWSDownstreamTransport,
} from "./ReverseWSDownstreamTransport.js";
import type {
  CdpEventMessage,
  ModCDPConfigureParams,
  ModCDPCustomCommandRegistration,
  ModCDPCustomEventRegistration,
  ModCDPMiddlewareRegistration,
  ModCDPPingParams,
  ModCDPRoutes,
  ProtocolParams,
  ProtocolPayload,
  ProtocolResult,
} from "../types/modcdp.js";

export const DEFAULT_CDP_SEND_TIMEOUT_MS = 10_000;
export const DEFAULT_LOOPBACK_EXECUTION_CONTEXT_TIMEOUT_MS = 10_000;
export const DEFAULT_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS = 250;
export const DEFAULT_DOWNSTREAM_CLIENT_TIMEOUT_MS = 1_000;
export {
  DEFAULT_NATIVE_BRIDGE_HOST_NAME,
  DEFAULT_NATIVE_BRIDGE_RECONNECT_INTERVAL_MS,
} from "./NativeHostDownstreamTransport.js";
export {
  DEFAULT_NATS_BRIDGE_RECONNECT_INTERVAL_MS,
  DEFAULT_NATS_BRIDGE_SUBJECT_PREFIX,
} from "./NATSDownstreamTransport.js";
export { DEFAULT_REVERSE_BRIDGE_RECONNECT_INTERVAL_MS } from "./ReverseWSDownstreamTransport.js";

type MiddlewarePhase = "request" | "response" | "event";
type ProtocolCommandSchema = {
  params: { parse(value: unknown): ProtocolParams };
  result: { parse(value: unknown): ProtocolResult };
};
type ProtocolEventSchema = {
  parse(value: unknown): ProtocolPayload;
};
type ModCDPGlobalScope = typeof globalThis &
  Record<string, unknown> & {
    ModCDP?: {
      __ModCDPServerVersion?: number;
      addCustomEvent?: unknown;
      handleCommand?: unknown;
    };
  };

export function installModCDPServer(globalScope: ModCDPGlobalScope = globalThis as ModCDPGlobalScope) {
  const MODCDP_SERVER_VERSION = 2;
  const DEFAULT_CDP_SEND_TIMEOUT_MS = 10_000;
  const DEFAULT_LOOPBACK_EXECUTION_CONTEXT_TIMEOUT_MS = 10_000;
  const DEFAULT_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS = 250;
  if (
    globalScope.ModCDP?.__ModCDPServerVersion === MODCDP_SERVER_VERSION &&
    globalScope.ModCDP?.handleCommand &&
    globalScope.ModCDP?.addCustomEvent
  )
    return globalScope.ModCDP;

  const UPSTREAM_EVENT_BINDING_NAME = "__ModCDP_event_from_upstream__";
  const CUSTOM_EVENT_BINDING_NAME = "__ModCDP_custom_event__";
  const encodeBindingPayload = ({
    event,
    data,
    cdpSessionId = null,
  }: {
    event: string;
    data: ProtocolPayload;
    cdpSessionId?: string | null;
  }) => JSON.stringify({ event, data, cdpSessionId });

  const command_handlers = new Map<string, ModCDPCustomCommandRegistration>();
  const event_bindings = new Map<string, ModCDPCustomEventRegistration>();
  const event_listeners = new Set<(event: string, data: ProtocolPayload, cdpSessionId: string | null) => void>();
  const middlewares: Record<MiddlewarePhase, ModCDPMiddlewareRegistration[]> = {
    request: [],
    response: [],
    event: [],
  };
  let runtime_types_promise: Promise<unknown> | null = null;
  let downstream_client_registered = false;
  let downstream_client_lease: {
    cdpSessionId: string | null;
    last_seen_at: number;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  function registerDownstreamClient() {
    downstream_client_registered = true;
  }

  function clearDownstreamClientLease() {
    const lease = downstream_client_lease;
    if (!lease) return null;
    clearTimeout(lease.timer);
    downstream_client_lease = null;
    return lease;
  }

  function touchDownstreamClientLease(cdpSessionId: string | null) {
    const timeout_ms = ModCDPServer.downstream_client_timeout_ms;
    if (!(timeout_ms > 0)) return;
    if (!downstream_client_registered) return;
    const last_seen_at = Date.now();
    clearDownstreamClientLease();
    const timer = setTimeout(() => {
      const expired = clearDownstreamClientLease();
      if (!expired) return;
      if (ModCDPServer.close_browser_on_downstream_disconnect !== true) return;
      if (!ModCDPServer.upstream) setupServerUpstreamTransport();
      void ModCDPServer.upstream?.send(Browser.CloseCommand, {}).catch(() => {});
    }, timeout_ms);
    downstream_client_lease = {
      cdpSessionId,
      last_seen_at,
      timer,
    };
  }

  function nativeCommandSchema(method: string) {
    return (nativeCommandSchemas as Record<string, ProtocolCommandSchema>)[method];
  }

  function nativeEventSchema(eventName: string) {
    return (nativeEventSchemas as Record<string, ProtocolEventSchema>)[eventName];
  }

  function commandParamsSchema(method: string, command: ModCDPCustomCommandRegistration | null) {
    return (
      (command?.params_schema as ProtocolCommandSchema["params"] | null) ?? nativeCommandSchema(method)?.params ?? null
    );
  }

  function commandResultSchema(method: string, command: ModCDPCustomCommandRegistration | null) {
    return (
      (command?.result_schema as ProtocolCommandSchema["result"] | null) ?? nativeCommandSchema(method)?.result ?? null
    );
  }

  function eventPayloadSchema(eventName: string, event: ModCDPCustomEventRegistration | null) {
    return (event?.event_schema as ProtocolEventSchema | null) ?? nativeEventSchema(eventName) ?? null;
  }

  async function publishEvent(eventName: string, payload: ProtocolPayload = {}, cdpSessionId: string | null = null) {
    payload = await ModCDPServer.runMiddleware("event", eventName, payload, {
      cdpSessionId,
      event: { name: eventName, payload },
    });
    if (payload === undefined) return { event: eventName, emitted: false, reason: "middleware_dropped" };
    const event = registryMatch(event_bindings, eventName);
    payload = eventPayloadSchema(eventName, event)?.parse(payload) ?? payload;

    for (const listener of event_listeners) {
      try {
        listener(eventName, payload, cdpSessionId);
      } catch (error) {
        console.error("[ModCDPServer] event listener failed", error);
      }
    }
    const message: CdpEventMessage = {
      method: eventName,
      params: (payload ?? {}) as CdpEventMessage["params"],
    };
    if (cdpSessionId) message.sessionId = cdpSessionId;
    const emitted_through_reverse_bridge = reversews_downstream.emit(message);
    const emitted_through_native_bridge = native_host_downstream.emit(message);
    const emitted_through_nats_bridge = nats_downstream.emit(message);

    const is_custom_event = registryMatch(event_bindings, eventName) != null;
    let emitted_through_binding = false;
    if (is_custom_event) {
      const custom_binding = globalScope[CUSTOM_EVENT_BINDING_NAME];
      if (typeof custom_binding === "function") {
        custom_binding(
          encodeBindingPayload({
            event: eventName,
            data: payload,
            cdpSessionId,
          }),
        );
        emitted_through_binding = true;
      }
    } else {
      const mirror_binding = globalScope[UPSTREAM_EVENT_BINDING_NAME];
      if (typeof mirror_binding === "function") {
        mirror_binding(
          encodeBindingPayload({
            event: eventName,
            data: payload,
            cdpSessionId,
          }),
        );
        emitted_through_binding = true;
      }
    }
    return emitted_through_binding ||
      emitted_through_reverse_bridge ||
      emitted_through_native_bridge ||
      emitted_through_nats_bridge
      ? { event: eventName, emitted: true }
      : { event: eventName, emitted: false, reason: "binding_not_installed" };
  }

  const default_routes = {
    "Mod.*": "service_worker",
    "Custom.*": "service_worker",
    "*.*": "auto",
  } satisfies ModCDPRoutes;
  let reversews_downstream: ReverseWSDownstreamTransport;
  let nats_downstream: NATSDownstreamTransport;
  let native_host_downstream: NativeHostDownstreamTransport;
  const offscreen_keep_alive_port_name = "ModCDPOffscreenKeepAlive";
  const offscreen_keep_alive_path = "offscreen/keepalive.html";
  let creating_offscreen_keep_alive: Promise<void> | null = null;
  let offscreen_keep_alive_port: chrome.runtime.Port | null = null;

  function registryMatch<T>(registry: Map<string, T>, name: string): T | null {
    const exact = registry.get(name);
    if (exact) return exact;
    let match: T | null = null;
    let match_prefix_length = -1;
    for (const [pattern, value] of registry) {
      if (!pattern.endsWith(".*")) continue;
      const prefix = pattern.slice(0, -1);
      if (!name.startsWith(prefix) || prefix.length <= match_prefix_length) continue;
      match = value;
      match_prefix_length = prefix.length;
    }
    return match;
  }

  function normalizeModCDPName(
    value:
      | {
          cdp_command_name?: string;
          cdp_event_name?: string;
          id?: string;
          name?: string;
          meta?: () =>
            | {
                cdp_command_name?: unknown;
                cdp_event_name?: unknown;
                id?: unknown;
                name?: unknown;
              }
            | undefined;
        }
      | string,
  ) {
    if (typeof value === "string") return value;
    const meta = typeof value?.meta === "function" ? value.meta() : undefined;
    const name =
      value?.cdp_command_name ??
      value?.cdp_event_name ??
      (typeof meta?.cdp_command_name === "string" ? meta.cdp_command_name : undefined) ??
      (typeof meta?.cdp_event_name === "string" ? meta.cdp_event_name : undefined) ??
      value?.id ??
      (typeof meta?.id === "string" ? meta.id : undefined) ??
      (typeof meta?.name === "string" ? meta.name : undefined) ??
      value?.name;
    if (typeof name !== "string" || !name) throw new Error("Expected a CDP name string or a named CDP schema/alias.");
    return name;
  }

  function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function currentServiceWorkerUrl() {
    const chrome_api = globalScope.chrome;
    const manifest = chrome_api?.runtime?.getManifest?.();
    const service_worker =
      manifest && typeof manifest === "object" && "background" in manifest
        ? (manifest.background as { service_worker?: unknown } | undefined)?.service_worker
        : null;
    const service_worker_path =
      typeof service_worker === "string" && service_worker.length > 0
        ? service_worker.replace(/^\//, "")
        : "modcdp/service_worker.js";
    return chrome_api.runtime.getURL(service_worker_path);
  }

  type SelectedServerUpstreamTransportName = "loopback_cdp" | "chrome_debugger";

  let active_server_upstream_subscription: { remove: () => void } | null = null;

  function setupServerUpstreamTransport(): LoopbackCdpTransport | ChromeDebuggerTransport;
  function setupServerUpstreamTransport(name: "loopback_cdp"): LoopbackCdpTransport;
  function setupServerUpstreamTransport(name: "chrome_debugger"): ChromeDebuggerTransport;
  function setupServerUpstreamTransport(
    name?: SelectedServerUpstreamTransportName,
  ): LoopbackCdpTransport | ChromeDebuggerTransport;
  function setupServerUpstreamTransport(
    name?: SelectedServerUpstreamTransportName,
  ): LoopbackCdpTransport | ChromeDebuggerTransport {
    const selected_name =
      name ?? ModCDPServer.upstream_name ?? (ModCDPServer.loopback_cdp_url ? "loopback_cdp" : "chrome_debugger");
    if (ModCDPServer.upstream_name === selected_name && ModCDPServer.upstream && ModCDPServer.router) {
      return ModCDPServer.upstream;
    }
    active_server_upstream_subscription?.remove();
    const transport =
      selected_name === "loopback_cdp"
        ? new LoopbackCdpTransport({
            loopback_cdp_url: ModCDPServer.loopback_cdp_url,
            cdp_send_timeout_ms: ModCDPServer.cdp_send_timeout_ms,
            loopback_execution_context_timeout_ms: ModCDPServer.loopback_execution_context_timeout_ms,
            ws_connect_error_settle_timeout_ms: ModCDPServer.ws_connect_error_settle_timeout_ms,
          })
        : new ChromeDebuggerTransport();
    ModCDPServer.upstream_name = selected_name;
    ModCDPServer.upstream = transport;
    if (!ModCDPServer.upstream) throw new Error("ModCDP server upstream transport is not initialized.");
    ModCDPServer.router = new AutoSessionRouter({
      upstream: ModCDPServer.upstream,
      loopback_execution_context_timeout_ms: ModCDPServer.loopback_execution_context_timeout_ms,
    });
    const auto_router_subscription = ModCDPServer.router.listen();
    const publish_subscriptions = Object.values(nativeEventSchemas).map((event) =>
      transport.on(event, (payload, _targetId, cdpSessionId) => {
        void publishEvent(event.id, ProtocolPayloadSchema.parse(payload), cdpSessionId).catch((error) =>
          console.error("[ModCDPServer] upstream event listener failed", error),
        );
      }),
    );
    active_server_upstream_subscription = {
      remove: () => {
        auto_router_subscription?.remove();
        for (const subscription of publish_subscriptions) subscription.remove();
      },
    };
    return transport;
  }

  async function evaluateInServiceWorker(expression: string): Promise<ProtocolResult> {
    if (!ModCDPServer.upstream) setupServerUpstreamTransport();
    if (!ModCDPServer.upstream) throw new Error("ModCDP server upstream transport is not initialized.");
    if (!ModCDPServer.router) throw new Error("ModCDP autorouter is not initialized.");

    const service_worker_url = currentServiceWorkerUrl();
    const service_worker_target = (await ModCDPServer.upstream.getTargets()).find(
      (target) => target.url === service_worker_url,
    );
    if (!service_worker_target) {
      throw new Error(`Could not find ModCDP service worker target ${service_worker_url}.`);
    }
    const route = await ModCDPServer.router.ensureRouteForTarget(service_worker_target.targetId);

    /*
     * MV3 extension service workers cannot opt into arbitrary string eval with
     * content_security_policy; Chrome rejects `eval`/`new Function` in extension
     * service-worker JavaScript even when the manifest tries to loosen CSP. The
     * user-facing Mod.evaluate/custom-command/middleware APIs intentionally take
     * JavaScript source strings, so direct in-process execution is not viable.
     *
     * The workaround is to execute the source as a DevTools Protocol operation
     * against this same service-worker target. CDP Runtime.evaluate runs in the
     * browser's inspector/evaluation path instead of through service-worker JS
     * string eval, so it can evaluate the supplied expression while still seeing
     * `globalThis.ModCDP`, `chrome`, and the service-worker global scope. This
     * must go through the currently configured server upstream transport
     * (`loopback_cdp` or `chrome_debugger`) via the generic upstream interface;
     * downstream transports and ModCDPServer must not hardcode either physical
     * upstream implementation here.
     */
    const result = await ModCDPServer.upstream.send(
      Runtime.EvaluateCommand,
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
      },
      route,
    );
    if (result.exceptionDetails) {
      const exception = result.exceptionDetails;
      throw new Error(exception.exception?.description || exception.text || "Runtime evaluation failed");
    }
    return (result.result?.value ?? {}) as ProtocolResult;
  }

  async function evaluateUserExpression({
    expression,
    params = {},
    cdpSessionId = null,
    method = null,
  }: {
    expression: string;
    params?: ProtocolPayload;
    cdpSessionId?: string | null;
    method?: string | null;
  }): Promise<ProtocolResult> {
    return evaluateInServiceWorker(`
      (async () => {
        const params = ${JSON.stringify(params ?? {})};
        const method = ${JSON.stringify(method)};
        const cdp = globalThis.ModCDP.attachToSession(${JSON.stringify(cdpSessionId)});
        const ModCDP = globalThis.ModCDP;
        const chrome = globalThis.chrome;
        const value = (${expression});
        return typeof value === "function" ? await value(params || {}, method) : value;
      })()
    `);
  }

  async function ensureOffscreenKeepAlive() {
    const chrome_api = globalScope.chrome;
    const offscreen = chrome_api?.offscreen;
    if (!offscreen || !chrome_api?.runtime?.getURL) return { started: false, reason: "offscreen_unavailable" };

    const offscreen_url = chrome_api.runtime.getURL(offscreen_keep_alive_path);
    try {
      const existing_contexts = chrome_api.runtime.getContexts
        ? await chrome_api.runtime.getContexts({
            contextTypes: ["OFFSCREEN_DOCUMENT"],
            documentUrls: [offscreen_url],
          })
        : [];
      if (existing_contexts.length > 0) return { started: true, existing: true };

      creating_offscreen_keep_alive ??= offscreen
        .createDocument({
          url: offscreen_keep_alive_path,
          reasons: ["BLOBS"],
          justification: "Keep ModCDP service worker active while CDP clients route commands through it.",
        })
        .finally(() => {
          creating_offscreen_keep_alive = null;
        });
      await creating_offscreen_keep_alive;
      return { started: true };
    } catch (error) {
      return { started: false, reason: errorMessage(error) };
    }
  }

  const ModCDPServer = {
    __ModCDPServerVersion: MODCDP_SERVER_VERSION,
    routes: { ...default_routes },
    loopback_cdp_url: null as string | null,
    browser_token: null as string | null,
    upstream: null as LoopbackCdpTransport | ChromeDebuggerTransport | null,
    upstream_name: null as SelectedServerUpstreamTransportName | null,
    router: null as AutoSessionRouter | null,
    get native_bridge_attempts() {
      return native_host_downstream.attempts;
    },
    get native_bridge_last_error() {
      return native_host_downstream.last_error;
    },
    get native_bridge_connected() {
      return native_host_downstream.connected;
    },
    cdp_send_timeout_ms: DEFAULT_CDP_SEND_TIMEOUT_MS,
    loopback_execution_context_timeout_ms: DEFAULT_LOOPBACK_EXECUTION_CONTEXT_TIMEOUT_MS,
    ws_connect_error_settle_timeout_ms: DEFAULT_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS,
    downstream_client_timeout_ms: DEFAULT_DOWNSTREAM_CLIENT_TIMEOUT_MS,
    close_browser_on_downstream_disconnect: false,
    types: null as (typeof import("../types/generated/zod.js"))["types"] | null,
    commands: null as (typeof import("../types/generated/zod.js"))["commands"] | null,
    events: null as (typeof import("../types/generated/zod.js"))["events"] | null,
    startReverseBridge(
      endpoint: string,
      {
        reconnect_interval_ms = DEFAULT_REVERSE_BRIDGE_RECONNECT_INTERVAL_MS,
      }: {
        reconnect_interval_ms?: number;
      } = {},
    ) {
      return reversews_downstream.start(endpoint, { reconnect_interval_ms });
    },
    stopReverseBridge(reason = "stopped") {
      return reversews_downstream.stop(reason);
    },
    startNativeBridge(
      hostName = DEFAULT_NATIVE_BRIDGE_HOST_NAME,
      {
        reconnect_interval_ms = DEFAULT_NATIVE_BRIDGE_RECONNECT_INTERVAL_MS,
      }: {
        reconnect_interval_ms?: number;
      } = {},
    ) {
      return native_host_downstream.start(hostName, { reconnect_interval_ms });
    },
    startNatsBridge(
      endpoint: string,
      {
        upstream_nats_subject_prefix = DEFAULT_NATS_BRIDGE_SUBJECT_PREFIX,
        reconnect_interval_ms = DEFAULT_NATS_BRIDGE_RECONNECT_INTERVAL_MS,
      }: {
        upstream_nats_subject_prefix?: string;
        reconnect_interval_ms?: number;
      } = {},
    ) {
      return nats_downstream.start(endpoint, { upstream_nats_subject_prefix, reconnect_interval_ms });
    },
    ensureOffscreenKeepAlive,

    async loadTypes() {
      runtime_types_promise ??= import("../types/generated/zod.js").then((module) => {
        this.types = module.types;
        this.commands = module.commands;
        this.events = module.events;
        return module.types;
      });
      return runtime_types_promise;
    },

    async configure(params: ModCDPConfigureParams = {}) {
      const upstream = params.upstream ?? {};
      const server = params.server ?? {};
      const {
        server_loopback_cdp_url = this.loopback_cdp_url,
        server_routes,
        server_browser_token = this.browser_token,
        server_cdp_send_timeout_ms = this.cdp_send_timeout_ms,
        server_loopback_execution_context_timeout_ms = this.loopback_execution_context_timeout_ms,
        server_ws_connect_error_settle_timeout_ms = this.ws_connect_error_settle_timeout_ms,
        server_downstream_client_timeout_ms = this.downstream_client_timeout_ms,
        server_close_browser_on_downstream_disconnect = this.close_browser_on_downstream_disconnect,
      } = server;
      const { custom_commands = [], custom_events = [], custom_middlewares = [] } = params;
      this.loopback_cdp_url = await LoopbackCdpTransport.resolveEndpoint(server_loopback_cdp_url);
      this.browser_token = server_browser_token;
      this.cdp_send_timeout_ms = server_cdp_send_timeout_ms;
      this.loopback_execution_context_timeout_ms = server_loopback_execution_context_timeout_ms;
      this.ws_connect_error_settle_timeout_ms = server_ws_connect_error_settle_timeout_ms;
      this.downstream_client_timeout_ms = server_downstream_client_timeout_ms;
      this.close_browser_on_downstream_disconnect = server_close_browser_on_downstream_disconnect;
      if (upstream.upstream_mode === "nats" && upstream.upstream_nats_url) {
        this.startNatsBridge(upstream.upstream_nats_url, {
          upstream_nats_subject_prefix: upstream.upstream_nats_subject_prefix ?? DEFAULT_NATS_BRIDGE_SUBJECT_PREFIX,
        });
      }
      if (server_routes) this.routes = { ...default_routes, ...server_routes };
      else {
        this.routes = { ...default_routes };
        await this.discoverLoopbackCDP();
      }
      const default_server_route = server_routes?.["*.*"];
      setupServerUpstreamTransport(
        default_server_route === "loopback_cdp" || default_server_route === "chrome_debugger"
          ? default_server_route
          : this.loopback_cdp_url
            ? "loopback_cdp"
            : "chrome_debugger",
      );
      for (const command of custom_commands) this.addCustomCommand(command as ModCDPCustomCommandRegistration);
      for (const event of custom_events) this.addCustomEvent(event as ModCDPCustomEventRegistration);
      for (const middleware of custom_middlewares) this.addMiddleware(middleware as ModCDPMiddlewareRegistration);
      return { loopback_cdp_url: this.loopback_cdp_url, routes: this.routes };
    },

    addCustomCommand({
      name,
      params_schema = null,
      result_schema = null,
      expression = null,
      handler,
    }: ModCDPCustomCommandRegistration) {
      name = normalizeModCDPName(name);
      if (!/^[^.]+\.[^.]+$/.test(name)) throw new Error("name must be in Domain.method form.");
      if (typeof handler !== "function" && typeof expression === "string") {
        handler = async (params: ProtocolParams = {}, cdpSessionId: string | null = null, method: string = name) => {
          return await evaluateUserExpression({
            expression,
            params,
            cdpSessionId,
            method,
          });
        };
      }
      if (typeof handler !== "function") throw new Error(`Custom command ${name} was registered without a handler.`);
      command_handlers.set(name, {
        name,
        handler,
        params_schema: normalizeModCDPPayloadSchema(params_schema),
        result_schema: normalizeModCDPPayloadSchema(result_schema),
        expression,
      });
      return { name, registered: true };
    },

    addCustomEvent({ name, event_schema = null }: ModCDPCustomEventRegistration) {
      name = normalizeModCDPName(name);
      if (!/^[^.]+\.[^.]+$/.test(name)) throw new Error("name must be in Domain.event form.");
      event_bindings.set(name, {
        name,
        event_schema: normalizeModCDPPayloadSchema(event_schema),
      });
      return { name, registered: true };
    },

    addEventListener(listener: (event: string, data: ProtocolPayload, cdpSessionId: string | null) => void) {
      event_listeners.add(listener);
      return { remove: () => event_listeners.delete(listener) };
    },

    addMiddleware({ name = "*", phase, expression = null, handler }: ModCDPMiddlewareRegistration) {
      name = normalizeModCDPName(name);
      if (!["request", "response", "event"].includes(phase))
        throw new Error("phase must be request, response, or event.");
      if (name !== "*" && (!name || !name.includes("."))) throw new Error("name must be '*' or Domain.name form.");
      if (typeof handler !== "function" && typeof expression === "string") {
        handler = async (payload: ProtocolPayload, next: unknown, context: ProtocolPayload = {}) => {
          const context_object = context && typeof context === "object" ? (context as Record<string, unknown>) : {};
          const cdpSessionId = typeof context_object.cdpSessionId === "string" ? context_object.cdpSessionId : null;
          const result = (await evaluateInServiceWorker(`
            (async () => {
              const payload = ${JSON.stringify(payload ?? {})};
              const context = ${JSON.stringify(context ?? {})};
              const cdp = globalThis.ModCDP.attachToSession(${JSON.stringify(cdpSessionId)});
              const ModCDP = globalThis.ModCDP;
              const chrome = globalThis.chrome;
              const next = async (nextValue = payload) => ({ __ModCDP_middleware_next__: true, value: nextValue });
              const middleware = (${expression});
              return await middleware(payload, next, context);
            })()
          `)) as Record<string, unknown>;
          if (result?.__ModCDP_middleware_next__ === true && typeof next === "function") {
            const next_result = await next(result.value);
            const { __ModCDP_middleware_next__, value: _value, ...overrides } = result;
            if (Object.keys(overrides).length === 0) return next_result;
            return next_result != null && typeof next_result === "object" && !Array.isArray(next_result)
              ? { ...(next_result as Record<string, unknown>), ...overrides }
              : overrides;
          }
          return result;
        };
      }
      if (typeof handler !== "function") {
        throw new Error(`Middleware ${name}:${phase} was registered without a handler.`);
      }
      middlewares[phase].push({ name, phase, expression, handler });
      return { name, phase, registered: true };
    },

    async runMiddleware(phase: MiddlewarePhase, name: string, payload: ProtocolPayload, context: ProtocolPayload = {}) {
      const matching = (middlewares[phase] || []).filter(
        (middleware) => middleware.name === "*" || middleware.name === name,
      );
      const dispatch = async (index: number, value: ProtocolPayload): Promise<ProtocolPayload> => {
        const middleware = matching[index];
        if (!middleware) return value;
        let next_called = false;
        const next = async (nextValue = value) => {
          if (next_called)
            throw new Error(`Middleware ${middleware.name}:${middleware.phase} called next() more than once.`);
          next_called = true;
          return dispatch(index + 1, nextValue);
        };
        const ctx = context && typeof context === "object" ? context : {};
        return middleware.handler(value, next, { ...ctx, name, phase });
      };
      return dispatch(0, payload);
    },

    async handleCommand(method: string, params: ProtocolParams = {}, cdpSessionId: string | null = null) {
      if (method === "Mod.configure") registerDownstreamClient();
      touchDownstreamClientLease(cdpSessionId);
      const request = { method, params, cdpSessionId };
      const middleware_params = await this.runMiddleware("request", method, params, { cdpSessionId, request });
      if (middleware_params == null) throw new Error(`Request middleware for ${method} returned no params.`);
      params = middleware_params as ProtocolParams;

      const command = registryMatch(command_handlers, method);
      params = commandParamsSchema(method, command)?.parse(params) ?? params;
      let result;
      if (command) {
        result = await command.handler(params, cdpSessionId, method);
        result = await this.runMiddleware("response", method, result, {
          cdpSessionId,
          request: { ...request, params },
          response: { result },
        });
        return commandResultSchema(method, command)?.parse(result) ?? result;
      }

      let upstream = "auto";
      for (const [pattern, route] of Object.entries(this.routes || {}) as [string, string][]) {
        if (pattern === "*.*") {
          upstream = route;
          continue;
        }
        if (pattern.endsWith(".*") && method.startsWith(pattern.slice(0, -1))) {
          upstream = route;
          break;
        }
        if (pattern === method) {
          upstream = route;
          break;
        }
      }

      if (upstream === "service_worker") throw new Error(`No service-worker command registered for ${method}.`);
      if (upstream !== "auto" && upstream !== "loopback_cdp" && upstream !== "chrome_debugger")
        throw new Error(`No service-worker command registered for ${method}.`);
      if (!ModCDPServer.upstream) setupServerUpstreamTransport();
      if (!ModCDPServer.upstream) throw new Error(`No ModCDP server upstream transport registered for ${method}.`);
      if (!ModCDPServer.router) throw new Error("ModCDP autorouter is not initialized.");
      result = await ModCDPServer.router.send(method, params, cdpSessionId);

      result = await this.runMiddleware("response", method, result, {
        cdpSessionId,
        request: { ...request, params },
        response: { result },
      });
      return commandResultSchema(method, null)?.parse(result) ?? result;
    },

    attachToSession(cdpSessionId: string | null = null) {
      return {
        sessionId: cdpSessionId,
        get types() {
          return ModCDPServer.types;
        },
        get commands() {
          return ModCDPServer.commands;
        },
        get events() {
          return ModCDPServer.events;
        },
        get upstream() {
          if (!ModCDPServer.router) setupServerUpstreamTransport();
          if (!ModCDPServer.router) throw new Error("ModCDP autorouter is not initialized.");
          return ModCDPServer.router;
        },
        send: (method: string, params: ProtocolParams = {}) => this.handleCommand(method, params, cdpSessionId),
        emit: (eventName: string, payload: ProtocolPayload = {}) => this.emit(eventName, payload, cdpSessionId),
      };
    },

    async emit(eventName: string, payload: ProtocolPayload = {}, cdpSessionId: string | null = null) {
      const event = registryMatch(event_bindings, eventName);
      if (!event)
        return {
          event: eventName,
          emitted: false,
          reason: "event_not_registered",
        };
      payload = eventPayloadSchema(eventName, event)?.parse(payload) ?? payload;
      const custom_binding = globalScope[CUSTOM_EVENT_BINDING_NAME];
      if (
        typeof custom_binding !== "function" &&
        !reversews_downstream.connected &&
        !native_host_downstream.connected &&
        !nats_downstream.connected
      )
        return {
          event: eventName,
          emitted: false,
          reason: "binding_not_installed",
        };
      return publishEvent(eventName, payload, cdpSessionId);
    },

    async discoverLoopbackCDP(): Promise<{
      loopback_cdp_url: string | null;
      verified: boolean;
      version?: unknown;
    }> {
      const transport = new LoopbackCdpTransport({
        loopback_cdp_url: ModCDPServer.loopback_cdp_url,
        cdp_send_timeout_ms: ModCDPServer.cdp_send_timeout_ms,
        loopback_execution_context_timeout_ms: ModCDPServer.loopback_execution_context_timeout_ms,
        ws_connect_error_settle_timeout_ms: ModCDPServer.ws_connect_error_settle_timeout_ms,
      });
      const result = await transport.discoverLoopbackCDP({
        browserToken: this.browser_token,
        serviceWorkerUrl: currentServiceWorkerUrl(),
      });
      this.loopback_cdp_url = result.loopback_cdp_url;
      return result;
    },
  };

  reversews_downstream = new ReverseWSDownstreamTransport({
    ensureOffscreenKeepAlive,
    handleCommand: (message) =>
      ModCDPServer.handleCommand(message.method, message.params ?? {}, message.sessionId ?? null),
  });
  native_host_downstream = new NativeHostDownstreamTransport({
    ensureOffscreenKeepAlive,
    handleCommand: (message) =>
      ModCDPServer.handleCommand(message.method, message.params ?? {}, message.sessionId ?? null),
  });
  nats_downstream = new NATSDownstreamTransport({
    ensureOffscreenKeepAlive,
    handleCommand: (message) =>
      ModCDPServer.handleCommand(message.method, message.params ?? {}, message.sessionId ?? null),
  });

  globalScope.ModCDP = ModCDPServer;

  ModCDPServer.addCustomEvent({
    name: "Mod.pong",
  });

  ModCDPServer.addCustomCommand({
    name: "Mod.ping",
    handler: async (raw_params: ProtocolParams = {}, cdpSessionId: string | null = null) => {
      const params = raw_params as ModCDPPingParams;
      const received_at = Date.now();
      await ModCDPServer.emit(
        "Mod.pong",
        {
          sent_at: typeof params.sent_at === "number" ? params.sent_at : received_at,
          received_at,
          from: "extension-service-worker",
        },
        cdpSessionId,
      );
      return { ok: true };
    },
  });

  ModCDPServer.addCustomCommand({
    name: "Mod.configure",
    handler: async (params: ProtocolParams = {}) => ModCDPServer.configure(params as ModCDPConfigureParams),
  });

  ModCDPServer.addCustomCommand({
    name: "Mod.evaluate",
    handler: async (raw_params: ProtocolParams = {}) => {
      const { expression, params = {}, cdpSessionId = null } = raw_params as Record<string, unknown>;
      return await evaluateUserExpression({
        expression: String(expression),
        params: params as ProtocolPayload,
        cdpSessionId: typeof cdpSessionId === "string" ? cdpSessionId : null,
      });
    },
  });

  ModCDPServer.addCustomCommand({
    name: "Mod.getTopology",
    handler: async (params: ProtocolParams = {}) => {
      if (!ModCDPServer.router) setupServerUpstreamTransport();
      if (!ModCDPServer.router) throw new Error("ModCDP autorouter is not initialized.");
      return await ModCDPServer.router.getTopology(params as Record<string, unknown>);
    },
  });

  ModCDPServer.addCustomCommand({
    name: "Mod.addCustomCommand",
    handler: async (params: ProtocolParams = {}) =>
      ModCDPServer.addCustomCommand(params as ModCDPCustomCommandRegistration),
  });

  ModCDPServer.addCustomCommand({
    name: "Mod.addCustomEvent",
    handler: async (params: ProtocolParams = {}) =>
      ModCDPServer.addCustomEvent(params as ModCDPCustomEventRegistration),
  });

  ModCDPServer.addCustomCommand({
    name: "Mod.addMiddleware",
    handler: async (params: ProtocolParams = {}) => ModCDPServer.addMiddleware(params as ModCDPMiddlewareRegistration),
  });

  const chrome_api = globalScope.chrome;
  try {
    chrome_api?.runtime?.onStartup?.addListener(ensureOffscreenKeepAlive);
  } catch {}
  try {
    chrome_api?.runtime?.onInstalled?.addListener(ensureOffscreenKeepAlive);
  } catch {}
  try {
    chrome_api?.tabs?.onCreated?.addListener(ensureOffscreenKeepAlive);
  } catch {}
  try {
    chrome_api?.runtime?.onConnect?.addListener((port) => {
      if (port.name !== offscreen_keep_alive_port_name) return;
      offscreen_keep_alive_port = port;
      port.onMessage.addListener(() => {});
      port.onDisconnect.addListener(() => {
        if (offscreen_keep_alive_port === port) offscreen_keep_alive_port = null;
      });
    });
  } catch {}
  void ensureOffscreenKeepAlive();

  return ModCDPServer;
}

export const ModCDPServer = installModCDPServer(globalThis);
