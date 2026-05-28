// MODCDP_TS_ONLY: DO NOT TRANSLATE THIS FILE TO OTHER LANGUAGES.
// Reason: not needed by Stagehand (exotic transport).
import { z } from "zod";
import type { CdpCommandSchema } from "../types/generated/zod/helpers.js";
import type { CdpCommandMessage, ProtocolPayload, ProtocolResult } from "../types/modcdp.js";
import { DEFAULT_CLIENT_CDP_SEND_TIMEOUT_MS } from "../types/modcdp.js";
import { UpstreamTransport, type TargetRoute } from "./UpstreamTransport.js";

const DEFAULT_UPSTREAM_NATIVEMESSAGING_HOST_NAME = "com.modcdp.bridge";

const NativeMessagingUpstreamTransportConfigSchema = z.object({
  upstream_mode: z.literal("nativemessaging").default("nativemessaging"),
  upstream_nativemessaging_host_name: z.string().default(DEFAULT_UPSTREAM_NATIVEMESSAGING_HOST_NAME),
  upstream_cdp_send_timeout_ms: z.number().positive().default(DEFAULT_CLIENT_CDP_SEND_TIMEOUT_MS),
});
type NativeMessagingUpstreamTransportConfig = z.infer<typeof NativeMessagingUpstreamTransportConfigSchema>;

class NativeMessagingUpstreamTransport extends UpstreamTransport {
  declare config: NativeMessagingUpstreamTransportConfig;
  override peer_kind = "modcdp_server" as const;
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private read_native_message: ((chunk: Buffer) => void) | null = null;

  constructor(config: z.input<typeof NativeMessagingUpstreamTransportConfigSchema> = {}) {
    super();
    this.config = NativeMessagingUpstreamTransportConfigSchema.parse({ ...config, upstream_mode: "nativemessaging" });
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
      if (!this.read_native_message)
        throw new Error(
          `Native messaging stdio is not connected for ${this.config.upstream_nativemessaging_host_name}.`,
        );
      writeLengthPrefixedJSON(process.stdout, command);
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
    this.config = NativeMessagingUpstreamTransportConfigSchema.parse({
      ...this.config,
      ...config,
      upstream_mode: "nativemessaging",
    });
    return this;
  }

  async connect() {
    if (typeof process !== "object" || !process?.versions?.node) {
      throw new Error("upstream_mode=nativemessaging requires Node.");
    }
    if (this.read_native_message) return;
    this.read_native_message = (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.buffer = readLengthPrefixedJSON(this.buffer, (message) => {
        this.parseAndEmitRecv(JSON.stringify(message));
      });
    };
    process.stdin.on("data", this.read_native_message);
    process.stdin.on("end", () => this.emitClose(new Error("Native messaging stdin closed")));
    process.stdin.on("error", () => this.emitClose(new Error("Native messaging stdin error")));
  }

  async waitForPeer() {
    if (!this.read_native_message)
      throw new Error(`Native messaging stdio is not connected for ${this.config.upstream_nativemessaging_host_name}.`);
  }

  async close() {
    if (this.read_native_message) {
      process.stdin.off("data", this.read_native_message);
      this.read_native_message = null;
    }
  }

  override toJSON() {
    const json = super.toJSON();
    return {
      ...json,
      state: { ...json.state, connected: this.read_native_message != null, buffered_bytes: this.buffer.length },
    };
  }
}

function writeLengthPrefixedJSON(stream: { write: (chunk: Buffer) => void }, message: unknown) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  stream.write(Buffer.concat([header, body]));
}

function readLengthPrefixedJSON(buffer: Buffer<ArrayBufferLike>, onRecv: (message: unknown) => void) {
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (buffer.length < length + 4) return buffer;
    const body = buffer.subarray(4, 4 + length);
    buffer = buffer.subarray(4 + length);
    onRecv(JSON.parse(body.toString("utf8")));
  }
  return buffer;
}

export {
  DEFAULT_UPSTREAM_NATIVEMESSAGING_HOST_NAME,
  NativeMessagingUpstreamTransport,
  NativeMessagingUpstreamTransportConfigSchema,
};
export type { NativeMessagingUpstreamTransportConfig };
