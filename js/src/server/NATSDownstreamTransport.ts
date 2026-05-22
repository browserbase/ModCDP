import { CdpCommandMessageSchema, type CdpCommandMessage, type CdpEventMessage } from "../types/modcdp.js";

export const DEFAULT_NATS_BRIDGE_RECONNECT_INTERVAL_MS = 2_000;
export const DEFAULT_NATS_BRIDGE_SUBJECT_PREFIX = "modcdp.default";

/**
 * Owns the NATS-over-WebSocket downstream connection from the extension service
 * worker to a ModCDP client/proxy.
 *
 * This class owns only NATS-specific lifecycle: WebSocket connection, reconnect
 * scheduling, NATS CONNECT/SUB/PUB framing, protocol buffering, hello messages,
 * command-message decoding, CDP response publishing, and event-message
 * publishing. It does not own ModCDP command registration, routing, middleware,
 * upstream target/session state, native messaging, or reversews handling.
 *
 * Lifecycle:
 * 1. `start()` records the endpoint/subject/reconnect interval and opens one
 *    WebSocket if none is already open or connecting.
 * 2. `open` sends NATS CONNECT/PING/SUB frames and publishes a browser hello.
 * 3. `message` appends decoded bytes to the protocol buffer and consumes
 *    complete NATS frames.
 * 4. `MSG` payloads are decoded as ModCDP command envelopes and delegated
 *    through the injected `handleCommand` callback.
 * 5. `error`/`close` drops the socket and schedules reconnect while an endpoint
 *    is still configured.
 */
export class NATSDownstreamTransport {
  // Extension service-worker global scope. Read for runtime id in hello payloads.
  private readonly globalScope: typeof globalThis & { chrome?: typeof chrome };

  // Server-owned command executor. Read by NATS payload handling; this class
  // never interprets routes, custom commands, or middleware itself.
  private readonly handleCommand: (message: CdpCommandMessage) => Promise<unknown>;

  // Server-owned keepalive hook. Called after the NATS WebSocket opens.
  private readonly startOffscreenKeepAlive: () => void;

  // Configured NATS WebSocket URL. Set by start and read by reconnect handling.
  private endpoint: string | null = null;

  // Configured NATS subject prefix. Set by start and read by SUB/PUB handling.
  private subject_prefix = DEFAULT_NATS_BRIDGE_SUBJECT_PREFIX;

  // Reconnect interval currently configured for the endpoint. Set by start and
  // read by error/close handlers.
  private reconnect_interval_ms = DEFAULT_NATS_BRIDGE_RECONNECT_INTERVAL_MS;

  // Active NATS WebSocket. Set by connect, cleared by error/close, read by
  // start/write/emit.
  private socket: WebSocket | null = null;

  // Pending reconnect timer. Set by scheduleReconnect and cleared when it fires.
  private reconnect_timer: ReturnType<typeof setTimeout> | null = null;

  // Unconsumed NATS protocol bytes decoded as text. Appended by readWebSocketData
  // and replaced by consumeProtocol.
  private buffer = "";

  constructor({
    globalScope,
    handleCommand,
    startOffscreenKeepAlive,
  }: {
    globalScope: typeof globalThis & { chrome?: typeof chrome };
    handleCommand: (message: CdpCommandMessage) => Promise<unknown>;
    startOffscreenKeepAlive: () => void;
  }) {
    this.globalScope = globalScope;
    this.handleCommand = handleCommand;
    this.startOffscreenKeepAlive = startOffscreenKeepAlive;
  }

  /** True when the NATS WebSocket is open and can publish CDP event messages. */
  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** Configure and start the NATS downstream connection. */
  start(
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
    this.endpoint = endpoint;
    this.subject_prefix = upstream_nats_subject_prefix;
    this.reconnect_interval_ms = reconnect_interval_ms;
    void this.connect(endpoint).catch(() => {
      this.scheduleReconnect(this.reconnect_interval_ms);
    });
    return {
      upstream_nats_url: endpoint,
      upstream_nats_subject_prefix,
      reconnect_interval_ms,
      connecting: true,
    };
  }

  /** Publish one CDP event message to the NATS browser-to-client subject. */
  emit(message: CdpEventMessage) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.publish(`${this.subject_prefix}.browser_to_client`, {
      type: "modcdp.nats.message",
      message,
    });
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
    if (!/^wss?:\/\//i.test(endpoint)) {
      throw new Error(`nats bridge endpoint must be a ws:// or wss:// URL for extension transport, got ${endpoint}.`);
    }
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return {
        upstream_nats_url: endpoint,
        upstream_nats_subject_prefix: this.subject_prefix,
        connected: this.socket.readyState === WebSocket.OPEN,
      };
    }
    const ws = new WebSocket(endpoint);
    this.socket = ws;
    this.buffer = "";
    ws.addEventListener("open", () => {
      this.startOffscreenKeepAlive();
      this.write(`CONNECT ${JSON.stringify(this.connectOptions())}\r\nPING\r\n`);
      this.write(`SUB ${this.subject_prefix}.client_to_browser 1\r\n`);
      this.publish(`${this.subject_prefix}.browser_to_client`, {
        type: "modcdp.nats.hello",
        role: "extension-service-worker",
        version: 1,
        extension_id: this.globalScope.chrome?.runtime?.id ?? null,
      });
    });
    ws.addEventListener("message", (event) => {
      void this.readWebSocketData(event.data);
    });
    ws.addEventListener("error", () => {
      if (this.socket === ws) this.socket = null;
      this.scheduleReconnect(this.reconnect_interval_ms);
    });
    ws.addEventListener("close", () => {
      if (this.socket === ws) this.socket = null;
      this.scheduleReconnect(this.reconnect_interval_ms);
    });
    return {
      upstream_nats_url: endpoint,
      upstream_nats_subject_prefix: this.subject_prefix,
      connected: false,
    };
  }

  private write(data: string) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(data);
  }

  private publish(subject: string, message: unknown) {
    const body = JSON.stringify(message);
    this.write(`PUB ${subject} ${new TextEncoder().encode(body).byteLength}\r\n${body}\r\n`);
  }

  private async readWebSocketData(data: unknown) {
    if (typeof data === "string") this.buffer += data;
    else if (data instanceof ArrayBuffer) this.buffer += new TextDecoder().decode(data);
    else if (ArrayBuffer.isView(data)) this.buffer += new TextDecoder().decode(data);
    else if (typeof Blob !== "undefined" && data instanceof Blob) this.buffer += await data.text();
    else return;
    this.buffer = this.consumeProtocol(this.buffer);
  }

  private consumeProtocol(buffer: string) {
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
        void this.handlePayload(payload);
        continue;
      }
      buffer = buffer.slice(lineEnd + 2);
      if (upper === "PING") this.write("PONG\r\n");
    }
  }

  private async handlePayload(payload: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    const record = parsed && typeof parsed === "object" ? (parsed as { type?: unknown; message?: unknown }) : null;
    if (record?.type === "modcdp.nats.hello") {
      this.publish(`${this.subject_prefix}.browser_to_client`, {
        type: "modcdp.nats.hello",
        role: "extension-service-worker",
        version: 1,
        extension_id: this.globalScope.chrome?.runtime?.id ?? null,
      });
      return;
    }
    let message: CdpCommandMessage;
    try {
      message = CdpCommandMessageSchema.parse(record?.type === "modcdp.nats.message" ? record.message : parsed);
    } catch {
      return;
    }
    try {
      const result = await this.handleCommand(message);
      this.publish(`${this.subject_prefix}.browser_to_client`, {
        type: "modcdp.nats.message",
        message: { id: message.id, result },
      });
    } catch (error) {
      this.publish(`${this.subject_prefix}.browser_to_client`, {
        type: "modcdp.nats.message",
        message: {
          id: message.id,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : String(error),
          },
        },
      });
    }
  }

  private connectOptions() {
    return {
      verbose: false,
      pedantic: false,
      lang: "modcdp-extension",
      version: "1",
      protocol: 1,
    };
  }
}
