// ModCDPServer: lives inside an extension service worker. Owns the registry
// of custom commands and event bindings, and emits events through the binding
// API installed by the client (Runtime.addBinding -> globalThis[__ModCDP_custom_event__]).
//
// The installer is intentionally self-contained so the bridge can inject the
// same server implementation into an already-running extension service worker
// when Chrome refuses Extensions.loadUnpacked.

import { commands as nativeCommandSchemas, events as nativeEventSchemas } from "../types/generated/zod.js";
import * as Browser from "../types/generated/zod/Browser.js";
import { ProtocolPayloadSchema, normalizeModCDPPayloadSchema } from "../types/modcdp.js";
import { AutoSessionRouter, type ServerUpstreamTransport } from "../router/AutoSessionRouter.js";
import { ChromeDebuggerTransport } from "./ChromeDebuggerTransport.js";
import { LoopbackCdpTransport } from "./LoopbackCdpTransport.js";
import type {
  CdpCommandMessage,
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
export const DEFAULT_REVERSE_BRIDGE_RECONNECT_INTERVAL_MS = 2_000;
export const DEFAULT_NATIVE_BRIDGE_HOST_NAME = "com.modcdp.bridge";
export const DEFAULT_NATIVE_BRIDGE_RECONNECT_INTERVAL_MS = 2_000;
export const DEFAULT_NATS_BRIDGE_RECONNECT_INTERVAL_MS = 2_000;
export const DEFAULT_NATS_BRIDGE_SUBJECT_PREFIX = "modcdp.default";
export const DEFAULT_DOWNSTREAM_CLIENT_TIMEOUT_MS = 1_000;

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
  const DEFAULT_REVERSE_BRIDGE_RECONNECT_INTERVAL_MS = 2_000;
  const DEFAULT_NATIVE_BRIDGE_HOST_NAME = "com.modcdp.bridge";
  const DEFAULT_NATIVE_BRIDGE_RECONNECT_INTERVAL_MS = 2_000;
  const DEFAULT_NATS_BRIDGE_RECONNECT_INTERVAL_MS = 2_000;
  const DEFAULT_NATS_BRIDGE_SUBJECT_PREFIX = "modcdp.default";
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

  const commandHandlers = new Map<string, ModCDPCustomCommandRegistration>();
  const eventBindings = new Map<string, ModCDPCustomEventRegistration>();
  const eventListeners = new Set<(event: string, data: ProtocolPayload, cdpSessionId: string | null) => void>();
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
      if (!activeServerUpstreamTransport)
        registerServerUpstreamTransport(configuredServerUpstreamTransportName(ModCDPServer.routes));
      void activeServerUpstreamTransport?.send(Browser.CloseCommand, {}).catch(() => {});
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
    const event = registryMatch(eventBindings, eventName);
    payload = eventPayloadSchema(eventName, event)?.parse(payload) ?? payload;

    for (const listener of eventListeners) {
      try {
        listener(eventName, payload, cdpSessionId);
      } catch (error) {
        console.error("[ModCDPServer] event listener failed", error);
      }
    }
    let emittedThroughReverseBridge = false;
    if (reverseBridgeSocket?.readyState === WebSocket.OPEN) {
      const message: CdpEventMessage = {
        method: eventName,
        params: (payload ?? {}) as CdpEventMessage["params"],
      };
      if (cdpSessionId) message.sessionId = cdpSessionId;
      reverseBridgeSocket.send(JSON.stringify(message));
      emittedThroughReverseBridge = true;
    }
    let emittedThroughNativeBridge = false;
    if (nativeBridgePort) {
      const message: CdpEventMessage = {
        method: eventName,
        params: (payload ?? {}) as CdpEventMessage["params"],
      };
      if (cdpSessionId) message.sessionId = cdpSessionId;
      nativeBridgePort.postMessage(message);
      emittedThroughNativeBridge = true;
    }
    let emittedThroughNatsBridge = false;
    if (nats_bridge_socket?.readyState === WebSocket.OPEN) {
      const message: CdpEventMessage = {
        method: eventName,
        params: (payload ?? {}) as CdpEventMessage["params"],
      };
      if (cdpSessionId) message.sessionId = cdpSessionId;
      publishNats(`${nats_bridge_subject_prefix}.browser_to_client`, {
        type: "modcdp.nats.message",
        message,
      });
      emittedThroughNatsBridge = true;
    }

    const isCustomEvent = registryMatch(eventBindings, eventName) != null;
    let emittedThroughBinding = false;
    if (isCustomEvent) {
      const customBinding = globalScope[CUSTOM_EVENT_BINDING_NAME];
      if (typeof customBinding === "function") {
        customBinding(
          encodeBindingPayload({
            event: eventName,
            data: payload,
            cdpSessionId,
          }),
        );
        emittedThroughBinding = true;
      }
    } else {
      const mirrorBinding = globalScope[UPSTREAM_EVENT_BINDING_NAME];
      if (typeof mirrorBinding === "function") {
        mirrorBinding(
          encodeBindingPayload({
            event: eventName,
            data: payload,
            cdpSessionId,
          }),
        );
        emittedThroughBinding = true;
      }
    }
    return emittedThroughBinding ||
      emittedThroughReverseBridge ||
      emittedThroughNativeBridge ||
      emittedThroughNatsBridge
      ? { event: eventName, emitted: true }
      : { event: eventName, emitted: false, reason: "binding_not_installed" };
  }

  const defaultRoutes = {
    "Mod.*": "service_worker",
    "Custom.*": "service_worker",
    "*.*": "auto",
  } satisfies ModCDPRoutes;
  const serverUpstreamRouteNames = new Set(["auto", "loopback_cdp", "chrome_debugger"]);

  let reverseBridgeSocket: WebSocket | null = null;
  let reverseBridgeUrl: string | null = null;
  let reverseBridgeReconnectIntervalMs = DEFAULT_REVERSE_BRIDGE_RECONNECT_INTERVAL_MS;
  let reverseBridgeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let nativeBridgePort: chrome.runtime.Port | null = null;
  let nativeBridgeHostName: string | null = null;
  let nativeBridgeReconnectIntervalMs = DEFAULT_NATIVE_BRIDGE_RECONNECT_INTERVAL_MS;
  let nativeBridgeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let nats_bridge_socket: WebSocket | null = null;
  let nats_bridge_url: string | null = null;
  let nats_bridge_subject_prefix = DEFAULT_NATS_BRIDGE_SUBJECT_PREFIX;
  let nats_bridge_reconnect_interval_ms = DEFAULT_NATS_BRIDGE_RECONNECT_INTERVAL_MS;
  let nats_bridge_reconnect_timer: ReturnType<typeof setTimeout> | null = null;
  let nats_bridge_buffer = "";
  const offscreenKeepAlivePortName = "ModCDPOffscreenKeepAlive";
  const offscreenKeepAlivePath = "offscreen/keepalive.html";
  let creatingOffscreenKeepAlive: Promise<void> | null = null;
  let offscreenKeepAlivePort: chrome.runtime.Port | null = null;
  let serverAutoRouter: AutoSessionRouter | null = null;

  function registryMatch<T>(registry: Map<string, T>, name: string): T | null {
    const exact = registry.get(name);
    if (exact) return exact;
    let match: T | null = null;
    let matchPrefixLength = -1;
    for (const [pattern, value] of registry) {
      if (!pattern.endsWith(".*")) continue;
      const prefix = pattern.slice(0, -1);
      if (!name.startsWith(prefix) || prefix.length <= matchPrefixLength) continue;
      match = value;
      matchPrefixLength = prefix.length;
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

  function startOffscreenKeepAlive() {
    void ensureOffscreenKeepAlive().catch(() => {});
  }

  function scheduleReverseBridgeReconnect(delayMs: number) {
    if (!reverseBridgeUrl) return;
    if (reverseBridgeReconnectTimer) return;
    reverseBridgeReconnectTimer = setTimeout(() => {
      reverseBridgeReconnectTimer = null;
      void connectReverseBridge(reverseBridgeUrl).catch(() => {});
    }, delayMs);
  }

  function stopReverseBridge(reason = "stopped") {
    const upstream_reversews_url = reverseBridgeUrl;
    reverseBridgeUrl = null;
    if (reverseBridgeReconnectTimer) {
      clearTimeout(reverseBridgeReconnectTimer);
      reverseBridgeReconnectTimer = null;
    }
    const socket = reverseBridgeSocket;
    reverseBridgeSocket = null;
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
      socket.close(1000, reason);
    }
    return { upstream_reversews_url, stopped: true, reason };
  }

  function scheduleNativeBridgeReconnect(delayMs: number) {
    if (!nativeBridgeHostName) return;
    if (nativeBridgeReconnectTimer) return;
    nativeBridgeReconnectTimer = setTimeout(() => {
      nativeBridgeReconnectTimer = null;
      connectNativeBridge(nativeBridgeHostName);
    }, delayMs);
  }

  function scheduleNatsBridgeReconnect(delayMs: number) {
    if (!nats_bridge_url) return;
    if (nats_bridge_reconnect_timer) return;
    nats_bridge_reconnect_timer = setTimeout(() => {
      nats_bridge_reconnect_timer = null;
      void connectNatsBridge(nats_bridge_url).catch(() => {});
    }, delayMs);
  }

  async function handleReverseBridgeMessage(ws: WebSocket, data: unknown) {
    let message: CdpCommandMessage;
    try {
      const parsed = JSON.parse(typeof data === "string" ? data : String(data));
      if (typeof parsed?.id !== "number" || typeof parsed?.method !== "string") return;
      message = parsed as CdpCommandMessage;
    } catch {
      return;
    }

    try {
      const result = await ModCDPServer.handleCommand(message.method, message.params ?? {}, message.sessionId ?? null);
      ws.send(JSON.stringify({ id: message.id, result }));
    } catch (error) {
      ws.send(
        JSON.stringify({
          id: message.id,
          error: {
            code: -32000,
            message: errorMessage(error),
          },
        }),
      );
    }
  }

  async function handleNativeBridgeMessage(port: chrome.runtime.Port, data: unknown) {
    let message: CdpCommandMessage;
    try {
      if (
        typeof (data as CdpCommandMessage)?.id !== "number" ||
        typeof (data as CdpCommandMessage)?.method !== "string"
      )
        return;
      message = data as CdpCommandMessage;
    } catch {
      return;
    }

    try {
      const result = await ModCDPServer.handleCommand(message.method, message.params ?? {}, message.sessionId ?? null);
      port.postMessage({ id: message.id, result });
    } catch (error) {
      port.postMessage({
        id: message.id,
        error: {
          code: -32000,
          message: errorMessage(error),
        },
      });
    }
  }

  async function handleNatsBridgePayload(payload: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    if (record?.type === "modcdp.nats.hello") {
      publishNats(`${nats_bridge_subject_prefix}.browser_to_client`, {
        type: "modcdp.nats.hello",
        role: "extension-service-worker",
        version: 1,
        extension_id: globalScope.chrome?.runtime?.id ?? null,
      });
      return;
    }
    const candidate = record?.type === "modcdp.nats.message" ? record.message : parsed;
    if (
      !candidate ||
      typeof candidate !== "object" ||
      typeof (candidate as CdpCommandMessage).id !== "number" ||
      typeof (candidate as CdpCommandMessage).method !== "string"
    )
      return;
    const message = candidate as CdpCommandMessage;
    try {
      const result = await ModCDPServer.handleCommand(message.method, message.params ?? {}, message.sessionId ?? null);
      publishNats(`${nats_bridge_subject_prefix}.browser_to_client`, {
        type: "modcdp.nats.message",
        message: { id: message.id, result },
      });
    } catch (error) {
      publishNats(`${nats_bridge_subject_prefix}.browser_to_client`, {
        type: "modcdp.nats.message",
        message: {
          id: message.id,
          error: {
            code: -32000,
            message: errorMessage(error),
          },
        },
      });
    }
  }

  async function connectReverseBridge(endpoint: string) {
    if (
      reverseBridgeSocket?.readyState === WebSocket.OPEN ||
      reverseBridgeSocket?.readyState === WebSocket.CONNECTING
    ) {
      return {
        upstream_reversews_url: endpoint,
        connected: reverseBridgeSocket.readyState === WebSocket.OPEN,
      };
    }

    const ws = new WebSocket(endpoint);
    reverseBridgeSocket = ws;
    ws.addEventListener("open", () => {
      startOffscreenKeepAlive();
      ws.send(
        JSON.stringify({
          type: "modcdp.reverse.hello",
          role: "extension-service-worker",
          version: 1,
          extension_id: globalScope.chrome?.runtime?.id ?? null,
        }),
      );
    });
    ws.addEventListener("message", (event) => {
      void handleReverseBridgeMessage(ws, event.data);
    });
    ws.addEventListener("error", () => {
      if (reverseBridgeSocket === ws) reverseBridgeSocket = null;
      scheduleReverseBridgeReconnect(reverseBridgeReconnectIntervalMs);
    });
    ws.addEventListener("close", () => {
      if (reverseBridgeSocket === ws) reverseBridgeSocket = null;
      scheduleReverseBridgeReconnect(reverseBridgeReconnectIntervalMs);
    });
    return { upstream_reversews_url: endpoint, connected: false };
  }

  function connectNativeBridge(hostName: string) {
    const chromeApi = globalScope.chrome;
    if (!chromeApi?.runtime?.connectNative) {
      scheduleNativeBridgeReconnect(nativeBridgeReconnectIntervalMs);
      return {
        upstream_nativemessaging_host_name: hostName,
        connected: false,
        reason: "native_messaging_unavailable",
      };
    }
    if (nativeBridgePort) return { upstream_nativemessaging_host_name: hostName, connected: true };
    try {
      ModCDPServer.native_bridge_attempts += 1;
      ModCDPServer.native_bridge_last_error = null;
      const port = chromeApi.runtime.connectNative(hostName);
      nativeBridgePort = port;
      ModCDPServer.native_bridge_connected = true;
      startOffscreenKeepAlive();
      port.postMessage({
        type: "modcdp.native.hello",
        role: "extension-service-worker",
        version: 1,
        extension_id: globalScope.chrome?.runtime?.id ?? null,
      });
      port.onMessage.addListener((message) => {
        void handleNativeBridgeMessage(port, message);
      });
      port.onDisconnect.addListener(() => {
        if (nativeBridgePort === port) nativeBridgePort = null;
        ModCDPServer.native_bridge_connected = false;
        ModCDPServer.native_bridge_last_error =
          chromeApi.runtime.lastError?.message ?? "Native messaging port disconnected.";
        scheduleNativeBridgeReconnect(nativeBridgeReconnectIntervalMs);
      });
      return { upstream_nativemessaging_host_name: hostName, connected: true };
    } catch (error) {
      nativeBridgePort = null;
      ModCDPServer.native_bridge_connected = false;
      ModCDPServer.native_bridge_last_error = errorMessage(error);
      scheduleNativeBridgeReconnect(nativeBridgeReconnectIntervalMs);
      return {
        upstream_nativemessaging_host_name: hostName,
        connected: false,
        reason: errorMessage(error),
      };
    }
  }

  async function connectNatsBridge(endpoint: string) {
    if (!/^wss?:\/\//i.test(endpoint)) {
      throw new Error(`nats bridge endpoint must be a ws:// or wss:// URL for extension transport, got ${endpoint}.`);
    }
    if (nats_bridge_socket?.readyState === WebSocket.OPEN || nats_bridge_socket?.readyState === WebSocket.CONNECTING) {
      return {
        upstream_nats_url: endpoint,
        upstream_nats_subject_prefix: nats_bridge_subject_prefix,
        connected: nats_bridge_socket.readyState === WebSocket.OPEN,
      };
    }
    const ws = new WebSocket(endpoint);
    nats_bridge_socket = ws;
    nats_bridge_buffer = "";
    ws.addEventListener("open", () => {
      startOffscreenKeepAlive();
      writeNats(`CONNECT ${JSON.stringify(natsConnectOptions())}\r\nPING\r\n`);
      writeNats(`SUB ${nats_bridge_subject_prefix}.client_to_browser 1\r\n`);
      publishNats(`${nats_bridge_subject_prefix}.browser_to_client`, {
        type: "modcdp.nats.hello",
        role: "extension-service-worker",
        version: 1,
        extension_id: globalScope.chrome?.runtime?.id ?? null,
      });
    });
    ws.addEventListener("message", (event) => {
      void readNatsWebSocketData(event.data);
    });
    ws.addEventListener("error", () => {
      if (nats_bridge_socket === ws) nats_bridge_socket = null;
      scheduleNatsBridgeReconnect(nats_bridge_reconnect_interval_ms);
    });
    ws.addEventListener("close", () => {
      if (nats_bridge_socket === ws) nats_bridge_socket = null;
      scheduleNatsBridgeReconnect(nats_bridge_reconnect_interval_ms);
    });
    return {
      upstream_nats_url: endpoint,
      upstream_nats_subject_prefix: nats_bridge_subject_prefix,
      connected: false,
    };
  }

  function writeNats(data: string) {
    if (nats_bridge_socket?.readyState === WebSocket.OPEN) nats_bridge_socket.send(data);
  }

  function publishNats(subject: string, message: unknown) {
    const body = JSON.stringify(message);
    writeNats(`PUB ${subject} ${new TextEncoder().encode(body).byteLength}\r\n${body}\r\n`);
  }

  async function readNatsWebSocketData(data: unknown) {
    if (typeof data === "string") nats_bridge_buffer += data;
    else if (data instanceof ArrayBuffer) nats_bridge_buffer += new TextDecoder().decode(data);
    else if (ArrayBuffer.isView(data)) nats_bridge_buffer += new TextDecoder().decode(data);
    else if (typeof Blob !== "undefined" && data instanceof Blob) nats_bridge_buffer += await data.text();
    else return;
    nats_bridge_buffer = consumeNatsProtocol(nats_bridge_buffer);
  }

  function consumeNatsProtocol(buffer: string) {
    for (;;) {
      const lineEnd = buffer.indexOf("\r\n");
      if (lineEnd < 0) return buffer;
      const line = buffer.slice(0, lineEnd);
      const upper = line.toUpperCase();
      if (upper.startsWith("MSG ")) {
        const parts = line.split(/\s+/);
        const size = Number(parts[parts.length - 1]);
        const payloadStart = lineEnd + 2;
        const payloadEnd = payloadStart + size;
        if (!Number.isInteger(size) || buffer.length < payloadEnd + 2) return buffer;
        const payload = buffer.slice(payloadStart, payloadEnd);
        buffer = buffer.slice(payloadEnd + 2);
        void handleNatsBridgePayload(payload);
        continue;
      }
      buffer = buffer.slice(lineEnd + 2);
      if (upper === "PING") writeNats("PONG\r\n");
    }
  }

  function natsConnectOptions() {
    return {
      verbose: false,
      pedantic: false,
      lang: "modcdp-extension",
      version: "1",
      protocol: 1,
    };
  }

  function currentServiceWorkerUrl() {
    const chromeApi = globalScope.chrome;
    const manifest = chromeApi?.runtime?.getManifest?.();
    const service_worker =
      manifest && typeof manifest === "object" && "background" in manifest
        ? (manifest.background as { service_worker?: unknown } | undefined)?.service_worker
        : null;
    const service_worker_path =
      typeof service_worker === "string" && service_worker.length > 0
        ? service_worker.replace(/^\//, "")
        : "modcdp/service_worker.js";
    return chromeApi.runtime.getURL(service_worker_path);
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
    const cdp = ModCDPServer.attachToSession(cdpSessionId);
    const ModCDP = ModCDPServer;
    const chrome = globalScope.chrome;
    const value = Function(
      "params",
      "method",
      "cdp",
      "ModCDP",
      "chrome",
      `"use strict"; return (${expression});`,
    )(params ?? {}, method, cdp, ModCDP, chrome);
    return (typeof value === "function" ? await value(params || {}, method) : value) as ProtocolResult;
  }

  type SelectedServerUpstreamTransportName = "loopback_cdp" | "chrome_debugger";

  const serverUpstreamTransports = new Map<SelectedServerUpstreamTransportName, ServerUpstreamTransport>();
  let activeServerUpstreamTransport: ServerUpstreamTransport | null = null;
  let activeServerUpstreamSubscription: { remove: () => void } | null = null;

  function resolveServerUpstreamTransportName(route: string): SelectedServerUpstreamTransportName {
    if (route === "loopback_cdp" || route === "chrome_debugger") return route;
    if (route === "auto") return ModCDPServer.loopback_cdp_url ? "loopback_cdp" : "chrome_debugger";
    throw new Error(`No ModCDP server upstream transport registered for route ${route}.`);
  }

  function configuredServerUpstreamTransportName(routes: ModCDPRoutes) {
    const upstreams = new Set<SelectedServerUpstreamTransportName>();
    for (const route of Object.values(routes)) {
      if (serverUpstreamRouteNames.has(route)) {
        upstreams.add(resolveServerUpstreamTransportName(route));
      }
    }
    if (upstreams.size > 1) throw new Error("server_routes cannot mix loopback_cdp and chrome_debugger routes.");
    return [...upstreams][0] ?? resolveServerUpstreamTransportName("auto");
  }

  function getLoopbackTransport() {
    const existing = serverUpstreamTransports.get("loopback_cdp");
    if (existing) return existing as LoopbackCdpTransport;
    const transport = new LoopbackCdpTransport({
      globalScope,
      getLoopbackCdpUrl: () => ModCDPServer.loopback_cdp_url,
      setLoopbackCdpUrl: (url) => {
        ModCDPServer.loopback_cdp_url = url;
      },
      getCdpSendTimeoutMs: () => ModCDPServer.cdp_send_timeout_ms,
      getExecutionContextTimeoutMs: () => ModCDPServer.loopback_execution_context_timeout_ms,
      getWsConnectErrorSettleTimeoutMs: () => ModCDPServer.ws_connect_error_settle_timeout_ms,
    });
    serverUpstreamTransports.set("loopback_cdp", transport);
    return transport;
  }

  function getChromeDebuggerTransport() {
    const existing = serverUpstreamTransports.get("chrome_debugger");
    if (existing) return existing as ChromeDebuggerTransport;
    const transport = new ChromeDebuggerTransport({ globalScope });
    serverUpstreamTransports.set("chrome_debugger", transport);
    return transport;
  }

  function registerServerUpstreamTransport(name: SelectedServerUpstreamTransportName) {
    const transport = name === "loopback_cdp" ? getLoopbackTransport() : getChromeDebuggerTransport();
    if (activeServerUpstreamTransport === transport) return transport;
    activeServerUpstreamSubscription?.remove();
    activeServerUpstreamTransport = transport;
    serverAutoRouter = new AutoSessionRouter(transport, () => ModCDPServer.loopback_execution_context_timeout_ms);
    const autoRouterSubscription = serverAutoRouter.listen();
    const publishSubscriptions = Object.values(nativeEventSchemas).map((event) =>
      transport.on(event, (payload, _targetId, cdpSessionId) => {
        publishServerUpstreamEvent(event.id, ProtocolPayloadSchema.parse(payload), cdpSessionId);
      }),
    );
    activeServerUpstreamSubscription = {
      remove: () => {
        autoRouterSubscription?.remove();
        for (const subscription of publishSubscriptions) subscription.remove();
      },
    };
    return transport;
  }

  function publishServerUpstreamEvent(method: string, payload: ProtocolPayload, cdpSessionId: string | null) {
    void publishEvent(method, payload, cdpSessionId).catch((error) =>
      console.error("[ModCDPServer] upstream event listener failed", error),
    );
  }

  async function ensureOffscreenKeepAlive() {
    const chromeApi = globalScope.chrome;
    const offscreen = chromeApi?.offscreen;
    if (!offscreen || !chromeApi?.runtime?.getURL) return { started: false, reason: "offscreen_unavailable" };

    const offscreenUrl = chromeApi.runtime.getURL(offscreenKeepAlivePath);
    try {
      const existingContexts = chromeApi.runtime.getContexts
        ? await chromeApi.runtime.getContexts({
            contextTypes: ["OFFSCREEN_DOCUMENT"],
            documentUrls: [offscreenUrl],
          })
        : [];
      if (existingContexts.length > 0) return { started: true, existing: true };

      creatingOffscreenKeepAlive ??= offscreen
        .createDocument({
          url: offscreenKeepAlivePath,
          reasons: ["BLOBS"],
          justification: "Keep ModCDP service worker active while CDP clients route commands through it.",
        })
        .finally(() => {
          creatingOffscreenKeepAlive = null;
        });
      await creatingOffscreenKeepAlive;
      return { started: true };
    } catch (error) {
      return { started: false, reason: errorMessage(error) };
    }
  }

  const ModCDPServer = {
    __ModCDPServerVersion: MODCDP_SERVER_VERSION,
    routes: { ...defaultRoutes },
    loopback_cdp_url: null as string | null,
    browser_token: null as string | null,
    native_bridge_attempts: 0,
    native_bridge_last_error: null as string | null,
    native_bridge_connected: false,
    cdp_send_timeout_ms: DEFAULT_CDP_SEND_TIMEOUT_MS,
    loopback_execution_context_timeout_ms: DEFAULT_LOOPBACK_EXECUTION_CONTEXT_TIMEOUT_MS,
    ws_connect_error_settle_timeout_ms: DEFAULT_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS,
    downstream_client_timeout_ms: DEFAULT_DOWNSTREAM_CLIENT_TIMEOUT_MS,
    close_browser_on_downstream_disconnect: false,
    types: null as (typeof import("../types/generated/zod.js"))["types"] | null,
    commands: null as (typeof import("../types/generated/zod.js"))["commands"] | null,
    events: null as (typeof import("../types/generated/zod.js"))["events"] | null,
    startOffscreenKeepAlive,
    startReverseBridge(
      endpoint: string,
      {
        reconnect_interval_ms = DEFAULT_REVERSE_BRIDGE_RECONNECT_INTERVAL_MS,
      }: {
        reconnect_interval_ms?: number;
      } = {},
    ) {
      if (!/^wss?:\/\//i.test(endpoint)) {
        throw new Error(`reverse proxy endpoint must be a ws:// or wss:// URL, got ${endpoint}.`);
      }
      reverseBridgeUrl = endpoint;
      reverseBridgeReconnectIntervalMs = reconnect_interval_ms;
      void connectReverseBridge(endpoint).catch(() => {
        scheduleReverseBridgeReconnect(reverseBridgeReconnectIntervalMs);
      });
      return {
        upstream_reversews_url: endpoint,
        reconnect_interval_ms,
        connecting: true,
      };
    },
    stopReverseBridge,
    startNativeBridge(
      hostName = DEFAULT_NATIVE_BRIDGE_HOST_NAME,
      {
        reconnect_interval_ms = DEFAULT_NATIVE_BRIDGE_RECONNECT_INTERVAL_MS,
      }: {
        reconnect_interval_ms?: number;
      } = {},
    ) {
      nativeBridgeHostName = hostName;
      nativeBridgeReconnectIntervalMs = reconnect_interval_ms;
      return connectNativeBridge(hostName);
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
      if (!upstream_nats_subject_prefix || /[\s*>]/.test(upstream_nats_subject_prefix))
        throw new Error(`Invalid NATS subject prefix ${upstream_nats_subject_prefix}`);
      nats_bridge_url = endpoint;
      nats_bridge_subject_prefix = upstream_nats_subject_prefix;
      nats_bridge_reconnect_interval_ms = reconnect_interval_ms;
      void connectNatsBridge(endpoint).catch(() => {
        scheduleNatsBridgeReconnect(nats_bridge_reconnect_interval_ms);
      });
      return {
        upstream_nats_url: endpoint,
        upstream_nats_subject_prefix,
        reconnect_interval_ms,
        connecting: true,
      };
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
      if (server_routes) this.routes = { ...defaultRoutes, ...server_routes };
      else {
        this.routes = { ...defaultRoutes };
        await this.discoverLoopbackCDP();
      }
      registerServerUpstreamTransport(configuredServerUpstreamTransportName(this.routes));
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
      commandHandlers.set(name, {
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
      eventBindings.set(name, {
        name,
        event_schema: normalizeModCDPPayloadSchema(event_schema),
      });
      return { name, registered: true };
    },

    addEventListener(listener: (event: string, data: ProtocolPayload, cdpSessionId: string | null) => void) {
      eventListeners.add(listener);
      return { remove: () => eventListeners.delete(listener) };
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
          const cdp = ModCDPServer.attachToSession(cdpSessionId);
          const ModCDP = ModCDPServer;
          const chrome = globalScope.chrome;
          const serverNext = async (nextValue = payload) => ({ __ModCDP_middleware_next__: true, value: nextValue });
          const expressionHandler = Function(
            "payload",
            "next",
            "context",
            "cdp",
            "ModCDP",
            "chrome",
            `"use strict"; return (${expression});`,
          )(payload ?? {}, serverNext, context ?? {}, cdp, ModCDP, chrome);
          const result = (await expressionHandler(payload, serverNext, context)) as Record<string, unknown>;
          if (result?.__ModCDP_middleware_next__ === true && typeof next === "function") {
            const nextResult = await next(result.value);
            const { __ModCDP_middleware_next__, value: _value, ...overrides } = result;
            if (Object.keys(overrides).length === 0) return nextResult;
            return nextResult != null && typeof nextResult === "object" && !Array.isArray(nextResult)
              ? { ...(nextResult as Record<string, unknown>), ...overrides }
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
        let nextCalled = false;
        const next = async (nextValue = value) => {
          if (nextCalled)
            throw new Error(`Middleware ${middleware.name}:${middleware.phase} called next() more than once.`);
          nextCalled = true;
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
      const middlewareParams = await this.runMiddleware("request", method, params, { cdpSessionId, request });
      if (middlewareParams == null) throw new Error(`Request middleware for ${method} returned no params.`);
      params = middlewareParams as ProtocolParams;

      const command = registryMatch(commandHandlers, method);
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

      if (!serverUpstreamRouteNames.has(upstream))
        throw new Error(`No service-worker command registered for ${method}.`);
      if (!activeServerUpstreamTransport)
        registerServerUpstreamTransport(configuredServerUpstreamTransportName(this.routes));
      if (!activeServerUpstreamTransport)
        throw new Error(`No ModCDP server upstream transport registered for ${method}.`);
      if (!serverAutoRouter) throw new Error("ModCDP autorouter is not initialized.");
      result = await serverAutoRouter.send(method, params, cdpSessionId);

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
          if (!activeServerUpstreamTransport)
            registerServerUpstreamTransport(configuredServerUpstreamTransportName(ModCDPServer.routes));
          return activeServerUpstreamTransport;
        },
        send: (method: string, params: ProtocolParams = {}) => this.handleCommand(method, params, cdpSessionId),
        emit: (eventName: string, payload: ProtocolPayload = {}) => this.emit(eventName, payload, cdpSessionId),
      };
    },

    async emit(eventName: string, payload: ProtocolPayload = {}, cdpSessionId: string | null = null) {
      const event = registryMatch(eventBindings, eventName);
      if (!event)
        return {
          event: eventName,
          emitted: false,
          reason: "event_not_registered",
        };
      payload = eventPayloadSchema(eventName, event)?.parse(payload) ?? payload;
      const customBinding = globalScope[CUSTOM_EVENT_BINDING_NAME];
      if (
        typeof customBinding !== "function" &&
        reverseBridgeSocket?.readyState !== WebSocket.OPEN &&
        !nativeBridgePort &&
        nats_bridge_socket?.readyState !== WebSocket.OPEN
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
      return getLoopbackTransport().discoverLoopbackCDP({
        browserToken: this.browser_token,
        serviceWorkerUrl: currentServiceWorkerUrl(),
      });
    },

    get upstream() {
      if (!activeServerUpstreamTransport)
        registerServerUpstreamTransport(configuredServerUpstreamTransportName(this.routes));
      if (!serverAutoRouter) throw new Error("ModCDP autorouter is not initialized.");
      return serverAutoRouter;
    },
  };

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
      if (!serverAutoRouter) throw new Error("ModCDP autorouter is not initialized.");
      return await serverAutoRouter.getTopology(params as Record<string, unknown>);
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

  const chromeApi = globalScope.chrome;
  try {
    chromeApi?.runtime?.onStartup?.addListener(startOffscreenKeepAlive);
  } catch {}
  try {
    chromeApi?.runtime?.onInstalled?.addListener(startOffscreenKeepAlive);
  } catch {}
  try {
    chromeApi?.tabs?.onCreated?.addListener(startOffscreenKeepAlive);
  } catch {}
  try {
    chromeApi?.runtime?.onConnect?.addListener((port) => {
      if (port.name !== offscreenKeepAlivePortName) return;
      offscreenKeepAlivePort = port;
      port.onMessage.addListener(() => {});
      port.onDisconnect.addListener(() => {
        if (offscreenKeepAlivePort === port) offscreenKeepAlivePort = null;
      });
    });
  } catch {}
  startOffscreenKeepAlive();

  return ModCDPServer;
}

export const ModCDPServer = installModCDPServer(globalThis);
