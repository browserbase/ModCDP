// MODCDP_TS_ONLY: DO NOT TRANSLATE THIS FILE TO OTHER LANGUAGES.
// Reason: not needed by Stagehand (exotic transport).
import { z } from "zod";
import type { LauncherConfig } from "../launcher/BrowserLauncher.js";
import type { CdpCommandSchema } from "../types/generated/zod/helpers.js";
import type { CdpCommandMessage, ProtocolPayload, ProtocolResult } from "../types/modcdp.js";
import { DEFAULT_CLIENT_CDP_SEND_TIMEOUT_MS } from "../types/modcdp.js";
import { UpstreamTransport, type TargetRoute } from "./UpstreamTransport.js";

const PipeUpstreamTransportConfigSchema = z.object({
  upstream_mode: z.literal("pipe").default("pipe"),
  upstream_pipe_read: z.custom<NodeJS.ReadableStream>().optional(),
  upstream_pipe_write: z.custom<NodeJS.WritableStream>().optional(),
  upstream_cdp_send_timeout_ms: z.number().positive().default(DEFAULT_CLIENT_CDP_SEND_TIMEOUT_MS),
});
type PipeUpstreamTransportConfig = z.infer<typeof PipeUpstreamTransportConfigSchema>;

class PipeUpstreamTransport extends UpstreamTransport {
  declare config: PipeUpstreamTransportConfig;
  private buffer = "";
  private pipe_cleanup: (() => void) | null = null;

  constructor(config: z.input<typeof PipeUpstreamTransportConfigSchema> = {}) {
    super();
    this.config = PipeUpstreamTransportConfigSchema.parse({ ...config, upstream_mode: "pipe" });
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
      if (!this.config.upstream_pipe_write || !this.pipe_cleanup) throw new Error("CDP pipe is not connected.");
      this.config.upstream_pipe_write.write(`${JSON.stringify(command)}\0`);
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
    this.config = PipeUpstreamTransportConfigSchema.parse({ ...this.config, ...config, upstream_mode: "pipe" });
    return this;
  }

  override configForLauncher(): LauncherConfig {
    return { launcher_local_cdp_transport: "pipe" } as unknown as LauncherConfig;
  }

  async connect() {
    if (!this.config.upstream_pipe_read || !this.config.upstream_pipe_write) {
      throw new Error("upstream_mode=pipe requires launcher-provided CDP pipe handles.");
    }
    if (this.pipe_cleanup) return;
    const on_data = (chunk: Buffer | string) => this.read(chunk);
    const on_end = () => this.handleClose(new Error("CDP pipe closed"));
    const on_read_error = () => this.handleClose(new Error("CDP pipe error"));
    const on_write_error = () => this.handleClose(new Error("CDP pipe write error"));
    this.config.upstream_pipe_read.on("data", on_data);
    this.config.upstream_pipe_read.on("end", on_end);
    this.config.upstream_pipe_read.on("error", on_read_error);
    this.config.upstream_pipe_write.on("error", on_write_error);
    this.pipe_cleanup = () => {
      this.config.upstream_pipe_read?.off("data", on_data);
      this.config.upstream_pipe_read?.off("end", on_end);
      this.config.upstream_pipe_read?.off("error", on_read_error);
      this.config.upstream_pipe_write?.off("error", on_write_error);
    };
  }

  async close() {
    const pipe_cleanup = this.pipe_cleanup;
    this.pipe_cleanup = null;
    pipe_cleanup?.();
    try {
      this.config.upstream_pipe_write?.end();
    } catch {}
    try {
      (this.config.upstream_pipe_read as { destroy?: () => void } | undefined)?.destroy?.();
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

  override toJSON() {
    const json = super.toJSON();
    return {
      ...json,
      state: { ...json.state, connected: this.pipe_cleanup != null, buffered_bytes: this.buffer.length },
    };
  }
}

export { PipeUpstreamTransport, PipeUpstreamTransportConfigSchema };
export type { PipeUpstreamTransportConfig };
