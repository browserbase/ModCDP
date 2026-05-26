import type { WebSocket as WsSocket, WebSocketServer as WsServer } from "ws";
import type { z } from "zod";
import type { CdpCommandSchema } from "../types/generated/zod/helpers.js";
import type { CdpCommandMessage, ProtocolPayload, ProtocolResult } from "../types/modcdp.js";
import { parseHostPort, UpstreamTransport, type UpstreamOptions, type UpstreamTransportConfig } from "./UpstreamTransport.js";
import type { TargetRoute } from "./UpstreamTransport.js";

export const DEFAULT_UPSTREAM_REVERSEWS_BIND = "127.0.0.1:29292";
export const DEFAULT_UPSTREAM_REVERSEWS_WAIT_TIMEOUT_MS = 10_000;

type ReverseHello = {
  type: "modcdp.reverse.hello";
  role?: string;
  version?: number;
  extension_id?: string | null;
};

export class ReverseWebSocketUpstreamTransport extends UpstreamTransport {
  readonly upstream_mode = "reversews" as const;
  private endpoint_url: string;
  private reversews_listener: WsServer | null = null;
  private socket: WsSocket | null = null;
  private peer_waiters = new Set<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  peer_info: ReverseHello | null = null;

  get upstream_reversews_url() {
    return this.endpoint_url;
  }

  constructor({
    upstream_reversews_bind = DEFAULT_UPSTREAM_REVERSEWS_BIND,
    upstream_reversews_wait_timeout_ms = DEFAULT_UPSTREAM_REVERSEWS_WAIT_TIMEOUT_MS,
  }: {
    upstream_reversews_bind?: string | null;
    upstream_reversews_wait_timeout_ms?: number | null;
  } & UpstreamOptions = {}) {
    super();
    this.upstream_reversews_bind = upstream_reversews_bind ?? DEFAULT_UPSTREAM_REVERSEWS_BIND;
    this.upstream_reversews_wait_timeout_ms =
      upstream_reversews_wait_timeout_ms ?? DEFAULT_UPSTREAM_REVERSEWS_WAIT_TIMEOUT_MS;
    this.endpoint_url = endpointFromBind(this.upstream_reversews_bind);
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
    route?: TargetRoute,
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
      if (!this.socket || this.socket.readyState !== this.socket.OPEN) {
        throw new Error(`No reverse ModCDP extension peer is connected at ${this.endpoint_url}.`);
      }
      this.socket.send(JSON.stringify(command_or_message_or_method));
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
    return super.send(
      command_or_message_or_method,
      params as z.input<Params>,
      route_or_sessionId && typeof route_or_sessionId === "object" ? route_or_sessionId : undefined,
    );
  }

  update(config: UpstreamTransportConfig = {}) {
    if (config.upstream_reversews_bind) {
      this.upstream_reversews_bind = config.upstream_reversews_bind;
      this.endpoint_url = endpointFromBind(config.upstream_reversews_bind);
    }
    if (typeof config.upstream_reversews_wait_timeout_ms === "number") {
      this.upstream_reversews_wait_timeout_ms = config.upstream_reversews_wait_timeout_ms;
    }
    if (typeof config.cdp_send_timeout_ms === "number") this.cdp_send_timeout_ms = config.cdp_send_timeout_ms;
    return this;
  }

  async connect() {
    const { WebSocketServer } = await import("ws");
    const { host, port } = parseHostPort(this.endpoint_url, "127.0.0.1", 29292);
    const reversews_listener = new WebSocketServer({ host, port });
    this.reversews_listener = reversews_listener;
    reversews_listener.on("connection", (socket) => this.accept(socket));
    await new Promise<void>((resolve, reject) => {
      reversews_listener.once("listening", () => resolve());
      reversews_listener.once("error", reject);
    });
  }

  async waitForPeer() {
    if (this.socket && this.socket.readyState === this.socket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      let waiter!: {
        resolve: () => void;
        reject: (error: Error) => void;
        timeout: ReturnType<typeof setTimeout>;
      };
      const wait_timeout_ms = this.upstream_reversews_wait_timeout_ms ?? DEFAULT_UPSTREAM_REVERSEWS_WAIT_TIMEOUT_MS;
      const timeout = setTimeout(() => {
        this.peer_waiters.delete(waiter);
        reject(new Error(`Timed out waiting ${wait_timeout_ms}ms for reverse ModCDP extension connection.`));
      }, wait_timeout_ms);
      waiter = { resolve, reject, timeout };
      this.peer_waiters.add(waiter);
    });
  }

  async close() {
    try {
      this.socket?.close();
    } catch {}
    this.socket = null;
    this.peer_info = null;
    if (this.reversews_listener) await new Promise<void>((resolve) => this.reversews_listener?.close(() => resolve()));
    this.reversews_listener = null;
    for (const waiter of this.peer_waiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error(`Reverse websocket transport at ${this.endpoint_url} closed before a peer connected.`));
    }
    this.peer_waiters.clear();
  }

  private accept(socket: WsSocket) {
    const fail = (message: string) => {
      try {
        socket.close(1008, message.slice(0, 120));
      } catch {}
    };
    const timeout = setTimeout(
      () => fail("reverse hello timeout"),
      this.upstream_reversews_wait_timeout_ms ?? DEFAULT_UPSTREAM_REVERSEWS_WAIT_TIMEOUT_MS,
    );
    socket.once("message", (buf: unknown) => {
      clearTimeout(timeout);
      let hello: ReverseHello;
      try {
        const parsed = JSON.parse(String(buf));
        if (parsed?.type !== "modcdp.reverse.hello") throw new Error("missing hello type");
        hello = parsed;
      } catch (error) {
        fail(`invalid reverse hello: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      if (this.socket && this.socket !== socket) {
        try {
          this.socket.close(1012, "reverse peer replaced");
        } catch {}
      }
      this.socket = socket;
      this.peer_info = hello;
      socket.on("message", (data: unknown) => this.parseAndEmitRecv(data));
      socket.on("close", (code, reason) => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.peer_info = null;
        const suffix = code || reason.length ? ` (code=${code}, reason=${reason.toString()})` : "";
        this.emitClose(new Error(`Reverse ModCDP websocket closed${suffix}`));
      });
      socket.on("error", () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.peer_info = null;
        this.emitClose(new Error("Reverse ModCDP websocket error"));
      });
      for (const waiter of this.peer_waiters) {
        clearTimeout(waiter.timeout);
        waiter.resolve();
      }
      this.peer_waiters.clear();
    });
  }
}

function endpointFromBind(bind: string) {
  const { host, port } = parseHostPort(bind, "127.0.0.1", 29292);
  return `ws://${host}:${port}`;
}
