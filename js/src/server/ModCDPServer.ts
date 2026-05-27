// MODCDP_TS_ONLY: DO NOT TRANSLATE THIS FILE TO OTHER LANGUAGES.
// Reason: only runs in browser.
// ModCDPServer: lives inside an extension service worker. Owns custom command
// handlers, event bindings, downstream delivery, and the browser-target client.
// Shape metadata belongs to ModCDPServer.client.types so the server and its
// upstream client validate against one registry object.

import * as Browser from "../types/generated/zod/Browser.js";
import * as Runtime from "../types/generated/zod/Runtime.js";
import type { z } from "zod";
import { ModCDPClient, upstream_transport_constructors } from "../client/ModCDPClient.js";
import { ModCDPConfigureParamsSchema, ModCDPServerConfigSchema } from "../types/modcdp.js";
import { routeFor } from "../translate/translate.js";
import { ChromeDebuggerUpstreamTransport } from "../transport/ChromeDebuggerUpstreamTransport.js";
import { DownstreamTransportSet } from "../transport/DownstreamTransportSet.js";
import { NativeMessagingDownstreamTransport } from "../transport/NativeMessagingDownstreamTransport.js";
import { NATSDownstreamTransport } from "../transport/NATSDownstreamTransport.js";
import { ReverseWSDownstreamTransport } from "../transport/ReverseWSDownstreamTransport.js";
import { modCDPToJSON } from "../types/toJSON.js";
import type {
  CdpResponseMessage,
  ModCDPConfigureParams,
  ModCDPCustomCommandRegistration,
  ModCDPCustomEventRegistration,
  ModCDPMiddlewareRegistration,
  ModCDPRoutes,
  ModCDPServerConfig,
  ProtocolParams,
  ProtocolPayload,
  ProtocolResult,
} from "../types/modcdp.js";

type MiddlewarePhase = "request" | "response" | "event";

type ModCDPGlobalScope = typeof globalThis &
  Record<string, unknown> & {
    ModCDP?: ModCDPServer;
  };

const DEFAULT_ROUTES = {
  "Mod.*": "service_worker",
  "Custom.*": "service_worker",
  "*.*": "auto",
} satisfies ModCDPRoutes;

const OFFSCREEN_KEEP_ALIVE_PORT_NAME = "ModCDPOffscreenKeepAlive";
const OFFSCREEN_KEEP_ALIVE_PATH = "offscreen/keepalive.html";

upstream_transport_constructors.set("chromedebugger", ChromeDebuggerUpstreamTransport);

/**
 * Extension-side ModCDP server.
 *
 * The server owns client-facing downstream transports, service-worker command
 * handlers, custom command/event/middleware registries, and one ModCDPClient
 * pointed upstream at browser targets. It does not implement a browser-target
 * transport itself; target/session/context routing stays inside the upstream
 * ModCDPClient.router.
 */
class ModCDPServer {
  // sub-services
  client!: ModCDPClient;
  downstream: DownstreamTransportSet;

  // runtime state
  started_at: string | null;
  // Server-only secret used to verify that a discovered loopback endpoint is
  // this same service worker. Browser routing/downstream config live on
  // client.router, client.upstream, client.config, and downstream.
  server_browser_token: string | null;

  private creating_offscreen_keep_alive: Promise<void> | null = null;
  private offscreen_keep_alive_port: chrome.runtime.Port | null = null;

  constructor(config: z.input<typeof ModCDPServerConfigSchema> = {}) {
    config = ModCDPServerConfigSchema.parse(config);
    this.server_browser_token = config.server_browser_token ?? null;
    this.started_at = null;
    this.downstream = new DownstreamTransportSet({
      ...(config.downstream ?? {}),
      closeBrowser: () => this.client.router.send(Browser.CloseCommand.id, {}).then(() => {}),
    });
    this.client = new ModCDPClient({
      launcher: { launcher_mode: "none" },
      injector: { injector_mode: "none" },
      upstream: config.upstream ?? ({ upstream_mode: "chromedebugger" } as Record<string, unknown>),
      router: {
        ...(config.router ?? {}),
        router_routes: {
          ...DEFAULT_ROUTES,
          ...(config.router?.router_routes ?? {}),
        },
      },
      client_config: config.client_config ?? {},
      server_config: null,
      types: {
        custom_commands: config.custom_commands ?? [],
        custom_events: config.custom_events ?? [],
        custom_middlewares: config.custom_middlewares ?? [],
      },
    });
  }

  // server.types == server.client.types, they share one registry to avoid confusion with drifting registries
  get types() {
    return this.client.types;
  }

  toJSON() {
    return modCDPToJSON(this, {
      state: {
        started_at: this.started_at,
        creating_offscreen_keep_alive: this.creating_offscreen_keep_alive != null,
        offscreen_keep_alive_port: this.offscreen_keep_alive_port != null,
      },
      children: {
        client: this.client,
        downstream: this.downstream,
      },
    });
  }

  /** Install transports/default commands/listeners and return this server. */
  async start(): Promise<this> {
    if (this.started_at === null) {
      this.started_at = new Date().toISOString();
      for (const transport of [
        new ReverseWSDownstreamTransport(),
        new NativeMessagingDownstreamTransport(),
        new NATSDownstreamTransport(),
      ]) {
        this.downstream.add(transport);
      }
      this.downstream.mirrorEventsFrom(this.client, {
        transformEvent: async (message) => {
          const cdpSessionId = message.sessionId ?? null;
          const params = await this.runMiddleware("event", message.method, message.params ?? {}, {
            cdpSessionId,
            event: message,
          });
          return {
            ...message,
            params: this.types.parseEventPayload(message.method, params ?? {}),
          };
        },
      });
      this.downstream.onRequest(async (message): Promise<CdpResponseMessage> => {
        try {
          return {
            id: message.id,
            result: await this.handleCommand(message.method, message.params ?? {}, message.sessionId ?? null),
          };
        } catch (error) {
          return {
            id: message.id,
            error: {
              code: -32000,
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      });
      (globalThis as ModCDPGlobalScope).ModCDP = this;
      this.registerChromeLifecycleEvents();
      await this.client.connect();
      if (this.client.upstream.config.upstream_mode === "ws") await this.client.router.start();
      await this.client.upstream.getTargets();
    }
    void this.ensureOffscreenKeepAlive();
    this.downstream.startPollingForClients();
    return this;
  }

  /** Ensure the offscreen keepalive document exists when Chrome exposes it. */
  async ensureOffscreenKeepAlive() {
    const chrome_api = globalThis.chrome;
    const offscreen = chrome_api?.offscreen;
    if (!offscreen || !chrome_api?.runtime?.getURL) return { started: false, reason: "offscreen_unavailable" };

    const offscreen_url = chrome_api.runtime.getURL(OFFSCREEN_KEEP_ALIVE_PATH);
    try {
      const existing_contexts = chrome_api.runtime.getContexts
        ? await chrome_api.runtime.getContexts({
            contextTypes: ["OFFSCREEN_DOCUMENT"],
            documentUrls: [offscreen_url],
          })
        : [];
      if (existing_contexts.length > 0) return { started: true, existing: true };

      this.creating_offscreen_keep_alive ??= offscreen
        .createDocument({
          url: OFFSCREEN_KEEP_ALIVE_PATH,
          reasons: ["BLOBS"],
          justification: "Keep ModCDP service worker active while CDP clients route commands through it.",
        })
        .finally(() => {
          this.creating_offscreen_keep_alive = null;
        });
      await this.creating_offscreen_keep_alive;
      return { started: true };
    } catch (error) {
      return {
        started: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  addCustomCommand({
    name,
    params_schema = null,
    result_schema = null,
    expression = null,
  }: ModCDPCustomCommandRegistration) {
    const registered_name = this.types.addCustomCommand({
      name,
      params_schema,
      result_schema,
      expression,
    });
    return { name: registered_name, registered: true };
  }

  addCustomEvent({ name, event_schema = null }: ModCDPCustomEventRegistration) {
    const registered_name = this.types.addCustomEvent({ name, event_schema });
    return { name: registered_name, registered: true };
  }

  addMiddleware({ name = "*", phase, expression }: ModCDPMiddlewareRegistration) {
    const registered_name = this.types.addCustomMiddleware({ name, phase, expression });
    return { name: registered_name, phase, registered: true };
  }

  async runMiddleware(phase: MiddlewarePhase, name: string, payload: ProtocolPayload, context: ProtocolPayload = {}) {
    const matching = this.types.customMiddlewareRegistrations(phase, name);
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
      const ctx =
        context && typeof context === "object" && !Array.isArray(context) ? (context as Record<string, unknown>) : {};
      const context_object: Record<string, unknown> = { ...ctx, name, phase };
      const cdpSessionId = typeof context_object.cdpSessionId === "string" ? context_object.cdpSessionId : null;
      const result = (await this.evaluateInServiceWorker({
        expression: `
          async (params) => {
            const payload = params.payload || {};
            const context = params.context || {};
            const next = async (nextValue = payload) => ({ __ModCDP_middleware_next__: true, value: nextValue });
            const middleware = (${middleware.expression});
            return await middleware(payload, next, context);
          }
        `,
        params: { payload: value, context: context_object },
        cdpSessionId,
      })) as Record<string, unknown>;
      if (result?.__ModCDP_middleware_next__ === true) {
        const next_result = await next(result.value as ProtocolPayload);
        const { __ModCDP_middleware_next__, value: _value, ...overrides } = result;
        if (Object.keys(overrides).length === 0) return next_result;
        return next_result != null && typeof next_result === "object" && !Array.isArray(next_result)
          ? { ...(next_result as Record<string, unknown>), ...overrides }
          : overrides;
      }
      return result;
    };
    return dispatch(0, payload);
  }

  async handleCommand(method: string, params: ProtocolParams = {}, cdpSessionId: string | null = null) {
    const request = { method, params, cdpSessionId };
    const middleware_params = await this.runMiddleware("request", method, params, { cdpSessionId, request });
    if (middleware_params == null) throw new Error(`Request middleware for ${method} returned no params.`);
    params = middleware_params as ProtocolParams;

    const types = this.types;
    params = types.parseCommandParams(method, params);
    if (method === "Mod.configure") {
      /*
       * Mod.configure is the bootstrap command for the service-worker server.
       * It may be the first request received over a downstream-only transport
       * such as reversews/nativemessaging/nats, before this server has applied
       * the caller's upstream/router config. Params and results still go
       * through CDPTypes exactly like every other command; only execution is
       * handled directly so the configure payload can install the remote
       * registry entries used by later service-worker commands.
       */
      await this.configure(ModCDPConfigureParamsSchema.parse(params));
      return types.parseCommandResult(method, params) as ProtocolResult;
    }
    let result;
    const command = types.custom_commands.get(method);
    if (command) {
      if (typeof command.expression !== "string" || command.expression.length === 0)
        throw new Error(`Service-worker command ${method} was registered without an expression.`);
      result = await this.evaluateInServiceWorker({
        expression: command.expression,
        params,
        cdpSessionId,
        method,
      });
      result = await this.runMiddleware("response", method, result, {
        cdpSessionId,
        request: { ...request, params },
        response: { result },
      });
      return types.parseCommandResult(method, result) as ProtocolResult;
    }

    const upstream = routeFor(method, this.client.router.config.router_routes);
    if (upstream === "service_worker") throw new Error(`No service-worker command registered for ${method}.`);
    if (upstream !== "auto" && upstream !== "loopback_cdp" && upstream !== "chromedebugger")
      throw new Error(`No service-worker command registered for ${method}.`);
    const client = this.client;
    result = await client.router.send(method, params, cdpSessionId);
    result = await this.runMiddleware("response", method, result, {
      cdpSessionId,
      request: { ...request, params },
      response: { result },
    });
    return client.types.parseCommandResult(method, result) as ProtocolResult;
  }

  /** Apply Mod.configure settings, server-owned transport config, and custom registry entries through one path. */
  async configure(params: z.input<typeof ModCDPConfigureParamsSchema> = {}) {
    params = ModCDPConfigureParamsSchema.parse(params);
    const custom_commands = params.custom_commands ?? [];
    const custom_events = params.custom_events ?? [];
    const custom_middlewares = params.custom_middlewares ?? [];

    this.server_browser_token = params.server_browser_token ?? this.server_browser_token;
    this.downstream.update(params.downstream ?? {});
    this.client = this.client.configure(params);
    for (const command of custom_commands) this.addCustomCommand(command as ModCDPCustomCommandRegistration);
    for (const event of custom_events) this.addCustomEvent(event as ModCDPCustomEventRegistration);
    for (const middleware of custom_middlewares) this.addMiddleware(middleware as ModCDPMiddlewareRegistration);
    if (this.started_at !== null) {
      await this.client.connect();
      if (this.client.upstream.config.upstream_mode === "ws") await this.client.router.start();
      await this.client.upstream.getTargets();
    }
    return this;
  }

  private async evaluateInServiceWorker({
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
    const client = this.client;
    const service_worker_url = this.currentServiceWorkerUrl();
    const service_worker_target = (await client.upstream.getTargets()).find(
      (target) => target.url === service_worker_url,
    );
    if (!service_worker_target) throw new Error(`Could not find ModCDP service worker target ${service_worker_url}.`);
    const route = await client.router.ensureRouteForTarget(service_worker_target.targetId);

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
     * (`loopback_cdp` or `chromedebugger`) via the generic upstream interface.
     */
    const result = await client.upstream.send(
      Runtime.EvaluateCommand,
      {
        expression: `
          (async () => {
            const params = ${JSON.stringify(params ?? {})};
            const method = ${JSON.stringify(method)};
            const cdpSessionId = ${JSON.stringify(cdpSessionId)};
            const upstream = globalThis.ModCDP.client;
            const downstream = globalThis.ModCDP.downstream;
            const ModCDP = globalThis.ModCDP;
            const cdp = {
              upstream,
              client: upstream,
              downstream,
              send: (method, params = {}, targetCdpSessionId = cdpSessionId) =>
                ModCDP.handleCommand(method, params, targetCdpSessionId),
            };
            const chrome = globalThis.chrome;
            const value = (${expression});
            return typeof value === "function" ? await value(params || {}, method) : value;
          })()
        `,
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

  registerChromeLifecycleEvents() {
    chrome.runtime.onStartup.addListener(() => {
      void this.start();
    });
    chrome.runtime.onInstalled.addListener(() => {
      void this.start();
    });
    chrome.tabs.onCreated.addListener(() => {
      void this.start();
    });
    chrome.runtime.onConnect.addListener((port) => {
      this.handleChromeRuntimeConnect(port);
    });
    chrome.action?.onClicked.addListener(() => {
      void chrome.runtime.openOptionsPage();
    });
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "modcdp.config.status") return false;
      sendResponse(this.toJSON());
      return false;
    });
  }

  private handleChromeRuntimeConnect(port: chrome.runtime.Port) {
    if (port.name !== OFFSCREEN_KEEP_ALIVE_PORT_NAME) return;
    this.offscreen_keep_alive_port = port;
    port.onMessage.addListener(() => {});
    port.onDisconnect.addListener(() => {
      if (this.offscreen_keep_alive_port === port) this.offscreen_keep_alive_port = null;
    });
  }

  private currentServiceWorkerUrl() {
    const chrome_api = globalThis.chrome;
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
}

export { ModCDPServer };
export {
  DEFAULT_NATIVEMESSAGING_BRIDGE_HOST_NAME,
  DEFAULT_NATIVEMESSAGING_BRIDGE_RECONNECT_INTERVAL_MS,
} from "../transport/NativeMessagingDownstreamTransport.js";
export {
  DEFAULT_NATS_BRIDGE_RECONNECT_INTERVAL_MS,
  DEFAULT_NATS_BRIDGE_SUBJECT_PREFIX,
} from "../transport/NATSDownstreamTransport.js";
export { DEFAULT_REVERSE_BRIDGE_RECONNECT_INTERVAL_MS } from "../transport/ReverseWSDownstreamTransport.js";
export type { ModCDPServerConfig } from "../types/modcdp.js";
