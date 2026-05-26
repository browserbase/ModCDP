import { resolveCdpWebSocketUrl } from "../launcher/BrowserLauncher.js";
import type { z } from "zod";
import type { CdpCommandSchema } from "../types/generated/zod/helpers.js";
import type { CdpCommandMessage, ProtocolPayload, ProtocolResult } from "../types/modcdp.js";
import { UpstreamTransport, type TargetRoute, type UpstreamTransportConfig } from "./UpstreamTransport.js";

export class WebSocketUpstreamTransport extends UpstreamTransport {
  readonly upstream_mode = "ws" as const;
  readonly endpoint_kind = "raw_cdp" as const;
  ws: WebSocket | null = null;

  constructor({ cdp_url = null }: { cdp_url?: string | null } = {}) {
    super();
    this.upstream_cdp_url = cdp_url ?? "";
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
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("CDP websocket is not connected.");
      this.ws.send(JSON.stringify(command_or_message_or_method));
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
    if (config.cdp_url) this.upstream_cdp_url = config.cdp_url;
    if (typeof config.cdp_send_timeout_ms === "number") this.cdp_send_timeout_ms = config.cdp_send_timeout_ms;
    return this;
  }

  getServerConfig() {
    return this.upstream_cdp_url ? { server_loopback_cdp_url: this.upstream_cdp_url } : {};
  }

  async connect() {
    if (!this.upstream_cdp_url)
      throw new Error("upstream.upstream_mode=ws requires upstream_cdp_url or launcher-provided cdp_url.");
    // cdp_url may start as an HTTP discovery endpoint; from here on it is the resolved WebSocket CDP endpoint.
    this.upstream_cdp_url = await resolveCdpWebSocketUrl(this.upstream_cdp_url, "upstream_cdp_url");
    const ws = new WebSocket(this.upstream_cdp_url);
    this.ws = ws;
    ws.addEventListener("message", (event) => this.parseAndEmitRecv(event.data));
    ws.addEventListener("close", () => this.emitClose(new Error("CDP websocket closed")));
    ws.addEventListener("error", () => this.emitClose(new Error("CDP websocket error")));
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
  }

  async close() {
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }
}
