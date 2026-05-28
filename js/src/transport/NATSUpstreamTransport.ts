// MODCDP_TS_ONLY: DO NOT TRANSLATE THIS FILE TO OTHER LANGUAGES.
// Reason: not needed by Stagehand (exotic transport).
import net from "node:net";
import tls from "node:tls";
import { z } from "zod";
import type { CdpCommandSchema } from "../types/generated/zod/helpers.js";
import type { CdpCommandMessage, ProtocolPayload, ProtocolResult } from "../types/modcdp.js";
import { DEFAULT_CLIENT_CDP_SEND_TIMEOUT_MS } from "../types/modcdp.js";
import { UpstreamTransport, type TargetRoute } from "./UpstreamTransport.js";

const DEFAULT_UPSTREAM_NATS_URL = "ws://127.0.0.1:4223";
const DEFAULT_UPSTREAM_NATS_SUBJECT_PREFIX = "modcdp.default";
const DEFAULT_UPSTREAM_NATS_WAIT_TIMEOUT_MS = 10_000;

const NATSUpstreamTransportConfigSchema = z.object({
  upstream_mode: z.literal("nats").default("nats"),
  upstream_nats_url: z.string().default(DEFAULT_UPSTREAM_NATS_URL),
  upstream_nats_subject_prefix: z
    .string()
    .refine((value) => value.trim().length > 0 && !/[\s*>]/.test(value), "Invalid NATS subject prefix")
    .default(DEFAULT_UPSTREAM_NATS_SUBJECT_PREFIX),
  upstream_nats_role: z.enum(["client", "browser"]).default("client"),
  upstream_nats_wait_timeout_ms: z.number().positive().default(DEFAULT_UPSTREAM_NATS_WAIT_TIMEOUT_MS),
  upstream_cdp_send_timeout_ms: z.number().positive().default(DEFAULT_CLIENT_CDP_SEND_TIMEOUT_MS),
});
type NATSUpstreamTransportConfig = z.infer<typeof NATSUpstreamTransportConfigSchema>;

type NatsTcpSocket = {
  write(data: string): void;
  destroy(): void;
  on(event: "data", listener: (chunk: Buffer | string) => void): void;
  on(event: "close" | "error", listener: () => void): void;
  once(event: "connect", listener: () => void): void;
  once(event: "error", listener: (error: Error) => void): void;
};
type NatsSocket = WebSocket | NatsTcpSocket;

class NATSUpstreamTransport extends UpstreamTransport {
  declare config: NATSUpstreamTransportConfig;
  override peer_kind = "modcdp_server" as const;
  private socket: NatsSocket | null = null;
  private tcp_buffer = Buffer.alloc(0);
  private ws_buffer = "";
  private next_sid = 1;
  private client_reply_subject: string;
  private peer_seen = false;
  private peer_waiters = new Set<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();

  constructor(config: z.input<typeof NATSUpstreamTransportConfigSchema> = {}) {
    super();
    this.config = NATSUpstreamTransportConfigSchema.parse({ ...config, upstream_mode: "nats" });
    this.client_reply_subject = `${this.config.upstream_nats_subject_prefix}.client.${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
  }

  override send(message: CdpCommandMessage): void;
  override send(
    method: string,
    params?: ProtocolPayload,
    sessionId?: string | null,
    config?: { timeout_ms?: number | null },
  ): Promise<ProtocolResult>;
  override send<
    Params extends z.ZodType<Record<string, unknown>>,
    Result extends z.ZodType<Record<string, unknown>>,
    Name extends string,
  >(
    command: CdpCommandSchema<Params, Result, Name>,
    params?: z.input<Params>,
    route?: TargetRoute | string | null,
  ): Promise<z.output<Result>>;
  override send<
    Params extends z.ZodType<Record<string, unknown>>,
    Result extends z.ZodType<Record<string, unknown>>,
    Name extends string,
  >(
    command: CdpCommandMessage | string | CdpCommandSchema<Params, Result, Name>,
    params: ProtocolPayload | z.input<Params> = {},
    route_or_sessionId: TargetRoute | string | null = null,
    config: { timeout_ms?: number | null } = {},
  ): void | Promise<ProtocolResult> | Promise<z.output<Result>> {
    if (typeof command !== "string" && "method" in command) {
      if (!this.socket) throw new Error("NATS transport is not connected.");
      this.publish(this.outgoingSubject(), {
        type: "modcdp.nats.message",
        ...(this.config.upstream_nats_role === "client" ? { reply_subject: this.client_reply_subject } : {}),
        message: command,
      });
      return;
    }
    if (typeof command === "string") {
      return super.send(
        command,
        params as ProtocolPayload,
        typeof route_or_sessionId === "string" ? route_or_sessionId : null,
        config,
      );
    }
    return super.send(command, params as z.input<Params>, route_or_sessionId);
  }

  override update(config: Record<string, unknown> = {}) {
    const previous_subject_prefix = this.config.upstream_nats_subject_prefix;
    this.config = NATSUpstreamTransportConfigSchema.parse({ ...this.config, ...config, upstream_mode: "nats" });
    if (this.config.upstream_nats_subject_prefix !== previous_subject_prefix) {
      this.client_reply_subject = `${this.config.upstream_nats_subject_prefix}.client.${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
    }
    return this;
  }

  async connect() {
    if (this.socket) return;
    try {
      const parsed = new URL(this.config.upstream_nats_url);
      if (parsed.protocol === "ws:" || parsed.protocol === "wss:") await this.connectWebSocket(parsed);
      else if (parsed.protocol === "nats:" || parsed.protocol === "tls:") await this.connectTcp(parsed);
      else
        throw new Error(
          `upstream_mode=nats requires ws://, wss://, nats://, or tls:// URL, got ${this.config.upstream_nats_url}.`,
        );
      this.subscribe();
      this.publish(this.outgoingSubject(), {
        type: "modcdp.nats.hello",
        role: this.config.upstream_nats_role,
        version: 1,
      });
    } catch (error) {
      this.socket = null;
      throw error;
    }
  }

  async waitForPeer() {
    if (this.peer_seen) return;
    await new Promise<void>((resolve, reject) => {
      let waiter!: {
        resolve: () => void;
        reject: (error: Error) => void;
        timeout: ReturnType<typeof setTimeout>;
      };
      const wait_timeout_ms = this.config.upstream_nats_wait_timeout_ms;
      const timeout = setTimeout(() => {
        this.peer_waiters.delete(waiter);
        reject(new Error(`Timed out waiting ${wait_timeout_ms}ms for NATS ModCDP peer.`));
      }, wait_timeout_ms);
      waiter = { resolve, reject, timeout };
      this.peer_waiters.add(waiter);
    });
  }

  async close() {
    try {
      if (this.socket instanceof WebSocket) this.socket.close();
      else this.socket?.destroy();
    } catch {}
    this.socket = null;
    this.peer_seen = false;
    for (const waiter of this.peer_waiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(
        new Error(`NATS transport for ${this.config.upstream_nats_subject_prefix} closed before a peer connected.`),
      );
    }
    this.peer_waiters.clear();
  }

  private async connectWebSocket(url: URL) {
    const ws = new WebSocket(url);
    this.socket = ws;
    ws.addEventListener("message", (event) => {
      void this.readWebSocket(event.data);
    });
    ws.addEventListener("close", () => {
      if (this.socket === ws) this.socket = null;
      this.emitClose(new Error("NATS websocket closed"));
    });
    ws.addEventListener("error", () => {
      if (this.socket === ws) this.socket = null;
      this.emitClose(new Error("NATS websocket error"));
    });
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
      };
      const onOpen = () => {
        cleanup();
        this.writeProtocol(`CONNECT ${JSON.stringify(connectConfig())}\r\nPING\r\n`);
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`NATS websocket connection failed for ${url.toString()}`));
      };
      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onError);
    });
  }

  private async connectTcp(url: URL) {
    const port = Number(url.port || (url.protocol === "tls:" ? 4222 : 4222));
    const host = url.hostname || "127.0.0.1";
    const socket = (
      url.protocol === "tls:" ? tls.connect({ host, port }) : net.connect({ host, port })
    ) as NatsTcpSocket;
    this.socket = socket;
    socket.on("data", (chunk) => this.readTcp(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    socket.on("close", () => {
      if (this.socket === socket) this.socket = null;
      this.emitClose(new Error("NATS socket closed"));
    });
    socket.on("error", () => {
      if (this.socket === socket) this.socket = null;
      this.emitClose(new Error("NATS socket error"));
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => {
        this.writeProtocol(`CONNECT ${JSON.stringify(connectConfig())}\r\nPING\r\n`);
        resolve();
      });
      socket.once("error", reject);
    });
  }

  private subscribe() {
    this.writeProtocol(`SUB ${this.incomingSubject()} ${this.next_sid++}\r\n`);
    if (this.config.upstream_nats_role === "client") {
      this.writeProtocol(`SUB ${this.client_reply_subject} ${this.next_sid++}\r\n`);
    }
  }

  private publish(subject: string, message: unknown) {
    const body = JSON.stringify(message);
    this.writeProtocol(`PUB ${subject} ${Buffer.byteLength(body)}\r\n${body}\r\n`);
  }

  private writeProtocol(data: string) {
    const socket = this.socket;
    if (!socket) throw new Error("NATS transport is not connected.");
    if (socket instanceof WebSocket) socket.send(data);
    else socket.write(data);
  }

  private incomingSubject() {
    return `${this.config.upstream_nats_subject_prefix}.${this.config.upstream_nats_role === "client" ? "browser_to_client" : "client_to_browser"}`;
  }

  private outgoingSubject() {
    return `${this.config.upstream_nats_subject_prefix}.${this.config.upstream_nats_role === "client" ? "client_to_browser" : "browser_to_client"}`;
  }

  private async readWebSocket(data: unknown) {
    if (data instanceof ArrayBuffer) this.ws_buffer += Buffer.from(data).toString("utf8");
    else if (ArrayBuffer.isView(data))
      this.ws_buffer += Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
    else if (typeof Blob !== "undefined" && data instanceof Blob) this.ws_buffer += await data.text();
    else this.ws_buffer += String(data);
    this.ws_buffer = this.consumeProtocol(this.ws_buffer);
  }

  private readTcp(chunk: Buffer) {
    this.tcp_buffer = Buffer.concat([this.tcp_buffer, chunk]);
    const remaining = this.consumeProtocol(this.tcp_buffer.toString("utf8"));
    this.tcp_buffer = Buffer.from(remaining, "utf8");
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
        this.handlePayload(payload);
        continue;
      }
      buffer = buffer.slice(lineEnd + 2);
      if (upper === "PING") this.writeProtocol("PONG\r\n");
      else if (upper.startsWith("-ERR")) this.emitClose(new Error(`NATS error: ${line}`));
    }
  }

  private handlePayload(payload: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    if (record?.type === "modcdp.nats.hello") {
      this.peer_seen = true;
      for (const waiter of this.peer_waiters) {
        clearTimeout(waiter.timeout);
        waiter.resolve();
      }
      this.peer_waiters.clear();
      return;
    }
    const message = record?.type === "modcdp.nats.message" ? record.message : parsed;
    this.parseAndEmitRecv(JSON.stringify(message));
  }

  override toJSON() {
    const json = super.toJSON();
    return {
      ...json,
      state: {
        ...json.state,
        connected: this.socket != null,
        peer_seen: this.peer_seen,
        peer_waiters: this.peer_waiters.size,
        buffered_bytes: this.tcp_buffer.length + this.ws_buffer.length,
      },
    };
  }
}

function connectConfig() {
  return {
    verbose: false,
    pedantic: false,
    lang: "modcdp",
    version: "1",
    protocol: 1,
  };
}

export {
  DEFAULT_UPSTREAM_NATS_URL,
  DEFAULT_UPSTREAM_NATS_SUBJECT_PREFIX,
  DEFAULT_UPSTREAM_NATS_WAIT_TIMEOUT_MS,
  NATSUpstreamTransport,
  NATSUpstreamTransportConfigSchema,
};
export type { NATSUpstreamTransportConfig };
