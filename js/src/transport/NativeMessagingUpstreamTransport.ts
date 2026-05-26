import type { z } from "zod";
import type { CdpCommandSchema } from "../types/generated/zod/helpers.js";
import type { CdpCommandMessage, ProtocolPayload, ProtocolResult } from "../types/modcdp.js";
import { UpstreamTransport, type TargetRoute, type UpstreamTransportConfig } from "./UpstreamTransport.js";

export const DEFAULT_UPSTREAM_NATIVEMESSAGING_HOST_NAME = "com.modcdp.bridge";

type NativeMessagingOptions = {
  upstream_nativemessaging_host_name?: string | null;
};

export class NativeMessagingUpstreamTransport extends UpstreamTransport {
  readonly upstream_mode = "nativemessaging" as const;
  readonly endpoint_kind = "modcdp_server" as const;
  declare upstream_nativemessaging_host_name: string;
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private read_native_message: ((chunk: Buffer) => void) | null = null;

  constructor({
    upstream_nativemessaging_host_name = DEFAULT_UPSTREAM_NATIVEMESSAGING_HOST_NAME,
  }: NativeMessagingOptions = {}) {
    super();
    this.upstream_nativemessaging_host_name =
      upstream_nativemessaging_host_name || DEFAULT_UPSTREAM_NATIVEMESSAGING_HOST_NAME;
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
      if (!this.read_native_message)
        throw new Error(`Native messaging stdio is not connected for ${this.upstream_nativemessaging_host_name}.`);
      writeLengthPrefixedJSON(process.stdout, command_or_message_or_method);
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
    if (typeof config.cdp_send_timeout_ms === "number") this.cdp_send_timeout_ms = config.cdp_send_timeout_ms;
    return this;
  }

  getInjectorConfig() {
    return {
      upstream_nativemessaging_host_name: this.upstream_nativemessaging_host_name,
    };
  }

  async connect() {
    if (typeof process !== "object" || !process?.versions?.node) {
      throw new Error("upstream.upstream_mode=nativemessaging requires Node.");
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
      throw new Error(`Native messaging stdio is not connected for ${this.upstream_nativemessaging_host_name}.`);
  }

  async close() {
    if (this.read_native_message) {
      process.stdin.off("data", this.read_native_message);
      this.read_native_message = null;
    }
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
