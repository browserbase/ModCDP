import type { ModCDPClient } from "../client/ModCDPClient.js";
import {
  type CdpCommandMessage,
  type CdpEventMessage,
  type CdpResponseMessage,
  type ModCDPDownstreamOptions,
  type ProtocolPayload,
} from "../types/modcdp.js";
import {
  type DownstreamRequestHandler,
  type DownstreamTransportName,
  type DownstreamTransportStatus,
  DownstreamTransport,
} from "./DownstreamTransport.js";

const DEFAULT_DOWNSTREAM_CLIENT_TIMEOUT_MS = 1_000;

type DownstreamTransportSetOptions = ModCDPDownstreamOptions & {
  closeBrowser?: () => void | Promise<void>;
};

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
  downstream_client_timeout_ms: number;
  downstream_close_browser_on_disconnect: boolean;
  closeBrowser: () => void | Promise<void>;

  // Transport name -> concrete downstream transport. Written during service
  // worker setup; read for fan-out, status, and lifecycle transitions.
  private readonly transports = new Map<DownstreamTransportName, DownstreamTransport>();
  private downstream_client_lease: ReturnType<typeof setTimeout> | null = null;

  constructor(options: DownstreamTransportSetOptions = {}) {
    this.downstream_client_timeout_ms = options.downstream_client_timeout_ms ?? DEFAULT_DOWNSTREAM_CLIENT_TIMEOUT_MS;
    this.downstream_close_browser_on_disconnect = options.downstream_close_browser_on_disconnect ?? false;
    this.closeBrowser = options.closeBrowser ?? (() => {});
  }

  update(config: DownstreamTransportSetOptions = {}) {
    this.downstream_client_timeout_ms = config.downstream_client_timeout_ms ?? this.downstream_client_timeout_ms;
    this.downstream_close_browser_on_disconnect =
      config.downstream_close_browser_on_disconnect ?? this.downstream_close_browser_on_disconnect;
    this.closeBrowser = config.closeBrowser ?? this.closeBrowser;
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
    const timeout_ms = this.downstream_client_timeout_ms;
    if (!(timeout_ms > 0)) return;
    this.clearClientLease();
    this.downstream_client_lease = setTimeout(() => {
      const expired = this.clearClientLease();
      if (!expired) return;
      if (this.downstream_close_browser_on_disconnect !== true) return;
      void this.closeBrowser();
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
    return [...this.transports.values()].reduce((count, transport) => count + transport.sendEvent(message), 0);
  }

  /** Mirror browser-target upstream events into downstream transports. */
  mirrorEventsFrom(client: Pick<ModCDPClient, "upstream">) {
    const subscriptions = [...this.transports.values()].map((transport) => transport.mirrorEventsFrom(client));
    return { remove: () => subscriptions.every((subscription) => subscription.remove()) };
  }

  /** True when at least one downstream transport currently has a connected client. */
  hasConnectedClient() {
    return [...this.transports.values()].some((transport) => transport.status().connected);
  }
}

export { DEFAULT_DOWNSTREAM_CLIENT_TIMEOUT_MS, DownstreamTransportSet };
export type { DownstreamTransportSetOptions };
