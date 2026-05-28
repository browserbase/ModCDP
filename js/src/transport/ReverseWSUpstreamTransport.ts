// MODCDP_TS_ONLY: DO NOT TRANSLATE THIS FILE TO OTHER LANGUAGES.
// Reason: not needed by Stagehand (exotic transport).
import type { WebSocket as WsSocket, WebSocketServer as WsServer } from "ws";
import { z } from "zod";
import type { CdpCommandSchema } from "../types/generated/zod/helpers.js";
import type { CdpCommandMessage, ProtocolPayload, ProtocolResult } from "../types/modcdp.js";
import { DEFAULT_CLIENT_CDP_SEND_TIMEOUT_MS } from "../types/modcdp.js";
import { parseHostPort, UpstreamTransport, type UpstreamPeerWaitConfig } from "./UpstreamTransport.js";
import type { TargetRoute } from "./UpstreamTransport.js";

const DEFAULT_UPSTREAM_REVERSEWS_BIND = "127.0.0.1:29292";
const DEFAULT_UPSTREAM_REVERSEWS_WAIT_TIMEOUT_MS = 10_000;

const ReverseWSUpstreamTransportConfigSchema = z.object({
  upstream_mode: z.literal("reversews").default("reversews"),
  upstream_reversews_bind: z.string().default(DEFAULT_UPSTREAM_REVERSEWS_BIND),
  upstream_reversews_wait_timeout_ms: z.number().positive().default(DEFAULT_UPSTREAM_REVERSEWS_WAIT_TIMEOUT_MS),
  upstream_cdp_send_timeout_ms: z.number().positive().default(DEFAULT_CLIENT_CDP_SEND_TIMEOUT_MS),
});
type ReverseWSUpstreamTransportConfig = z.infer<typeof ReverseWSUpstreamTransportConfigSchema>;

type ReverseHello = {
  type: "modcdp.reverse.hello";
  role?: string;
  version?: number;
  extension_id?: string | null;
};

class ReverseWSUpstreamTransport extends UpstreamTransport {
  declare config: ReverseWSUpstreamTransportConfig;
  override peer_kind = "modcdp_server" as const;
  endpoint_url: string;
  private reversews_listener: WsServer | null = null;
  private socket: WsSocket | null = null;
  private peer_connected_at: number | null = null;
  private peer_waiters = new Set<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
    connected_after_ms: number | null;
  }>();
  peer_info: ReverseHello | null = null;

  constructor(config: z.input<typeof ReverseWSUpstreamTransportConfigSchema> = {}) {
    super();
    this.config = ReverseWSUpstreamTransportConfigSchema.parse({ ...config, upstream_mode: "reversews" });
    this.endpoint_url = endpointFromBind(this.config.upstream_reversews_bind);
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
      if (!this.socket || this.socket.readyState !== this.socket.OPEN) {
        throw new Error(`No reverse ModCDP extension peer is connected at ${this.endpoint_url}.`);
      }
      this.socket.send(JSON.stringify(command));
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
    this.config = ReverseWSUpstreamTransportConfigSchema.parse({
      ...this.config,
      ...config,
      upstream_mode: "reversews",
    });
    this.endpoint_url = endpointFromBind(this.config.upstream_reversews_bind);
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

  async waitForPeer({ connected_after_ms = null }: UpstreamPeerWaitConfig = {}) {
    if (
      this.socket &&
      this.socket.readyState === this.socket.OPEN &&
      (connected_after_ms == null || (this.peer_connected_at != null && this.peer_connected_at >= connected_after_ms))
    )
      return;
    await new Promise<void>((resolve, reject) => {
      let waiter!: {
        resolve: () => void;
        reject: (error: Error) => void;
        timeout: ReturnType<typeof setTimeout>;
        connected_after_ms: number | null;
      };
      const wait_timeout_ms = this.config.upstream_reversews_wait_timeout_ms;
      const timeout = setTimeout(() => {
        this.peer_waiters.delete(waiter);
        reject(new Error(`Timed out waiting ${wait_timeout_ms}ms for reverse ModCDP extension connection.`));
      }, wait_timeout_ms);
      waiter = { resolve, reject, timeout, connected_after_ms };
      this.peer_waiters.add(waiter);
    });
  }

  async close() {
    try {
      this.socket?.close();
    } catch {}
    this.socket = null;
    this.peer_connected_at = null;
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
    const timeout = setTimeout(() => fail("reverse hello timeout"), this.config.upstream_reversews_wait_timeout_ms);
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
      this.peer_connected_at = Date.now();
      this.peer_info = hello;
      socket.on("message", (data: unknown) => this.parseAndEmitRecv(data));
      socket.on("close", (code, reason) => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.peer_connected_at = null;
        this.peer_info = null;
        const suffix = code || reason.length ? ` (code=${code}, reason=${reason.toString()})` : "";
        this.emitClose(new Error(`Reverse ModCDP websocket closed${suffix}`));
      });
      socket.on("error", () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.peer_connected_at = null;
        this.peer_info = null;
        this.emitClose(new Error("Reverse ModCDP websocket error"));
      });
      for (const waiter of this.peer_waiters) {
        if (waiter.connected_after_ms != null && this.peer_connected_at < waiter.connected_after_ms) continue;
        clearTimeout(waiter.timeout);
        waiter.resolve();
        this.peer_waiters.delete(waiter);
      }
    });
  }

  override toJSON() {
    const json = super.toJSON();
    return {
      ...json,
      state: {
        ...json.state,
        connected: this.socket?.readyState === this.socket?.OPEN,
        peer_connected_at: this.peer_connected_at,
        peer_waiters: this.peer_waiters.size,
        has_peer_info: this.peer_info != null,
      },
    };
  }
}

function endpointFromBind(bind: string) {
  const { host, port } = parseHostPort(bind, "127.0.0.1", 29292);
  return `ws://${host}:${port}`;
}

export {
  DEFAULT_UPSTREAM_REVERSEWS_BIND,
  DEFAULT_UPSTREAM_REVERSEWS_WAIT_TIMEOUT_MS,
  ReverseWSUpstreamTransport,
  ReverseWSUpstreamTransportConfigSchema,
};
export type { ReverseWSUpstreamTransportConfig };
