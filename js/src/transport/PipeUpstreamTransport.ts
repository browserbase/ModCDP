import type { z } from "zod";
import type { CdpCommandSchema } from "../types/generated/zod/helpers.js";
import type {
  CdpCommandMessage,
  ProtocolPayload,
  ProtocolResult,
} from "../types/modcdp.js";
import {
  UpstreamTransport,
  type TargetRoute,
  type UpstreamOptions,
} from "./UpstreamTransport.js";

export class PipeUpstreamTransport extends UpstreamTransport {
  readonly upstream_mode = "pipe" as const;
  private buffer = "";
  private connected = false;

  private upstream_pipe_read: NodeJS.ReadableStream | null;
  private upstream_pipe_write: NodeJS.WritableStream | null;

  constructor({
    upstream_pipe_read = null,
    upstream_pipe_write = null,
  }: {
    upstream_pipe_read?: NodeJS.ReadableStream | null;
    upstream_pipe_write?: NodeJS.WritableStream | null;
  } & UpstreamOptions = {}) {
    super();
    this.upstream_pipe_read = upstream_pipe_read;
    this.upstream_pipe_write = upstream_pipe_write;
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
    command_or_message_or_method:
      | CdpCommandMessage
      | string
      | CdpCommandSchema<Params, Result, Name>,
    params: ProtocolPayload | z.input<Params> = {},
    route_or_sessionId: TargetRoute | string | null = null,
    options: { timeout_ms?: number | null } = {},
  ): void | Promise<ProtocolResult> | Promise<z.output<Result>> {
    if (
      typeof command_or_message_or_method !== "string" &&
      "method" in command_or_message_or_method
    ) {
      if (!this.upstream_pipe_write || !this.connected)
        throw new Error("CDP pipe is not connected.");
      this.upstream_pipe_write.write(
        `${JSON.stringify(command_or_message_or_method)}\0`,
      );
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
      route_or_sessionId,
    );
  }

  update(config: UpstreamOptions = {}) {
    this.upstream_pipe_read =
      config.upstream_pipe_read ?? this.upstream_pipe_read;
    this.upstream_pipe_write =
      config.upstream_pipe_write ?? this.upstream_pipe_write;
    if (typeof config.upstream_cdp_send_timeout_ms === "number")
      this.upstream_cdp_send_timeout_ms = config.upstream_cdp_send_timeout_ms;
    return this;
  }

  configForLauncher() {
    return { launcher_local_cdp_transport: "pipe" as const };
  }

  async connect() {
    if (!this.upstream_pipe_read || !this.upstream_pipe_write) {
      throw new Error(
        "upstream.upstream_mode=pipe requires launcher-provided CDP pipe handles.",
      );
    }
    if (this.connected) return;
    this.connected = true;
    this.upstream_pipe_read.on("data", (chunk) => this.read(chunk));
    this.upstream_pipe_read.on("end", () =>
      this.handleClose(new Error("CDP pipe closed")),
    );
    this.upstream_pipe_read.on("error", () =>
      this.handleClose(new Error("CDP pipe error")),
    );
    this.upstream_pipe_write.on("error", () =>
      this.handleClose(new Error("CDP pipe write error")),
    );
  }

  async close() {
    try {
      this.upstream_pipe_write?.end();
    } catch {}
    try {
      (this.upstream_pipe_read as { destroy?: () => void } | null)?.destroy?.();
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
