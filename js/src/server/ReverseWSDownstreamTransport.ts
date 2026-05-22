import { CdpCommandMessageSchema, type CdpCommandMessage, type CdpEventMessage } from "../types/modcdp.js";

export const DEFAULT_REVERSE_BRIDGE_RECONNECT_INTERVAL_MS = 2_000;

/**
 * Owns the reverse WebSocket downstream connection from the extension service
 * worker back to a waiting ModCDP client/proxy.
 *
 * This class owns only reversews-specific lifecycle: socket creation,
 * reconnect scheduling, hello messages, command-message decoding, CDP response
 * writing, event-message forwarding, and stop semantics. It does not own
 * ModCDP command registration, routing, middleware, upstream target/session
 * state, native messaging, or NATS protocol handling.
 *
 * Lifecycle:
 * 1. `start()` records the desired endpoint/reconnect interval and opens one
 *    WebSocket if none is already open or connecting.
 * 2. `open` sends the reverse hello and asks the server to keep the extension
 *    service worker alive.
 * 3. `message` parses client CDP commands and delegates execution through the
 *    injected `handleCommand` callback.
 * 4. `error`/`close` drops the active socket reference and schedules reconnect
 *    while an endpoint is still configured.
 * 5. `stop()` clears the endpoint and reconnect timer, then closes the socket.
 */
export class ReverseWSDownstreamTransport {
  // Server-owned command executor. Read by message handling; this class never
  // interprets routes, custom commands, or middleware itself.
  private readonly handleCommand: (message: CdpCommandMessage) => Promise<unknown>;

  // Server-owned keepalive hook. Called after the reverse socket opens.
  private readonly startOffscreenKeepAlive: () => void;

  // Configured reversews endpoint. Set by start, cleared by stop, read by
  // reconnect scheduling.
  private endpoint: string | null = null;

  // Reconnect interval currently configured for the endpoint. Set by start and
  // read by error/close handlers.
  private reconnect_interval_ms = DEFAULT_REVERSE_BRIDGE_RECONNECT_INTERVAL_MS;

  // Active reversews socket. Set by connect, cleared by error/close/stop, read
  // by start and emit.
  private socket: WebSocket | null = null;

  // Pending reconnect timer. Set by scheduleReconnect, cleared by stop or when
  // the timer fires.
  private reconnect_timer: ReturnType<typeof setTimeout> | null = null;

  constructor({
    handleCommand,
    startOffscreenKeepAlive,
  }: {
    handleCommand: (message: CdpCommandMessage) => Promise<unknown>;
    startOffscreenKeepAlive: () => void;
  }) {
    this.handleCommand = handleCommand;
    this.startOffscreenKeepAlive = startOffscreenKeepAlive;
  }

  /** True when the reversews socket is currently open and can receive events. */
  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** Configure and start the reversews downstream connection. */
  start(
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
    this.endpoint = endpoint;
    this.reconnect_interval_ms = reconnect_interval_ms;
    void this.connect(endpoint).catch(() => {
      this.scheduleReconnect(this.reconnect_interval_ms);
    });
    return {
      upstream_reversews_url: endpoint,
      reconnect_interval_ms,
      connecting: true,
    };
  }

  /** Stop reconnecting and close the active reversews socket. */
  stop(reason = "stopped") {
    const upstream_reversews_url = this.endpoint;
    this.endpoint = null;
    if (this.reconnect_timer) {
      clearTimeout(this.reconnect_timer);
      this.reconnect_timer = null;
    }
    const socket = this.socket;
    this.socket = null;
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
      socket.close(1000, reason);
    }
    return { upstream_reversews_url, stopped: true, reason };
  }

  /** Emit one CDP event message to the connected reversews client. */
  emit(message: CdpEventMessage) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private scheduleReconnect(delay_ms: number) {
    if (!this.endpoint) return;
    if (this.reconnect_timer) return;
    this.reconnect_timer = setTimeout(() => {
      this.reconnect_timer = null;
      if (!this.endpoint) return;
      void this.connect(this.endpoint).catch(() => {});
    }, delay_ms);
  }

  private async connect(endpoint: string) {
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return {
        upstream_reversews_url: endpoint,
        connected: this.socket.readyState === WebSocket.OPEN,
      };
    }

    const ws = new WebSocket(endpoint);
    this.socket = ws;
    ws.addEventListener("open", () => {
      this.startOffscreenKeepAlive();
      ws.send(
        JSON.stringify({
          type: "modcdp.reverse.hello",
          role: "extension-service-worker",
          version: 1,
          extension_id: globalThis.chrome?.runtime?.id ?? null,
        }),
      );
    });
    ws.addEventListener("message", (event) => {
      void this.handleMessage(ws, event.data);
    });
    ws.addEventListener("error", () => {
      if (this.socket === ws) this.socket = null;
      this.scheduleReconnect(this.reconnect_interval_ms);
    });
    ws.addEventListener("close", () => {
      if (this.socket === ws) this.socket = null;
      this.scheduleReconnect(this.reconnect_interval_ms);
    });
    return { upstream_reversews_url: endpoint, connected: false };
  }

  private async handleMessage(ws: WebSocket, data: unknown) {
    let message: CdpCommandMessage;
    try {
      message = CdpCommandMessageSchema.parse(JSON.parse(typeof data === "string" ? data : String(data)));
    } catch {
      return;
    }

    try {
      const result = await this.handleCommand(message);
      ws.send(JSON.stringify({ id: message.id, result }));
    } catch (error) {
      ws.send(
        JSON.stringify({
          id: message.id,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : String(error),
          },
        }),
      );
    }
  }
}
