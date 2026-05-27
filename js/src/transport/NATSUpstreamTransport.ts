import net from "node:net";
import tls from "node:tls";
import type { z } from "zod";
import type { CdpCommandSchema } from "../types/generated/zod/helpers.js";
import type { CdpCommandMessage, ProtocolPayload, ProtocolResult } from "../types/modcdp.js";
import {
  UpstreamTransport,
  type TargetRoute,
  type UpstreamNatsRole,
  type UpstreamTransportConfig,
} from "./UpstreamTransport.js";

const DEFAULT_UPSTREAM_NATS_URL = "ws://127.0.0.1:4223";
const DEFAULT_UPSTREAM_NATS_SUBJECT_PREFIX = "modcdp.default";
const DEFAULT_UPSTREAM_NATS_WAIT_TIMEOUT_MS = 10_000;

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
  readonly upstream_mode = "nats" as const;
  private upstream_nats_role: UpstreamNatsRole;
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

  constructor(options: UpstreamTransportConfig = {}) {
    super(options);
    const { url, upstream_nats_subject_prefix } = normalizeNatsUrl(
      options.upstream_nats_url ?? DEFAULT_UPSTREAM_NATS_URL,
      options.upstream_nats_subject_prefix,
    );
    this.upstream_nats_url = url;
    this.upstream_nats_subject_prefix = upstream_nats_subject_prefix;
    this.upstream_nats_role = options.upstream_nats_role ?? "client";
    this.upstream_nats_wait_timeout_ms = options.upstream_nats_wait_timeout_ms ?? DEFAULT_UPSTREAM_NATS_WAIT_TIMEOUT_MS;
    this.client_reply_subject = `${this.upstream_nats_subject_prefix}.client.${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
  }

  override send(message: CdpCommandMessage): void;
  override send(
    method: string,
    params?: ProtocolPayload,
    sessionId?: string | null,
    options?: { timeout_ms?: number | null },
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
    command_or_message_or_method: CdpCommandMessage | string | CdpCommandSchema<Params, Result, Name>,
    params: ProtocolPayload | z.input<Params> = {},
    route_or_sessionId: TargetRoute | string | null = null,
    options: { timeout_ms?: number | null } = {},
  ): void | Promise<ProtocolResult> | Promise<z.output<Result>> {
    if (typeof command_or_message_or_method !== "string" && "method" in command_or_message_or_method) {
      if (!this.socket) throw new Error("NATS transport is not connected.");
      this.publish(this.outgoingSubject(), {
        type: "modcdp.nats.message",
        ...(this.upstream_nats_role === "client" ? { reply_subject: this.client_reply_subject } : {}),
        message: command_or_message_or_method,
      });
      return;
    }
    if (typeof command_or_message_or_method === "string") {
      return super.send(
        command_or_message_or_method,
        params as ProtocolPayload,
        typeof route_or_sessionId === "string" ? route_or_sessionId : null,
        options,
      );
    }
    return super.send(command_or_message_or_method, params as z.input<Params>, route_or_sessionId);
  }

  update(config: UpstreamTransportConfig = {}) {
    super.update(config);
    if (config.upstream_nats_url || config.upstream_nats_subject_prefix) {
      const normalized = normalizeNatsUrl(
        config.upstream_nats_url ?? this.upstream_nats_url ?? DEFAULT_UPSTREAM_NATS_URL,
        config.upstream_nats_subject_prefix ?? this.upstream_nats_subject_prefix,
      );
      this.upstream_nats_url = normalized.url;
      this.upstream_nats_subject_prefix = normalized.upstream_nats_subject_prefix;
      this.client_reply_subject = `${this.upstream_nats_subject_prefix}.client.${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
    }
    if (config.upstream_nats_role === "client" || config.upstream_nats_role === "browser")
      this.upstream_nats_role = config.upstream_nats_role;
    if (typeof config.upstream_nats_wait_timeout_ms === "number") {
      this.upstream_nats_wait_timeout_ms = config.upstream_nats_wait_timeout_ms;
    }
    return this;
  }

  async connect() {
    if (this.socket) return;
    if (!this.upstream_nats_url) throw new Error("upstream.upstream_mode=nats requires upstream_nats_url.");
    try {
      const parsed = new URL(this.upstream_nats_url);
      if (parsed.protocol === "ws:" || parsed.protocol === "wss:") await this.connectWebSocket(parsed);
      else if (parsed.protocol === "nats:" || parsed.protocol === "tls:") await this.connectTcp(parsed);
      else
        throw new Error(
          `upstream.upstream_mode=nats requires ws://, wss://, nats://, or tls:// URL, got ${this.upstream_nats_url}.`,
        );
      this.subscribe();
      this.publish(this.outgoingSubject(), {
        type: "modcdp.nats.hello",
        role: this.upstream_nats_role,
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
      const wait_timeout_ms = this.upstream_nats_wait_timeout_ms ?? DEFAULT_UPSTREAM_NATS_WAIT_TIMEOUT_MS;
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
        new Error(`NATS transport for ${this.upstream_nats_subject_prefix} closed before a peer connected.`),
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
        this.writeProtocol(`CONNECT ${JSON.stringify(connectOptions())}\r\nPING\r\n`);
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
        this.writeProtocol(`CONNECT ${JSON.stringify(connectOptions())}\r\nPING\r\n`);
        resolve();
      });
      socket.once("error", reject);
    });
  }

  private subscribe() {
    this.writeProtocol(`SUB ${this.incomingSubject()} ${this.next_sid++}\r\n`);
    if (this.upstream_nats_role === "client") {
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
    return `${this.upstream_nats_subject_prefix}.${this.upstream_nats_role === "client" ? "browser_to_client" : "client_to_browser"}`;
  }

  private outgoingSubject() {
    return `${this.upstream_nats_subject_prefix}.${this.upstream_nats_role === "client" ? "client_to_browser" : "browser_to_client"}`;
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
}

function connectOptions() {
  return {
    verbose: false,
    pedantic: false,
    lang: "modcdp",
    version: "1",
    protocol: 1,
  };
}

function normalizeNatsUrl(url: string, upstream_nats_subject_prefix?: string | null) {
  const parsed = new URL(url);
  const subject = upstream_nats_subject_prefix || parsed.searchParams.get("upstream_nats_subject_prefix");
  parsed.searchParams.delete("upstream_nats_subject_prefix");
  return {
    url: parsed.toString(),
    upstream_nats_subject_prefix: sanitizeSubjectPrefix(subject || DEFAULT_UPSTREAM_NATS_SUBJECT_PREFIX),
  };
}

function sanitizeSubjectPrefix(value: string) {
  const subject = value.trim();
  if (!subject || /[\s*>]/.test(subject)) throw new Error(`Invalid NATS subject prefix ${value}`);
  return subject;
}

export {
  DEFAULT_UPSTREAM_NATS_URL,
  DEFAULT_UPSTREAM_NATS_SUBJECT_PREFIX,
  DEFAULT_UPSTREAM_NATS_WAIT_TIMEOUT_MS,
  NATSUpstreamTransport,
};
