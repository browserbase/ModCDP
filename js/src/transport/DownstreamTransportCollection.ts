import {
  type CdpCommandMessage,
  type CdpEventMessage,
  type CdpResponseMessage,
  type ProtocolPayload,
} from "../types/modcdp.js";
import {
  type DownstreamRequestHandler,
  type DownstreamTransportName,
  type DownstreamTransportStatus,
  DownstreamTransport,
} from "./DownstreamTransport.js";

export const DEFAULT_DOWNSTREAM_CLIENT_TIMEOUT_MS = 1_000;

export type DownstreamTransportCollectionOptions = {
  downstream_client_timeout_ms?: number;
  close_browser_on_downstream_disconnect?: boolean;
};

/**
 * Owns the SDK/client-facing transports installed in the extension service worker.
 *
 * From ModCDPServer's point of view, downstream means client connections into
 * the service worker. This collection owns fan-out, request-handler
 * registration, status aggregation, and lifecycle calls across the configured
 * downstream transports. It does not route commands to browser targets, choose
 * target sessions, evaluate custom commands, or know how any individual
 * transport talks to its peers.
 */
export class DownstreamTransportCollection {
  downstream_client_timeout_ms: number;
  close_browser_on_downstream_disconnect: boolean;

  // Transport name -> concrete downstream transport. Written during service
  // worker setup; read for fan-out, status, and lifecycle transitions.
  private readonly transports = new Map<DownstreamTransportName, DownstreamTransport>();

  constructor(options: DownstreamTransportCollectionOptions = {}) {
    this.downstream_client_timeout_ms =
      options.downstream_client_timeout_ms ??
      DEFAULT_DOWNSTREAM_CLIENT_TIMEOUT_MS;
    this.close_browser_on_downstream_disconnect =
      options.close_browser_on_downstream_disconnect ?? false;
  }

  update(config: DownstreamTransportCollectionOptions = {}) {
    this.downstream_client_timeout_ms =
      config.downstream_client_timeout_ms ?? this.downstream_client_timeout_ms;
    this.close_browser_on_downstream_disconnect =
      config.close_browser_on_downstream_disconnect ??
      this.close_browser_on_downstream_disconnect;
    return this;
  }

  /** Add one downstream transport implementation to the collection. */
  add(transport: DownstreamTransport) {
    this.transports.set(transport.name, transport);
  }

  /** Register one request handler on every downstream transport. */
  onRequest(handler: DownstreamRequestHandler) {
    const subscriptions = [...this.transports.values()].map((transport) => transport.onRequest(handler));
    return { remove: () => subscriptions.every((subscription) => subscription.remove()) };
  }

  /** Start every downstream transport default that exists in this service worker. */
  startDefault() {
    const results: Record<DownstreamTransportName, ProtocolPayload> = {};
    for (const [name, transport] of this.transports) {
      const result = transport.startDefault();
      if (result != null) results[name] = result;
    }
    return results;
  }

  /** Stop every downstream transport. */
  stop(reason = "stopped") {
    const results: Record<DownstreamTransportName, ProtocolPayload> = {};
    for (const [name, transport] of this.transports) {
      const result = transport.stop(reason);
      if (result != null) results[name] = result;
    }
    return results;
  }

  /** Return status for every downstream transport keyed by transport name. */
  status() {
    const status: Record<DownstreamTransportName, DownstreamTransportStatus> = {};
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

  /** True when at least one downstream transport currently has a connected client. */
  hasConnectedClient() {
    return [...this.transports.values()].some((transport) => transport.status().connected);
  }
}
