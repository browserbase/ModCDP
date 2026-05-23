import type { CdpEventMessage, ModCDPConfigureParams, ProtocolPayload } from "../types/modcdp.js";

export type ServerDownstreamTransportName = string;

export type ServerDownstreamTransportStatus = {
  connected: boolean;
  last_error?: string | null;
  attempts?: number;
  config?: ProtocolPayload;
};

/**
 * Generic server-side downstream transport contract.
 *
 * From ModCDPServer's point of view, downstream means the SDK/client-facing
 * connection and upstream means the browser-target-facing connection. A
 * downstream transport accepts CDP-shaped commands from a client, delegates
 * execution to ModCDPServer, and sends CDP-shaped events/responses back to that
 * same client path.
 *
 * Concrete implementations own all protocol-specific lifecycle and state for
 * reverse WebSocket, native messaging, NATS, or any future downstream.
 * ModCDPServer only calls these generic lifecycle methods, emits events, and
 * reads generic status; it does not branch on downstream protocol names after
 * construction.
 */
export type ServerDownstreamTransport = {
  // Stable implementation name used only as the status-map key.
  readonly name: ServerDownstreamTransportName;

  /** Start the transport's built-in extension-side default, when it has one. */
  startDefault(): ProtocolPayload | null;

  /** Apply a Mod.configure payload and perform any matching lifecycle update. */
  configure(params: ModCDPConfigureParams): ProtocolPayload | null;

  /** Stop accepting or reconnecting downstream clients for this transport. */
  stop(reason?: string): ProtocolPayload | null;

  /** Emit one CDP event to this downstream, returning whether it was sent. */
  emit(message: CdpEventMessage): boolean;

  /** Return protocol-agnostic status for UI/debug surfaces. */
  status(): ServerDownstreamTransportStatus;
};
