import type { z } from "zod";
import type { CdpCommandSchema } from "../types/generated/zod/helpers.js";
import type { CdpCommandMessage, ProtocolPayload, ProtocolResult } from "../types/modcdp.js";
import { UpstreamTransport, type TargetRoute, type UpstreamTransportConfig } from "./UpstreamTransport.js";

export class PipeUpstreamTransport extends UpstreamTransport {
  readonly upstream_mode = "pipe" as const;
  readonly endpoint_kind = "raw_cdp" as const;
  private buffer = "";
  private connected = false;

  private pipe_read: NodeJS.ReadableStream | null;
  private pipe_write: NodeJS.WritableStream | null;

  constructor({
    pipe_read = null,
    pipe_write = null,
  }: {
    pipe_read?: NodeJS.ReadableStream | null;
    pipe_write?: NodeJS.WritableStream | null;
  } = {}) {
    super();
    this.pipe_read = pipe_read;
    this.pipe_write = pipe_write;
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
      if (!this.pipe_write || !this.connected) throw new Error("CDP pipe is not connected.");
      this.pipe_write.write(`${JSON.stringify(command_or_message_or_method)}\0`);
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
    this.pipe_read = config.pipe_read ?? this.pipe_read;
    this.pipe_write = config.pipe_write ?? this.pipe_write;
    if (typeof config.cdp_send_timeout_ms === "number") this.cdp_send_timeout_ms = config.cdp_send_timeout_ms;
    return this;
  }

  getLauncherConfig() {
    return { remote_debugging: "pipe" as const };
  }

  async connect() {
    if (!this.pipe_read || !this.pipe_write) {
      throw new Error("upstream.upstream_mode=pipe requires launcher-provided remote-debugging pipe handles.");
    }
    if (this.connected) return;
    this.connected = true;
    this.pipe_read.on("data", (chunk) => this.read(chunk));
    this.pipe_read.on("end", () => this.handleClose(new Error("CDP pipe closed")));
    this.pipe_read.on("error", () => this.handleClose(new Error("CDP pipe error")));
    this.pipe_write.on("error", () => this.handleClose(new Error("CDP pipe write error")));
  }

  async close() {
    try {
      this.pipe_write?.end();
    } catch {}
    try {
      (this.pipe_read as { destroy?: () => void } | null)?.destroy?.();
    } catch {}
    this.connected = false;
  }

  private read(chunk: Buffer | string) {
    this.buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
    for (;;) {
      const end = this.buffer.indexOf("\0");
      if (end < 0) return;
      const message = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (message) this.parseAndEmitRecv(message);
    }
  }

  private handleClose(error: Error) {
    this.connected = false;
    this.emitClose(error);
  }
}
