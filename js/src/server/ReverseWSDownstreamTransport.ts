import {
  CdpCommandMessageSchema,
  type CdpCommandMessage,
  type CdpEventMessage,
  type CdpResponseMessage,
  type ModCDPConfigureParams,
} from "../types/modcdp.js";
import { DownstreamTransport } from "../transport/DownstreamTransport.js";

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
export class ReverseWSDownstreamTransport extends DownstreamTransport {
  readonly name = "reversews";

  // Server-owned keepalive hook. Called after the reverse socket opens.
  private readonly ensureOffscreenKeepAlive: () => unknown;

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

  // Request object -> WebSocket that sent it. Written by handleMessage and read
  // by sendResponse so responses go only to the originating downstream client.
  private readonly socket_from_request = new WeakMap<CdpCommandMessage, WebSocket>();

  constructor({ ensureOffscreenKeepAlive }: { ensureOffscreenKeepAlive: () => unknown }) {
    super();
    this.ensureOffscreenKeepAlive = ensureOffscreenKeepAlive;
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

  /** Start the default reversews listener configured into the shipped extension. */
  startDefault() {
    return this.start("ws://127.0.0.1:29292", { reconnect_interval_ms: DEFAULT_REVERSE_BRIDGE_RECONNECT_INTERVAL_MS });
  }

  /** Keep reversews alive only for reversews clients; other clients use their own downstream. */
  configure(params: ModCDPConfigureParams) {
    if (params.upstream?.upstream_mode === "reversews") return null;
    return this.stop("non-reverse downstream connected");
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

  /** Send one CDP response to the reversews client that sent the request. */
  sendResponse(request: CdpCommandMessage, response: CdpResponseMessage) {
    const socket = this.socket_from_request.get(request);
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(response));
    this.socket_from_request.delete(request);
    return true;
  }

  /** Send one CDP event message to the connected reversews client. */
  sendEvent(message: CdpEventMessage) {
    if (this.socket?.readyState !== WebSocket.OPEN) return 0;
    this.socket.send(JSON.stringify(message));
    return 1;
  }

  /** Return generic status without exposing reversews-specific state to ModCDPServer. */
  status() {
    return {
      connected: this.connected,
      config: this.endpoint
        ? { upstream_reversews_url: this.endpoint, reconnect_interval_ms: this.reconnect_interval_ms }
        : {},
    };
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
      void this.ensureOffscreenKeepAlive();
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
    const message = CdpCommandMessageSchema.parse(JSON.parse(typeof data === "string" ? data : String(data)));
    this.socket_from_request.set(message, ws);
    await this.handleRequest(message);
  }
}
