import {
  CdpResponseMessageSchema,
  type CdpCommandMessage,
  type CdpEventMessage,
  type CdpResponseMessage,
  type ProtocolPayload,
} from "../types/modcdp.js";
import type { ModCDPClient } from "../client/ModCDPClient.js";
import { events as nativeEventSchemas } from "../types/generated/zod.js";
import type { UpstreamTransport } from "./UpstreamTransport.js";

type DownstreamTransportName = "reversews" | "nativemessaging" | "nats";

type DownstreamTransportStatus = {
  connected: boolean;
  last_error?: string | null;
  attempts?: number;
  config?: ProtocolPayload;
};

type DownstreamRequestHandler = (
  message: CdpCommandMessage,
) => CdpResponseMessage | null | Promise<CdpResponseMessage | null>;

/**
 * Base contract for SDK/client-facing server transports.
 *
 * From ModCDPServer's point of view, downstream means the connection from an SDK
 * client into the extension service worker. Concrete transports own their
 * native connection lifecycle and request origin routing. ModCDPServer registers
 * request handlers, sends explicit responses for advanced asynchronous flows,
 * and broadcasts CDP event messages through this generic surface.
 *
 * Returning `{ id, result: {} }` from an onRequest handler sends a normal empty
 * CDP success response. Returning `null` sends no response; the caller is then
 * responsible for calling `sendResponse` later with the original request.
 */
abstract class DownstreamTransport {
  /** Stable implementation name used as the server status-map key. */
  abstract readonly name: DownstreamTransportName;

  // Request handlers installed by ModCDPServer. Updated by onRequest and read
  // by transport message handlers when a downstream client sends a command.
  private readonly request_handlers = new Set<DownstreamRequestHandler>();

  // Per-transport event mirror cleanup and its browser-target upstream. Each
  // downstream transport owns its own upstream subscription because clients,
  // fan-out, and delivery semantics are downstream-specific.
  private upstream_event_mirror: { upstream: UpstreamTransport; remove: () => void } | null = null;

  /** Start this transport's built-in client polling/listening path. */
  abstract startPollingForClients(): ProtocolPayload | null;

  /** Stop accepting or reconnecting downstream clients for this transport. */
  abstract stop(reason?: string): ProtocolPayload | null;

  /** Send one CDP response to the downstream client that originated request. */
  abstract sendResponse(request: CdpCommandMessage, response: CdpResponseMessage): boolean;

  /** Send one CDP event to connected downstream clients and return send count. */
  abstract sendEvent(message: CdpEventMessage): number;

  /** Return protocol-agnostic status for UI/debug surfaces. */
  abstract status(): DownstreamTransportStatus;

  /** Register a request handler for CDP command messages from downstream clients. */
  onRequest(handler: DownstreamRequestHandler): { remove: () => boolean } {
    this.request_handlers.add(handler);
    return { remove: () => this.request_handlers.delete(handler) };
  }

  /** Mirror browser-target upstream events into this downstream transport. */
  mirrorEventsFrom(client: Pick<ModCDPClient, "upstream">) {
    if (this.upstream_event_mirror?.upstream === client.upstream) return this.upstream_event_mirror;
    this.upstream_event_mirror?.remove();
    const upstream_event_subscriptions = Object.values(nativeEventSchemas).map((event) =>
      client.upstream.on(event, (payload, _targetId, cdpSessionId) => {
        const message: CdpEventMessage = {
          method: event.id,
          params: (payload ?? {}) as CdpEventMessage["params"],
        };
        if (cdpSessionId) message.sessionId = cdpSessionId;
        this.sendEvent(message);
      }),
    );
    this.upstream_event_mirror = {
      upstream: client.upstream,
      remove: () => {
        for (const subscription of upstream_event_subscriptions) subscription.remove();
        if (this.upstream_event_mirror?.upstream === client.upstream) this.upstream_event_mirror = null;
      },
    };
    return this.upstream_event_mirror;
  }

  /**
   * Run registered handlers for one downstream request.
   *
   * Concrete transports call this after parsing a native CDP command message.
   * The first non-null native CDP response is sent back to the request origin.
   */
  protected async handleRequest(message: CdpCommandMessage): Promise<void> {
    for (const handler of this.request_handlers) {
      const response = await handler(message);
      if (response === null) continue;
      this.sendResponse(message, CdpResponseMessageSchema.parse(response));
      return;
    }
  }
}

export { DownstreamTransport };
export type { DownstreamTransportName, DownstreamTransportStatus, DownstreamRequestHandler };
