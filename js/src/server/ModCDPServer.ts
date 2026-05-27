// ModCDPServer: lives inside an extension service worker. Owns custom command
// handlers, event bindings, downstream delivery, and the browser-target client.
// Shape metadata belongs to ModCDPServer.client.types so the server and its
// upstream client validate against one registry object.

import { events as nativeEventSchemas } from "../types/generated/zod.js";
import * as Browser from "../types/generated/zod/Browser.js";
import * as Runtime from "../types/generated/zod/Runtime.js";
import { ModCDPClient } from "../client/ModCDPClient.js";
import { resolveCdpWebSocketUrl } from "../launcher/BrowserLauncher.js";
import { normalizeModCDPPayloadSchema } from "../types/modcdp.js";
import { AutoSessionRouter } from "../router/AutoSessionRouter.js";
import { routeFor } from "../translate/translate.js";
import {
  DEFAULT_DOWNSTREAM_CLIENT_TIMEOUT_MS,
  DownstreamTransportCollection,
} from "../transport/DownstreamTransportCollection.js";
import { NativeHostDownstreamTransport } from "../transport/NativeHostDownstreamTransport.js";
import { NATSDownstreamTransport } from "../transport/NATSDownstreamTransport.js";
import { ReverseWSDownstreamTransport } from "../transport/ReverseWSDownstreamTransport.js";
import type {
  CdpEventMessage,
  CdpResponseMessage,
  ModCDPConfigureParams,
  ModCDPCustomCommandRegistration,
  ModCDPCustomEventRegistration,
  ModCDPMiddlewareRegistration,
  ModCDPPingParams,
  ModCDPRoutes,
  ModCDPServerOptions as ProtocolModCDPServerOptions,
  ProtocolParams,
  ProtocolPayload,
  ProtocolResult,
} from "../types/modcdp.js";

export const DEFAULT_CDP_SEND_TIMEOUT_MS = 10_000;
export const DEFAULT_LOOPBACK_EXECUTION_CONTEXT_TIMEOUT_MS = 10_000;
export const DEFAULT_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS = 250;
export {
  DEFAULT_NATIVE_BRIDGE_HOST_NAME,
  DEFAULT_NATIVE_BRIDGE_RECONNECT_INTERVAL_MS,
} from "../transport/NativeHostDownstreamTransport.js";
export {
  DEFAULT_NATS_BRIDGE_RECONNECT_INTERVAL_MS,
  DEFAULT_NATS_BRIDGE_SUBJECT_PREFIX,
} from "../transport/NATSDownstreamTransport.js";
export { DEFAULT_REVERSE_BRIDGE_RECONNECT_INTERVAL_MS } from "../transport/ReverseWSDownstreamTransport.js";

type MiddlewarePhase = "request" | "response" | "event";
type BrowserTargetUpstreamMode = "loopback_cdp" | "chrome_debugger";

export type ModCDPServerOptions = ProtocolModCDPServerOptions & {
  global_scope?: ModCDPGlobalScope;
};

type ModCDPGlobalScope = typeof globalThis &
  Record<string, unknown> & {
    ModCDP?: ModCDPServer;
  };

const UPSTREAM_EVENT_BINDING_NAME = "__ModCDP_event_from_upstream__";
const CUSTOM_EVENT_BINDING_NAME = "__ModCDP_custom_event__";
const DEFAULT_ROUTES = {
  "Mod.*": "service_worker",
  "Custom.*": "service_worker",
  "*.*": "auto",
} satisfies ModCDPRoutes;

/**
 * Extension-side ModCDP server.
 *
 * The server owns client-facing downstream transports, service-worker command
 * handlers, custom command/event/middleware registries, and one ModCDPClient
 * pointed upstream at browser targets. It does not implement a browser-target
 * transport itself; target/session/context routing stays inside the upstream
 * ModCDPClient.router.
 */
export class ModCDPServer {
  // sub-services
  client: ModCDPClient | null;
  downstream: DownstreamTransportCollection;

  // Server-only secret used to verify that a discovered loopback endpoint is
  // this same service worker. Browser routing/downstream config live on
  // client.router, client.upstream, client.client, and downstream.
  server_browser_token: string | null;

  private readonly global_scope: ModCDPGlobalScope;
  private readonly initial_server_options: ProtocolModCDPServerOptions;
  private readonly command_handlers = new Map<
    string,
    ModCDPCustomCommandRegistration
  >();
  private readonly event_bindings = new Map<
    string,
    ModCDPCustomEventRegistration
  >();
  private readonly event_listeners = new Set<
    (event: string, data: ProtocolPayload, cdpSessionId: string | null) => void
  >();
  private readonly middlewares: Record<
    MiddlewarePhase,
    ModCDPMiddlewareRegistration[]
  > = {
    request: [],
    response: [],
    event: [],
  };
  private downstream_client_registered = false;
  private downstream_client_lease: {
    cdpSessionId: string | null;
    last_seen_at: number;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private active_server_client_subscription: { remove: () => void } | null =
    null;
  private readonly offscreen_keep_alive_port_name = "ModCDPOffscreenKeepAlive";
  private readonly offscreen_keep_alive_path = "offscreen/keepalive.html";
  private creating_offscreen_keep_alive: Promise<void> | null = null;
  private offscreen_keep_alive_port: chrome.runtime.Port | null = null;
  private started = false;

  constructor(options: ModCDPServerOptions = {}) {
    const {
      global_scope = globalThis as ModCDPGlobalScope,
      ...server_options
    } = options;
    this.global_scope = global_scope;
    this.initial_server_options = server_options;
    this.server_browser_token = null;
    this.client = null;
    this.downstream = new DownstreamTransportCollection({
      downstream_client_timeout_ms: DEFAULT_DOWNSTREAM_CLIENT_TIMEOUT_MS,
      close_browser_on_downstream_disconnect: false,
    });
    this.setupServerClient();
  }

  /** Install transports/default commands/listeners and return this server. */
  async start(): Promise<this> {
    if (this.started) return this;
    this.started = true;
    for (const transport of [
      new ReverseWSDownstreamTransport({
        ensureOffscreenKeepAlive: () => this.ensureOffscreenKeepAlive(),
      }),
      new NativeHostDownstreamTransport({
        ensureOffscreenKeepAlive: () => this.ensureOffscreenKeepAlive(),
      }),
      new NATSDownstreamTransport({
        ensureOffscreenKeepAlive: () => this.ensureOffscreenKeepAlive(),
      }),
    ]) {
      this.downstream.add(transport);
    }
    this.downstream.onRequest(async (message): Promise<CdpResponseMessage> => {
      try {
        return {
          id: message.id,
          result: await this.handleCommand(
            message.method,
            message.params ?? {},
            message.sessionId ?? null,
          ),
        };
      } catch (error) {
        return {
          id: message.id,
          error: {
            code: -32000,
            message: this.errorMessage(error),
          },
        };
      }
    });
    this.global_scope.ModCDP = this;
    this.registerDefaultCommands();
    this.registerChromeKeepAliveListeners();
    this.downstream.startDefault();
    if (Object.keys(this.initial_server_options).length > 0)
      await this.configure({ server: this.initial_server_options });
    await this.ensureOffscreenKeepAlive();
    return this;
  }

  /** Ensure the offscreen keepalive document exists when Chrome exposes it. */
  async ensureOffscreenKeepAlive() {
    const chrome_api = this.global_scope.chrome;
    const offscreen = chrome_api?.offscreen;
    if (!offscreen || !chrome_api?.runtime?.getURL)
      return { started: false, reason: "offscreen_unavailable" };

    const offscreen_url = chrome_api.runtime.getURL(
      this.offscreen_keep_alive_path,
    );
    try {
      const existing_contexts = chrome_api.runtime.getContexts
        ? await chrome_api.runtime.getContexts({
            contextTypes: ["OFFSCREEN_DOCUMENT"],
            documentUrls: [offscreen_url],
          })
        : [];
      if (existing_contexts.length > 0)
        return { started: true, existing: true };

      this.creating_offscreen_keep_alive ??= offscreen
        .createDocument({
          url: this.offscreen_keep_alive_path,
          reasons: ["BLOBS"],
          justification:
            "Keep ModCDP service worker active while CDP clients route commands through it.",
        })
        .finally(() => {
          this.creating_offscreen_keep_alive = null;
        });
      await this.creating_offscreen_keep_alive;
      return { started: true };
    } catch (error) {
      return { started: false, reason: this.errorMessage(error) };
    }
  }

  /** Apply Mod.configure settings and register custom server extensions. */
  async configure(params: ModCDPConfigureParams = {}) {
    const server = params.server ?? {};
    const current_client = this.setupServerClient();
    const current_loopback_cdp_url =
      current_client.upstream.upstream_mode === "ws"
        ? (current_client.upstream.upstream_ws_cdp_url ?? null)
        : null;
    const {
      server_loopback_cdp_url = current_loopback_cdp_url,
      router = { router_routes: current_client.router.router_routes },
      server_browser_token = this.server_browser_token,
      server_cdp_send_timeout_ms = current_client.client
        .client_cdp_send_timeout_ms,
      server_loopback_execution_context_timeout_ms =
        current_client.router.loopback_execution_context_timeout_ms,
      server_ws_connect_error_settle_timeout_ms =
        current_client.upstream.upstream_ws_connect_error_settle_timeout_ms ??
        DEFAULT_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS,
      server_downstream_client_timeout_ms = this.downstream
        .downstream_client_timeout_ms,
      server_close_browser_on_downstream_disconnect = this
        .downstream.close_browser_on_downstream_disconnect,
    } = server;
    const {
      custom_commands = [],
      custom_events = [],
      custom_middlewares = [],
    } = params;

    const loopback_cdp_url = server_loopback_cdp_url
      ? await resolveCdpWebSocketUrl(
          server_loopback_cdp_url,
          "server_loopback_cdp_url",
        )
      : null;
    this.server_browser_token = server_browser_token;
    this.downstream.update({
      downstream_client_timeout_ms: server_downstream_client_timeout_ms,
      close_browser_on_downstream_disconnect:
        server_close_browser_on_downstream_disconnect,
    });
    let configured_loopback_cdp_url = loopback_cdp_url;
    let router_routes: ModCDPRoutes;
    if (router.router_routes) {
      router_routes = { ...DEFAULT_ROUTES, ...router.router_routes };
    } else {
      router_routes = { ...DEFAULT_ROUTES };
      const discovered = await this.discoverLoopbackCDP({
        server_cdp_send_timeout_ms,
        server_loopback_execution_context_timeout_ms,
        server_ws_connect_error_settle_timeout_ms,
      });
      configured_loopback_cdp_url =
        discovered.loopback_cdp_url ?? configured_loopback_cdp_url;
    }

    const default_server_route = router_routes["*.*"];
    this.setupServerClient({
      upstream_mode:
        default_server_route === "loopback_cdp" ||
        default_server_route === "chrome_debugger"
          ? default_server_route
          : configured_loopback_cdp_url
            ? "loopback_cdp"
            : "chrome_debugger",
      loopback_cdp_url: configured_loopback_cdp_url,
      router_routes,
      server_cdp_send_timeout_ms,
      server_loopback_execution_context_timeout_ms,
      server_ws_connect_error_settle_timeout_ms,
    });
    for (const command of custom_commands)
      this.addCustomCommand(command as ModCDPCustomCommandRegistration);
    for (const event of custom_events)
      this.addCustomEvent(event as ModCDPCustomEventRegistration);
    for (const middleware of custom_middlewares)
      this.addMiddleware(middleware as ModCDPMiddlewareRegistration);
    return {
      loopback_cdp_url: configured_loopback_cdp_url,
      router: { router_routes },
    };
  }

  addCustomCommand({
    name,
    params_schema = null,
    result_schema = null,
    expression = null,
    handler,
  }: ModCDPCustomCommandRegistration) {
    name = this.normalizeModCDPName(name);
    if (!/^[^.]+\.[^.]+$/.test(name))
      throw new Error("name must be in Domain.method form.");
    if (typeof handler !== "function" && typeof expression === "string") {
      handler = async (
        params: ProtocolParams = {},
        cdpSessionId: string | null = null,
        method: string = name,
      ) => {
        return await this.evaluateUserExpression({
          expression,
          params,
          cdpSessionId,
          method,
        });
      };
    }
    if (typeof handler !== "function")
      throw new Error(
        `Custom command ${name} was registered without a handler.`,
      );
    this.client?.types.addCustomCommand({
      name,
      params_schema,
      result_schema,
      expression,
    });
    this.command_handlers.set(name, {
      name,
      handler,
      params_schema: normalizeModCDPPayloadSchema(params_schema),
      result_schema: normalizeModCDPPayloadSchema(result_schema),
      expression,
    });
    return { name, registered: true };
  }

  addCustomEvent({ name, event_schema = null }: ModCDPCustomEventRegistration) {
    name = this.normalizeModCDPName(name);
    if (!/^[^.]+\.[^.]+$/.test(name))
      throw new Error("name must be in Domain.event form.");
    this.client?.types.addCustomEvent({ name, event_schema });
    this.event_bindings.set(name, {
      name,
      event_schema: normalizeModCDPPayloadSchema(event_schema),
    });
    return { name, registered: true };
  }

  addEventListener(
    listener: (
      event: string,
      data: ProtocolPayload,
      cdpSessionId: string | null,
    ) => void,
  ) {
    this.event_listeners.add(listener);
    return { remove: () => this.event_listeners.delete(listener) };
  }

  addMiddleware({
    name = "*",
    phase,
    expression = null,
    handler,
  }: ModCDPMiddlewareRegistration) {
    name = this.normalizeModCDPName(name);
    if (!["request", "response", "event"].includes(phase))
      throw new Error("phase must be request, response, or event.");
    if (name !== "*" && (!name || !name.includes(".")))
      throw new Error("name must be '*' or Domain.name form.");
    this.client?.types.addCustomMiddleware({ name, phase, expression });
    if (typeof handler !== "function" && typeof expression === "string") {
      handler = async (
        payload: ProtocolPayload,
        next: unknown,
        context: ProtocolPayload = {},
      ) => {
        const context_object =
          context && typeof context === "object"
            ? (context as Record<string, unknown>)
            : {};
        const cdpSessionId =
          typeof context_object.cdpSessionId === "string"
            ? context_object.cdpSessionId
            : null;
        const result = (await this.evaluateInServiceWorker(`
          (async () => {
            const payload = ${JSON.stringify(payload ?? {})};
            const context = ${JSON.stringify(context ?? {})};
            const cdpSessionId = ${JSON.stringify(cdpSessionId)};
            const upstream = globalThis.ModCDP.client;
            const downstream = globalThis.ModCDP.downstream;
            const ModCDP = globalThis.ModCDP;
            const chrome = globalThis.chrome;
            const next = async (nextValue = payload) => ({ __ModCDP_middleware_next__: true, value: nextValue });
            const middleware = (${expression});
            return await middleware(payload, next, context);
          })()
        `)) as Record<string, unknown>;
        if (
          result?.__ModCDP_middleware_next__ === true &&
          typeof next === "function"
        ) {
          const next_result = await next(result.value);
          const {
            __ModCDP_middleware_next__,
            value: _value,
            ...overrides
          } = result;
          if (Object.keys(overrides).length === 0) return next_result;
          return next_result != null &&
            typeof next_result === "object" &&
            !Array.isArray(next_result)
            ? { ...(next_result as Record<string, unknown>), ...overrides }
            : overrides;
        }
        return result;
      };
    }
    if (typeof handler !== "function")
      throw new Error(
        `Middleware ${name}:${phase} was registered without a handler.`,
      );
    this.middlewares[phase].push({ name, phase, expression, handler });
    return { name, phase, registered: true };
  }

  async runMiddleware(
    phase: MiddlewarePhase,
    name: string,
    payload: ProtocolPayload,
    context: ProtocolPayload = {},
  ) {
    const matching = (this.middlewares[phase] || []).filter(
      (middleware) => middleware.name === "*" || middleware.name === name,
    );
    const dispatch = async (
      index: number,
      value: ProtocolPayload,
    ): Promise<ProtocolPayload> => {
      const middleware = matching[index];
      if (!middleware) return value;
      let next_called = false;
      const next = async (nextValue = value) => {
        if (next_called)
          throw new Error(
            `Middleware ${middleware.name}:${middleware.phase} called next() more than once.`,
          );
        next_called = true;
        return dispatch(index + 1, nextValue);
      };
      const ctx = context && typeof context === "object" ? context : {};
      return middleware.handler(value, next, { ...ctx, name, phase });
    };
    return dispatch(0, payload);
  }

  async handleCommand(
    method: string,
    params: ProtocolParams = {},
    cdpSessionId: string | null = null,
  ) {
    if (method === "Mod.configure") this.registerDownstreamClient();
    this.touchDownstreamClientLease(cdpSessionId);
    const request = { method, params, cdpSessionId };
    const middleware_params = await this.runMiddleware(
      "request",
      method,
      params,
      { cdpSessionId, request },
    );
    if (middleware_params == null)
      throw new Error(`Request middleware for ${method} returned no params.`);
    params = middleware_params as ProtocolParams;

    const command = this.registryMatch(this.command_handlers, method);
    const types = this.setupServerClient().types;
    params = types.parseCommandParams(method, params);
    let result;
    if (command) {
      result = await command.handler(params, cdpSessionId, method);
      result = await this.runMiddleware("response", method, result, {
        cdpSessionId,
        request: { ...request, params },
        response: { result },
      });
      return types.parseCommandResult(method, result) as ProtocolResult;
    }

    const upstream = routeFor(
      method,
      this.setupServerClient().router.router_routes,
    );
    if (upstream === "service_worker")
      throw new Error(`No service-worker command registered for ${method}.`);
    if (
      upstream !== "auto" &&
      upstream !== "loopback_cdp" &&
      upstream !== "chrome_debugger"
    )
      throw new Error(`No service-worker command registered for ${method}.`);
    const client = this.setupServerClient(
      upstream === "loopback_cdp" || upstream === "chrome_debugger"
        ? { upstream_mode: upstream }
        : {},
    );
    result = await client.router.send(method, params, cdpSessionId);
    result = await this.runMiddleware("response", method, result, {
      cdpSessionId,
      request: { ...request, params },
      response: { result },
    });
    return client.types.parseCommandResult(method, result) as ProtocolResult;
  }

  async emit(
    eventName: string,
    payload: ProtocolPayload = {},
    cdpSessionId: string | null = null,
  ) {
    const event = this.registryMatch(this.event_bindings, eventName);
    if (!event)
      return {
        event: eventName,
        emitted: false,
        reason: "event_not_registered",
      };
    payload = this.setupServerClient().types.parseEventPayload(
      eventName,
      payload,
    ) as ProtocolPayload;
    const custom_binding = this.global_scope[CUSTOM_EVENT_BINDING_NAME];
    if (
      typeof custom_binding !== "function" &&
      !this.downstream.hasConnectedClient()
    )
      return {
        event: eventName,
        emitted: false,
        reason: "binding_not_installed",
      };
    return this.publishEvent(eventName, payload, cdpSessionId);
  }

  async discoverLoopbackCDP(options: {
    server_cdp_send_timeout_ms?: number;
    server_loopback_execution_context_timeout_ms?: number;
    server_ws_connect_error_settle_timeout_ms?: number;
  } = {}): Promise<{
    loopback_cdp_url: string | null;
    verified: boolean;
    version?: unknown;
  }> {
    if (!this.server_browser_token)
      return { loopback_cdp_url: null, verified: false };

    const current_client = this.setupServerClient();
    const server_cdp_send_timeout_ms =
      options.server_cdp_send_timeout_ms ??
      current_client.client.client_cdp_send_timeout_ms;
    const server_loopback_execution_context_timeout_ms =
      options.server_loopback_execution_context_timeout_ms ??
      current_client.router.loopback_execution_context_timeout_ms;
    const server_ws_connect_error_settle_timeout_ms =
      options.server_ws_connect_error_settle_timeout_ms ??
      current_client.upstream.upstream_ws_connect_error_settle_timeout_ms ??
      DEFAULT_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS;
    const service_worker_url = this.currentServiceWorkerUrl();
    const loopback_cdp_url = await resolveCdpWebSocketUrl(
      "http://127.0.0.1:9222",
      "server_loopback_cdp_url",
    ).catch(() => null);
    if (!loopback_cdp_url) return { loopback_cdp_url: null, verified: false };

    const client = new ModCDPClient({
      launcher: { launcher_mode: "none" },
      injector: {
        injector_mode: "none",
        injector_execution_context_timeout_ms:
          server_loopback_execution_context_timeout_ms,
      },
      upstream: {
        upstream_mode: "ws",
        upstream_ws_cdp_url: loopback_cdp_url,
        upstream_ws_connect_error_settle_timeout_ms:
          server_ws_connect_error_settle_timeout_ms,
      },
      client: {
        client_hydrate_aliases: false,
        client_cdp_send_timeout_ms: server_cdp_send_timeout_ms,
      },
      server: null,
    });
    try {
      await client.connect();
      const service_worker_target = (await client.upstream.getTargets()).find(
        (target) =>
          target.type === "service_worker" && target.url === service_worker_url,
      );
      if (!service_worker_target) {
        return { loopback_cdp_url: null, verified: false };
      }
      const route = await client.router.ensureRouteForTarget(
        service_worker_target.targetId,
      );
      const execution_context_ready = client.router.waitForExecutionContext(
        route.sessionId,
        { timeout_ms: server_loopback_execution_context_timeout_ms },
      );
      await client.upstream.send(Runtime.EnableCommand, {}, route);
      const executionContextId = await execution_context_ready;
      const result = await client.upstream.send(
        Runtime.CallFunctionOnCommand,
        {
          functionDeclaration: `function() { return globalThis.ModCDP?.server_browser_token === ${JSON.stringify(this.server_browser_token)}; }`,
          executionContextId,
          returnByValue: true,
        },
        route,
      );
      if (result.result?.value !== true) {
        return { loopback_cdp_url: null, verified: false };
      }
      return { loopback_cdp_url, verified: true };
    } finally {
      await client.close();
    }
  }

  private registerDownstreamClient() {
    this.downstream_client_registered = true;
  }

  private clearDownstreamClientLease() {
    const lease = this.downstream_client_lease;
    if (!lease) return null;
    clearTimeout(lease.timer);
    this.downstream_client_lease = null;
    return lease;
  }

  private touchDownstreamClientLease(cdpSessionId: string | null) {
    const timeout_ms = this.downstream.downstream_client_timeout_ms;
    if (!(timeout_ms > 0)) return;
    if (!this.downstream_client_registered) return;
    const last_seen_at = Date.now();
    this.clearDownstreamClientLease();
    const timer = setTimeout(() => {
      const expired = this.clearDownstreamClientLease();
      if (!expired) return;
      if (this.downstream.close_browser_on_downstream_disconnect !== true)
        return;
      void this.setupServerClient()
        .router.send(Browser.CloseCommand.id, {})
        .catch(() => {});
    }, timeout_ms);
    this.downstream_client_lease = { cdpSessionId, last_seen_at, timer };
  }

  private async publishEvent(
    eventName: string,
    payload: ProtocolPayload = {},
    cdpSessionId: string | null = null,
  ) {
    payload = await this.runMiddleware("event", eventName, payload, {
      cdpSessionId,
      event: { name: eventName, payload },
    });
    if (payload === undefined)
      return { event: eventName, emitted: false, reason: "middleware_dropped" };
    payload = this.setupServerClient().types.parseEventPayload(
      eventName,
      payload,
    ) as ProtocolPayload;

    for (const listener of this.event_listeners) {
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
    const emitted_through_downstream = this.downstream.sendEvent(message) > 0;
    const is_custom_event =
      this.registryMatch(this.event_bindings, eventName) != null;
    let emitted_through_binding = false;
    const binding_name = is_custom_event
      ? CUSTOM_EVENT_BINDING_NAME
      : UPSTREAM_EVENT_BINDING_NAME;
    const binding = this.global_scope[binding_name];
    if (typeof binding === "function") {
      binding(
        this.encodeBindingPayload({
          event: eventName,
          data: payload,
          cdpSessionId,
        }),
      );
      emitted_through_binding = true;
    }
    return emitted_through_binding || emitted_through_downstream
      ? { event: eventName, emitted: true }
      : { event: eventName, emitted: false, reason: "binding_not_installed" };
  }

  private setupServerClient({
    upstream_mode,
    loopback_cdp_url,
    router_routes,
    server_cdp_send_timeout_ms,
    server_loopback_execution_context_timeout_ms,
    server_ws_connect_error_settle_timeout_ms,
  }: {
    upstream_mode?: BrowserTargetUpstreamMode;
    loopback_cdp_url?: string | null;
    router_routes?: ModCDPRoutes;
    server_cdp_send_timeout_ms?: number;
    server_loopback_execution_context_timeout_ms?: number;
    server_ws_connect_error_settle_timeout_ms?: number;
  } = {}): ModCDPClient {
    const current_types = this.client?.types;
    const current_loopback_cdp_url =
      this.client?.upstream.upstream_mode === "ws"
        ? (this.client.upstream.upstream_ws_cdp_url ?? null)
        : null;
    const configured_loopback_cdp_url =
      loopback_cdp_url !== undefined
        ? loopback_cdp_url
        : current_loopback_cdp_url;
    const configured_router_routes =
      router_routes ?? this.client?.router.router_routes ?? { ...DEFAULT_ROUTES };
    const configured_cdp_send_timeout_ms =
      server_cdp_send_timeout_ms ??
      this.client?.client.client_cdp_send_timeout_ms ??
      DEFAULT_CDP_SEND_TIMEOUT_MS;
    const configured_execution_context_timeout_ms =
      server_loopback_execution_context_timeout_ms ??
      this.client?.router.loopback_execution_context_timeout_ms ??
      DEFAULT_LOOPBACK_EXECUTION_CONTEXT_TIMEOUT_MS;
    const configured_ws_connect_error_settle_timeout_ms =
      server_ws_connect_error_settle_timeout_ms ??
      this.client?.upstream.upstream_ws_connect_error_settle_timeout_ms ??
      DEFAULT_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS;
    const selected_name =
      upstream_mode ??
      (this.client?.upstream.upstream_mode === "chrome_debugger"
        ? "chrome_debugger"
        : this.client?.upstream.upstream_mode === "ws" &&
            this.client.upstream.upstream_ws_cdp_url
          ? "loopback_cdp"
          : configured_loopback_cdp_url
            ? "loopback_cdp"
            : "chrome_debugger");
    const config_changed =
      loopback_cdp_url !== undefined ||
      router_routes !== undefined ||
      server_cdp_send_timeout_ms !== undefined ||
      server_loopback_execution_context_timeout_ms !== undefined ||
      server_ws_connect_error_settle_timeout_ms !== undefined;
    if (
      this.client &&
      !config_changed &&
      ((selected_name === "chrome_debugger" &&
        this.client.upstream.upstream_mode === "chrome_debugger") ||
        (selected_name === "loopback_cdp" &&
          this.client.upstream.upstream_mode === "ws" &&
          this.client.upstream.upstream_ws_cdp_url ===
            configured_loopback_cdp_url))
    )
      return this.client;

    this.active_server_client_subscription?.remove();
    const client = new ModCDPClient({
      launcher: { launcher_mode: "none" },
      injector: {
        injector_mode: "none",
        injector_execution_context_timeout_ms:
          configured_execution_context_timeout_ms,
      },
      upstream:
        selected_name === "loopback_cdp"
          ? {
              upstream_mode: "ws",
              upstream_ws_cdp_url: configured_loopback_cdp_url,
              upstream_ws_connect_error_settle_timeout_ms:
                configured_ws_connect_error_settle_timeout_ms,
            }
          : { upstream_mode: "chrome_debugger" },
      router: {
        router_routes: configured_router_routes,
        loopback_execution_context_timeout_ms:
          configured_execution_context_timeout_ms,
      },
      client: {
        client_hydrate_aliases: false,
        client_cdp_send_timeout_ms: configured_cdp_send_timeout_ms,
      },
      server: null,
      types: current_types,
    });
    this.client = client;
    if (!current_types) {
      for (const registration of this.command_handlers.values()) {
        const { name, params_schema, result_schema, expression } = registration;
        client.types.addCustomCommand({
          name,
          params_schema,
          result_schema,
          expression,
        });
      }
      for (const registration of this.event_bindings.values())
        client.types.addCustomEvent(registration);
      for (const registrations of Object.values(this.middlewares)) {
        for (const registration of registrations) {
          const { name, phase, expression } = registration;
          client.types.addCustomMiddleware({ name, phase, expression });
        }
      }
    }
    const publish_subscriptions = Object.values(nativeEventSchemas).map(
      (event) =>
        client.upstream.on(event, (payload, _targetId, cdpSessionId) => {
          void this.publishEvent(event.id, payload, cdpSessionId).catch(
            (error) =>
              console.error(
                "[ModCDPServer] upstream event listener failed",
                error,
              ),
          );
        }),
    );
    this.active_server_client_subscription = {
      remove: () => {
        for (const subscription of publish_subscriptions) subscription.remove();
      },
    };
    return client;
  }

  private async evaluateInServiceWorker(
    expression: string,
  ): Promise<ProtocolResult> {
    const client = this.setupServerClient();
    const service_worker_url = this.currentServiceWorkerUrl();
    const service_worker_target = (await client.upstream.getTargets()).find(
      (target) => target.url === service_worker_url,
    );
    if (!service_worker_target)
      throw new Error(
        `Could not find ModCDP service worker target ${service_worker_url}.`,
      );
    const route = await client.router.ensureRouteForTarget(
      service_worker_target.targetId,
    );

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
     * must go through the currently configured browser-target upstream transport
     * (`loopback_cdp` or `chrome_debugger`) via the generic upstream interface.
     */
    const result = await client.upstream.send(
      Runtime.EvaluateCommand,
      { expression, awaitPromise: true, returnByValue: true },
      route,
    );
    if (result.exceptionDetails) {
      const exception = result.exceptionDetails;
      throw new Error(
        exception.exception?.description ||
          exception.text ||
          "Runtime evaluation failed",
      );
    }
    return (result.result?.value ?? {}) as ProtocolResult;
  }

  private async evaluateUserExpression({
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
    return this.evaluateInServiceWorker(`
      (async () => {
        const params = ${JSON.stringify(params ?? {})};
        const method = ${JSON.stringify(method)};
        const cdpSessionId = ${JSON.stringify(cdpSessionId)};
        const upstream = globalThis.ModCDP.client;
        const downstream = globalThis.ModCDP.downstream;
        const ModCDP = globalThis.ModCDP;
        const chrome = globalThis.chrome;
        const value = (${expression});
        return typeof value === "function" ? await value(params || {}, method) : value;
      })()
    `);
  }

  private registerDefaultCommands() {
    this.addCustomEvent({ name: "Mod.pong" });
    this.addCustomCommand({
      name: "Mod.ping",
      handler: async (
        raw_params: ProtocolParams = {},
        cdpSessionId: string | null = null,
      ) => {
        const params = raw_params as ModCDPPingParams;
        const received_at = Date.now();
        await this.emit(
          "Mod.pong",
          {
            sent_at:
              typeof params.sent_at === "number" ? params.sent_at : received_at,
            received_at,
            from: "extension-service-worker",
          },
          cdpSessionId,
        );
        return { ok: true };
      },
    });
    this.addCustomCommand({
      name: "Mod.configure",
      handler: async (params: ProtocolParams = {}) =>
        this.configure(params as ModCDPConfigureParams),
    });
    this.addCustomCommand({
      name: "Mod.evaluate",
      handler: async (raw_params: ProtocolParams = {}) => {
        const {
          expression,
          params = {},
          cdpSessionId = null,
        } = raw_params as Record<string, unknown>;
        return await this.evaluateUserExpression({
          expression: String(expression),
          params: params as ProtocolPayload,
          cdpSessionId: typeof cdpSessionId === "string" ? cdpSessionId : null,
        });
      },
    });
    this.addCustomCommand({
      name: "Mod.getTopology",
      handler: async (params: ProtocolParams = {}) =>
        this.setupServerClient().router.getTopology(
          params as Record<string, unknown>,
        ),
    });
    this.addCustomCommand({
      name: "Mod.addCustomCommand",
      handler: async (params: ProtocolParams = {}) =>
        this.addCustomCommand(params as ModCDPCustomCommandRegistration),
    });
    this.addCustomCommand({
      name: "Mod.addCustomEvent",
      handler: async (params: ProtocolParams = {}) =>
        this.addCustomEvent(params as ModCDPCustomEventRegistration),
    });
    this.addCustomCommand({
      name: "Mod.addMiddleware",
      handler: async (params: ProtocolParams = {}) =>
        this.addMiddleware(params as ModCDPMiddlewareRegistration),
    });
  }

  private registerChromeKeepAliveListeners() {
    const chrome_api = this.global_scope.chrome;
    try {
      chrome_api?.runtime?.onStartup?.addListener(() => {
        void this.ensureOffscreenKeepAlive();
      });
    } catch {}
    try {
      chrome_api?.runtime?.onInstalled?.addListener(() => {
        void this.ensureOffscreenKeepAlive();
      });
    } catch {}
    try {
      chrome_api?.tabs?.onCreated?.addListener(() => {
        void this.ensureOffscreenKeepAlive();
      });
    } catch {}
    try {
      chrome_api?.runtime?.onConnect?.addListener((port) => {
        if (port.name !== this.offscreen_keep_alive_port_name) return;
        this.offscreen_keep_alive_port = port;
        port.onMessage.addListener(() => {});
        port.onDisconnect.addListener(() => {
          if (this.offscreen_keep_alive_port === port)
            this.offscreen_keep_alive_port = null;
        });
      });
    } catch {}
  }

  private registryMatch<T>(registry: Map<string, T>, name: string): T | null {
    const exact = registry.get(name);
    if (exact) return exact;
    let match: T | null = null;
    let match_prefix_length = -1;
    for (const [pattern, value] of registry) {
      if (!pattern.endsWith(".*")) continue;
      const prefix = pattern.slice(0, -1);
      if (!name.startsWith(prefix) || prefix.length <= match_prefix_length)
        continue;
      match = value;
      match_prefix_length = prefix.length;
    }
    return match;
  }

  private normalizeModCDPName(
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
      (typeof meta?.cdp_command_name === "string"
        ? meta.cdp_command_name
        : undefined) ??
      (typeof meta?.cdp_event_name === "string"
        ? meta.cdp_event_name
        : undefined) ??
      value?.id ??
      (typeof meta?.id === "string" ? meta.id : undefined) ??
      (typeof meta?.name === "string" ? meta.name : undefined) ??
      value?.name;
    if (typeof name !== "string" || !name)
      throw new Error(
        "Expected a CDP name string or a named CDP schema/alias.",
      );
    return name;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private currentServiceWorkerUrl() {
    const chrome_api = this.global_scope.chrome;
    const manifest = chrome_api?.runtime?.getManifest?.();
    const service_worker =
      manifest && typeof manifest === "object" && "background" in manifest
        ? (manifest.background as { service_worker?: unknown } | undefined)
            ?.service_worker
        : null;
    const service_worker_path =
      typeof service_worker === "string" && service_worker.length > 0
        ? service_worker.replace(/^\//, "")
        : "modcdp/service_worker.js";
    return chrome_api.runtime.getURL(service_worker_path);
  }

  private encodeBindingPayload({
    event,
    data,
    cdpSessionId = null,
  }: {
    event: string;
    data: ProtocolPayload;
    cdpSessionId?: string | null;
  }) {
    return JSON.stringify({ event, data, cdpSessionId });
  }
}

export function installModCDPServer(
  global_scope: ModCDPGlobalScope = globalThis as ModCDPGlobalScope,
  options: Omit<ModCDPServerOptions, "global_scope"> = {},
): ModCDPServer {
  if (
    global_scope.ModCDP?.handleCommand &&
    global_scope.ModCDP?.addCustomEvent
  )
    return global_scope.ModCDP;
  const server = new ModCDPServer({ ...options, global_scope });
  void server.start();
  return server;
}
