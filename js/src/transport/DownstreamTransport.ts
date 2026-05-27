// MODCDP_TS_ONLY: DO NOT TRANSLATE THIS FILE TO OTHER LANGUAGES.
// Reason: only runs in browser.
import {
  CdpResponseMessageSchema,
  type CdpCommandMessage,
  type CdpEventMessage,
  type CdpResponseMessage,
  type ProtocolPayload,
} from "../types/modcdp.js";
import { modCDPToJSON } from "../types/toJSON.js";

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

  toJSON() {
    const { config = {}, ...state } = this.status();
    return modCDPToJSON(this, {
      config,
      state: {
        ...state,
        request_handlers: this.request_handlers.size,
      },
    });
  }
}

export { DownstreamTransport };
export type { DownstreamTransportName, DownstreamTransportStatus, DownstreamRequestHandler };
