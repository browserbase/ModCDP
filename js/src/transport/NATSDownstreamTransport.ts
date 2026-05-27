// MODCDP_TS_ONLY: DO NOT TRANSLATE THIS FILE TO OTHER LANGUAGES.
// Reason: not needed by Stagehand (exotic transport).
import {
  CdpCommandMessageSchema,
  type CdpCommandMessage,
  type CdpEventMessage,
  type CdpResponseMessage,
} from "../types/modcdp.js";
import { DownstreamTransport } from "./DownstreamTransport.js";
import { z } from "zod";

const DEFAULT_NATS_BRIDGE_RECONNECT_INTERVAL_MS = 2_000;
const DEFAULT_NATS_BRIDGE_URL = "ws://127.0.0.1:4223";
const DEFAULT_NATS_BRIDGE_SUBJECT_PREFIX = "modcdp.default";

const NATSDownstreamTransportConfigSchema = z
  .object({
    upstream_nats_url: z.string().default(DEFAULT_NATS_BRIDGE_URL),
    upstream_nats_subject_prefix: z
      .string()
      .refine((value) => value.trim().length > 0 && !/[\s*>]/.test(value), "Invalid NATS subject prefix")
      .default(DEFAULT_NATS_BRIDGE_SUBJECT_PREFIX),
    reconnect_interval_ms: z.number().positive().default(DEFAULT_NATS_BRIDGE_RECONNECT_INTERVAL_MS),
  })
  .strict();

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
class NATSDownstreamTransport extends DownstreamTransport {
  readonly name = "nats" as const;
  config: z.infer<typeof NATSDownstreamTransportConfigSchema> = NATSDownstreamTransportConfigSchema.parse({});

  // True after start configures the NATS endpoint. Cleared by stop and read by
  // reconnect scheduling/status.
  private started = false;

  // Active NATS WebSocket. Set by connect, cleared by error/close, read by
  // start/write/emit.
  private socket: WebSocket | null = null;

  // Pending reconnect timer. Set by scheduleReconnect and cleared when it fires.
  private reconnect_timer: ReturnType<typeof setTimeout> | null = null;

  // Unconsumed NATS protocol bytes decoded as text. Appended by readWebSocketData
  // and replaced by consumeProtocol.
  private buffer = "";

  // Request object -> transport-native NATS reply subject. Written by
  // handlePayload and read by sendResponse so responses route to the requesting
  // SDK client instead of being broadcast on the event subject.
  private readonly reply_subject_from_request = new WeakMap<CdpCommandMessage, string>();

  /** True when the NATS WebSocket is open and can publish CDP event messages. */
  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** Configure and start the NATS downstream connection. */
  start(endpoint?: string, config: z.input<typeof NATSDownstreamTransportConfigSchema> = {}) {
    this.config = NATSDownstreamTransportConfigSchema.parse({
      ...config,
      upstream_nats_url: endpoint,
    });
    this.started = true;
    void this.connect(this.config.upstream_nats_url).catch(() => {
      this.scheduleReconnect();
    });
    return {
      upstream_nats_url: this.config.upstream_nats_url,
      upstream_nats_subject_prefix: this.config.upstream_nats_subject_prefix,
      reconnect_interval_ms: this.config.reconnect_interval_ms,
      connecting: true,
    };
  }

  /** Start polling for NATS clients using the shipped extension default. */
  startPollingForClients() {
    return this.start();
  }

  /** Stop reconnecting and close the active NATS socket. */
  stop(reason = "stopped") {
    const upstream_nats_url = this.started ? this.config.upstream_nats_url : null;
    const upstream_nats_subject_prefix = this.config.upstream_nats_subject_prefix;
    this.started = false;
    if (this.reconnect_timer) {
      clearTimeout(this.reconnect_timer);
      this.reconnect_timer = null;
    }
    const socket = this.socket;
    this.socket = null;
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
      socket.close(1000, reason);
    }
    return { upstream_nats_url, upstream_nats_subject_prefix, stopped: true, reason };
  }

  /** Publish one CDP response to the transport-native NATS reply subject. */
  sendResponse(request: CdpCommandMessage, response: CdpResponseMessage) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    const reply_subject = this.reply_subject_from_request.get(request);
    if (!reply_subject) throw new Error(`NATS downstream request ${request.id} did not include a reply_subject.`);
    this.publish(reply_subject, {
      type: "modcdp.nats.message",
      message: response,
    });
    this.reply_subject_from_request.delete(request);
    return true;
  }

  /** Publish one CDP event message to the NATS browser-to-client subject. */
  sendEvent(message: CdpEventMessage) {
    if (this.socket?.readyState !== WebSocket.OPEN) return 0;
    this.publish(`${this.config.upstream_nats_subject_prefix}.browser_to_client`, {
      type: "modcdp.nats.message",
      message,
    });
    return 1;
  }

  /** Return generic status without exposing NATS lifecycle to ModCDPServer. */
  status() {
    return {
      connected: this.connected,
      config: this.started ? this.config : {},
    };
  }

  private scheduleReconnect() {
    if (!this.started) return;
    if (this.reconnect_timer) return;
    this.reconnect_timer = setTimeout(() => {
      this.reconnect_timer = null;
      if (!this.started) return;
      void this.connect(this.config.upstream_nats_url).catch(() => {});
    }, this.config.reconnect_interval_ms);
  }

  private async connect(endpoint: string) {
    if (!/^wss?:\/\//i.test(endpoint)) {
      throw new Error(
        `NATS downstream endpoint must be a ws:// or wss:// URL for extension transport, got ${endpoint}.`,
      );
    }
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return {
        upstream_nats_url: endpoint,
        upstream_nats_subject_prefix: this.config.upstream_nats_subject_prefix,
        connected: this.socket.readyState === WebSocket.OPEN,
      };
    }
    const ws = new WebSocket(endpoint);
    this.socket = ws;
    this.buffer = "";
    ws.addEventListener("open", () => {
      this.write(`CONNECT ${JSON.stringify(this.connectConfig())}\r\nPING\r\n`);
      this.write(`SUB ${this.config.upstream_nats_subject_prefix}.client_to_browser 1\r\n`);
      this.publish(`${this.config.upstream_nats_subject_prefix}.browser_to_client`, {
        type: "modcdp.nats.hello",
        role: "extension-service-worker",
        version: 1,
        extension_id: globalThis.chrome?.runtime?.id ?? null,
      });
    });
    ws.addEventListener("message", (event) => {
      void this.readWebSocketData(event.data);
    });
    ws.addEventListener("error", () => {
      if (this.socket === ws) this.socket = null;
      this.scheduleReconnect();
    });
    ws.addEventListener("close", () => {
      if (this.socket === ws) this.socket = null;
      this.scheduleReconnect();
    });
    return {
      upstream_nats_url: endpoint,
      upstream_nats_subject_prefix: this.config.upstream_nats_subject_prefix,
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
      const line_end = buffer.indexOf("\r\n");
      if (line_end < 0) return buffer;
      const line = buffer.slice(0, line_end);
      const upper = line.toUpperCase();
      if (upper.startsWith("MSG ")) {
        const parts = line.split(/\s+/);
        const size = Number(parts[parts.length - 1]);
        const payload_start = line_end + 2;
        const payload_end = payload_start + size;
        if (!Number.isInteger(size) || buffer.length < payload_end + 2) return buffer;
        const payload = buffer.slice(payload_start, payload_end);
        buffer = buffer.slice(payload_end + 2);
        void this.handlePayload(payload);
        continue;
      }
      buffer = buffer.slice(line_end + 2);
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
    const record =
      parsed && typeof parsed === "object"
        ? (parsed as { type?: unknown; message?: unknown; reply_subject?: unknown })
        : null;
    if (record?.type === "modcdp.nats.hello") {
      this.publish(`${this.config.upstream_nats_subject_prefix}.browser_to_client`, {
        type: "modcdp.nats.hello",
        role: "extension-service-worker",
        version: 1,
        extension_id: globalThis.chrome?.runtime?.id ?? null,
      });
      return;
    }
    const message = CdpCommandMessageSchema.parse(record?.type === "modcdp.nats.message" ? record.message : parsed);
    if (typeof record?.reply_subject !== "string" || record.reply_subject.length === 0) {
      throw new Error(`NATS downstream command ${message.id} is missing reply_subject.`);
    }
    this.reply_subject_from_request.set(message, record.reply_subject);
    await this.handleRequest(message);
  }

  private connectConfig() {
    return {
      verbose: false,
      pedantic: false,
      lang: "modcdp-extension",
      version: "1",
      protocol: 1,
    };
  }
}

export {
  DEFAULT_NATS_BRIDGE_RECONNECT_INTERVAL_MS,
  DEFAULT_NATS_BRIDGE_URL,
  DEFAULT_NATS_BRIDGE_SUBJECT_PREFIX,
  NATSDownstreamTransport,
};
