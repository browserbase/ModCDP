// MODCDP_TS_ONLY: DO NOT TRANSLATE THIS FILE TO OTHER LANGUAGES.
// Reason: only runs in browser.
import type { ModCDPClient } from "../client/ModCDPClient.js";
import type { z } from "zod";
import { events as nativeEventSchemas } from "../types/generated/zod.js";
import {
  type CdpCommandMessage,
  type CdpEventMessage,
  type CdpResponseMessage,
  type ModCDPDownstreamConfig,
  ModCDPDownstreamConfigSchema,
  type ProtocolPayload,
} from "../types/modcdp.js";
import { modCDPToJSON } from "../types/toJSON.js";
import { CUSTOM_EVENT_BINDING_NAME, UPSTREAM_EVENT_BINDING_NAME } from "../translate/translate.js";
import {
  type DownstreamRequestHandler,
  type DownstreamTransportName,
  type DownstreamTransportStatus,
  DownstreamTransport,
} from "./DownstreamTransport.js";

/**
 * Owns the SDK/client-facing transports installed in the extension service worker.
 *
 * From ModCDPServer's point of view, downstream means client connections into
 * the service worker. This set owns fan-out, request-handler
 * registration, status aggregation, and lifecycle calls across the configured
 * downstream transports. It does not route commands to browser targets, choose
 * target sessions, evaluate custom commands, or know how any individual
 * transport talks to its peers.
 */
class DownstreamTransportSet {
  config: ModCDPDownstreamConfig;

  // Transport name -> concrete downstream transport. Written during service
  // worker setup; read for fan-out, status, and lifecycle transitions.
  private readonly transports = new Map<DownstreamTransportName, DownstreamTransport>();
  private downstream_client_lease: ReturnType<typeof setTimeout> | null = null;

  constructor(config: z.input<typeof ModCDPDownstreamConfigSchema> = {}) {
    this.config = ModCDPDownstreamConfigSchema.parse({ closeBrowser: () => {}, ...config });
  }

  update(config: z.input<typeof ModCDPDownstreamConfigSchema> = {}) {
    this.config = ModCDPDownstreamConfigSchema.parse({ ...this.config, ...config });
    return this;
  }

  clearClientLease() {
    const lease = this.downstream_client_lease;
    if (!lease) return false;
    clearTimeout(lease);
    this.downstream_client_lease = null;
    return true;
  }

  hasClientLease() {
    return this.downstream_client_lease != null;
  }

  touchClientLease() {
    const timeout_ms = this.config.downstream_client_timeout_ms;
    if (!(timeout_ms > 0)) return;
    this.clearClientLease();
    this.downstream_client_lease = setTimeout(() => {
      const expired = this.clearClientLease();
      if (!expired) return;
      if (this.config.downstream_close_browser_on_disconnect !== true) return;
      void this.config.closeBrowser();
    }, timeout_ms);
  }

  /** Add one downstream transport implementation to the set. */
  add(transport: DownstreamTransport) {
    this.transports.set(transport.name, transport);
  }

  /** Register one request handler on every downstream transport. */
  onRequest(handler: DownstreamRequestHandler) {
    const subscriptions = [...this.transports.values()].map((transport) =>
      transport.onRequest((message) => {
        this.touchClientLease();
        return handler(message);
      }),
    );
    return { remove: () => subscriptions.every((subscription) => subscription.remove()) };
  }

  /** Start every downstream transport's built-in client polling/listening path. */
  startPollingForClients() {
    const results: Partial<Record<DownstreamTransportName, ProtocolPayload>> = {};
    for (const [name, transport] of this.transports) {
      const result = transport.startPollingForClients();
      if (result != null) results[name] = result;
    }
    return results;
  }

  /** Stop every downstream transport. */
  stop(reason = "stopped") {
    const results: Partial<Record<DownstreamTransportName, ProtocolPayload>> = {};
    for (const [name, transport] of this.transports) {
      const result = transport.stop(reason);
      if (result != null) results[name] = result;
    }
    return results;
  }

  /** Return status for every downstream transport keyed by transport name. */
  status() {
    const status: Partial<Record<DownstreamTransportName, DownstreamTransportStatus>> = {};
    for (const [name, transport] of this.transports) status[name] = transport.status();
    return status;
  }

  /** Send one response to the downstream transport that owns the request. */
  sendResponse(request: CdpCommandMessage, response: CdpResponseMessage) {
    return [...this.transports.values()].some((transport) => transport.sendResponse(request, response));
  }

  /** Broadcast one CDP event to connected downstream clients. */
  sendEvent(message: CdpEventMessage) {
    const binding_name = nativeEventSchemas[message.method] ? UPSTREAM_EVENT_BINDING_NAME : CUSTOM_EVENT_BINDING_NAME;
    const binding = Reflect.get(globalThis, binding_name);
    let sent_count = 0;
    if (typeof binding === "function") {
      binding(
        JSON.stringify({
          event: message.method,
          data: message.params ?? {},
          cdpSessionId: message.sessionId ?? null,
        }),
      );
      sent_count += 1;
    }
    return [...this.transports.values()].reduce((count, transport) => count + transport.sendEvent(message), sent_count);
  }

  /** Mirror all CDP-shaped ModCDPClient events into downstream transports. */
  mirrorEventsFrom(
    client: ModCDPClient,
    {
      transformEvent,
    }: {
      transformEvent?: (message: CdpEventMessage) => CdpEventMessage | null | Promise<CdpEventMessage | null>;
    } = {},
  ) {
    const listener = (event_name: unknown, payload: unknown, cdpSessionId: unknown) => {
      if (typeof event_name !== "string" || !event_name.includes(".")) return;
      const message: CdpEventMessage = {
        method: event_name,
        params: (payload ?? {}) as CdpEventMessage["params"],
      };
      if (typeof cdpSessionId === "string") message.sessionId = cdpSessionId;
      void (async () => {
        const transformed_message = transformEvent ? await transformEvent(message) : message;
        if (transformed_message != null) this.sendEvent(transformed_message);
      })();
    };
    client.on("*", listener);
    return { remove: () => client.off("*", listener) };
  }

  /** True when at least one downstream transport currently has a connected client. */
  hasConnectedClient() {
    return [...this.transports.values()].some((transport) => transport.status().connected);
  }

  toJSON() {
    return modCDPToJSON(this, {
      config: { ...this.config, closeBrowser: undefined },
      state: {
        downstream_client_lease: this.downstream_client_lease != null,
        transports: this.transports.size,
        connected: this.hasConnectedClient(),
      },
      children: Object.fromEntries(this.transports),
    });
  }
}

export { DownstreamTransportSet };
