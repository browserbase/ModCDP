import type { z } from "zod";
import type { CdpCommandSchema } from "../types/generated/zod/helpers.js";
import type { CdpCommandMessage, ProtocolPayload, ProtocolResult } from "../types/modcdp.js";
import { UpstreamTransport, type TargetRoute, type UpstreamTransportConfig } from "./UpstreamTransport.js";

class PipeUpstreamTransport extends UpstreamTransport {
  readonly upstream_mode = "pipe" as const;
  private buffer = "";
  private pipe_cleanup: (() => void) | null = null;

  private upstream_pipe_read: NodeJS.ReadableStream | null;
  private upstream_pipe_write: NodeJS.WritableStream | null;

  constructor(options: UpstreamTransportConfig = {}) {
    super(options);
    this.upstream_ws_cdp_url = null;
    this.upstream_pipe_read = options.upstream_pipe_read ?? null;
    this.upstream_pipe_write = options.upstream_pipe_write ?? null;
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
      if (!this.upstream_pipe_write || !this.pipe_cleanup) throw new Error("CDP pipe is not connected.");
      this.upstream_pipe_write.write(`${JSON.stringify(command_or_message_or_method)}\0`);
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
    this.upstream_ws_cdp_url = null;
    this.upstream_pipe_read = config.upstream_pipe_read ?? this.upstream_pipe_read;
    this.upstream_pipe_write = config.upstream_pipe_write ?? this.upstream_pipe_write;
    return this;
  }

  configForLauncher() {
    return { launcher_local_cdp_transport: "pipe" as const };
  }

  async connect() {
    if (!this.upstream_pipe_read || !this.upstream_pipe_write) {
      throw new Error("upstream.upstream_mode=pipe requires launcher-provided CDP pipe handles.");
    }
    if (this.pipe_cleanup) return;
    const on_data = (chunk: Buffer | string) => this.read(chunk);
    const on_end = () => this.handleClose(new Error("CDP pipe closed"));
    const on_read_error = () => this.handleClose(new Error("CDP pipe error"));
    const on_write_error = () => this.handleClose(new Error("CDP pipe write error"));
    this.upstream_pipe_read.on("data", on_data);
    this.upstream_pipe_read.on("end", on_end);
    this.upstream_pipe_read.on("error", on_read_error);
    this.upstream_pipe_write.on("error", on_write_error);
    this.pipe_cleanup = () => {
      this.upstream_pipe_read?.off("data", on_data);
      this.upstream_pipe_read?.off("end", on_end);
      this.upstream_pipe_read?.off("error", on_read_error);
      this.upstream_pipe_write?.off("error", on_write_error);
    };
  }

  async close() {
    const pipe_cleanup = this.pipe_cleanup;
    this.pipe_cleanup = null;
    pipe_cleanup?.();
    try {
      this.upstream_pipe_write?.end();
    } catch {}
    try {
      (this.upstream_pipe_read as { destroy?: () => void } | null)?.destroy?.();
    } catch {}
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
    const pipe_cleanup = this.pipe_cleanup;
    this.pipe_cleanup = null;
    pipe_cleanup?.();
    this.emitClose(error);
  }
}

export { PipeUpstreamTransport };
