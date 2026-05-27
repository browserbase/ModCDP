import { resolveCdpWebSocketUrl } from "../launcher/BrowserLauncher.js";
import type { z } from "zod";
import type { CdpCommandSchema } from "../types/generated/zod/helpers.js";
import type { CdpCommandMessage, ProtocolPayload, ProtocolResult } from "../types/modcdp.js";
import { UpstreamTransport, type TargetRoute, type UpstreamTransportConfig } from "./UpstreamTransport.js";

const DEFAULT_UPSTREAM_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS = 250;

class WSUpstreamTransport extends UpstreamTransport {
  override readonly upstream_mode = "ws" as const;
  ws: WebSocket | null = null;
  private connect_promise: Promise<void> | null = null;

  constructor(options: UpstreamTransportConfig = {}) {
    super(options);
    this.upstream_ws_cdp_url = options.upstream_ws_cdp_url ?? "";
    this.upstream_ws_connect_error_settle_timeout_ms =
      options.upstream_ws_connect_error_settle_timeout_ms ?? DEFAULT_UPSTREAM_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS;
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
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("CDP websocket is not connected.");
      this.ws.send(JSON.stringify(command_or_message_or_method));
      return;
    }
    if (typeof command_or_message_or_method === "string") {
      return this.connect().then(
        () =>
          super.send(
            command_or_message_or_method,
            params as ProtocolPayload,
            typeof route_or_sessionId === "string" ? route_or_sessionId : null,
            options,
          ) as Promise<ProtocolResult>,
      );
    }
    return this.connect().then(
      () =>
        super.send(command_or_message_or_method, params as z.input<Params>, route_or_sessionId) as Promise<
          z.output<Result>
        >,
    );
  }

  update(config: UpstreamTransportConfig = {}) {
    super.update(config);
    return this;
  }

  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.connect_promise) return await this.connect_promise;
    if (!this.upstream_ws_cdp_url)
      throw new Error("WSUpstreamTransport requires upstream_ws_cdp_url or launcher-provided cdp_url.");
    this.connect_promise = (async () => {
      // upstream_ws_cdp_url may start as an HTTP discovery endpoint; from here on it is the resolved WebSocket CDP endpoint.
      this.upstream_ws_cdp_url = await resolveCdpWebSocketUrl(this.upstream_ws_cdp_url!, "upstream_ws_cdp_url");
      const ws = new WebSocket(this.upstream_ws_cdp_url);
      this.ws = ws;
      ws.addEventListener("message", (event) => this.parseAndEmitRecv(event.data));
      ws.addEventListener("close", () => {
        if (this.ws === ws) this.ws = null;
        this.connect_promise = null;
        this.emitClose(new Error("CDP websocket closed"));
      });
      ws.addEventListener("error", () => {
        if (this.ws === ws) this.ws = null;
        this.connect_promise = null;
        this.emitClose(new Error("CDP websocket error"));
      });
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          ws.removeEventListener("open", onOpen);
          ws.removeEventListener("error", onError);
        };
        const onOpen = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error("CDP websocket error"));
        };
        ws.addEventListener("open", onOpen);
        ws.addEventListener("error", onError);
      });
    })();
    try {
      await this.connect_promise;
    } catch (error) {
      this.connect_promise = null;
      throw error;
    }
  }

  async close() {
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.connect_promise = null;
  }
}

export { DEFAULT_UPSTREAM_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS, WSUpstreamTransport };
