import type { z } from "zod";
import type { LauncherOptions } from "../launcher/BrowserLauncher.js";
import type { cdp } from "../types/generated/cdp.js";
import type { CdpCommandSchema, CdpNamedSchema } from "../types/generated/zod/helpers.js";
import * as Target from "../types/generated/zod/Target.js";
import type {
  CdpCommandMessage,
  CdpDebuggeeCommandParams,
  CdpEventMessage,
  CdpResponseMessage,
  ProtocolPayload,
  ProtocolResult,
} from "../types/modcdp.js";
import { CdpEventMessageSchema, CdpResponseMessageSchema } from "../types/modcdp.js";

type UpstreamMode =
  | "ws" // connect via CDP WebSocket over TCP (default, used by normal CDP, loopback CDP)
  | "pipe" // connect via CDP over stdio pipe (used by local chrome with --remote-debugging-pipe CLI arg)
  | "nativemessaging" // connect via Native Messaging Host IPC (chrome -> sdk via hardcoded IPC paths)
  | "reversews" // connect via revers WebSocket (chrome -> sdk via hardcoded listening port)
  | "nats" // connect via NATS messaging (chrome -> NATS -> sdk via hardcoded NATS localhost:port relay)
  | "chromedebugger"; // connect via CDP over Extension API chrome.debugger to pages (Browser.* methods not supported, only page-scoped methods allowed, not recommended for production)
type UpstreamNatsRole = "client" | "browser";
type UpstreamTransportOptions = {
  upstream_mode?: UpstreamMode;
  upstream_ws_cdp_url?: string | null;
  upstream_pipe_read?: NodeJS.ReadableStream | null;
  upstream_pipe_write?: NodeJS.WritableStream | null;
  upstream_nats_url?: string | null;
  upstream_nats_subject_prefix?: string | null;
  upstream_nats_role?: UpstreamNatsRole | null;
  upstream_nats_wait_timeout_ms?: number | null;
  upstream_reversews_bind?: string | null;
  upstream_reversews_wait_timeout_ms?: number | null;
  upstream_nativemessaging_host_name?: string | null;
  upstream_ws_connect_error_settle_timeout_ms?: number | null;
  upstream_cdp_send_timeout_ms?: number | null;
};

type TargetRoute = {
  targetId: cdp.types.ts.Target.TargetID;
  sessionId?: cdp.types.ts.Target.SessionID | null;
};

type UpstreamEventListener = (
  payload: ProtocolPayload,
  targetId: cdp.types.ts.Target.TargetID | null,
  sessionId: cdp.types.ts.Target.SessionID | null,
) => void;

class UpstreamTransport {
  readonly upstream_mode: UpstreamMode;
  upstream_ws_cdp_url?: string | null = null;
  upstream_nats_url?: string | null = null;
  upstream_nats_subject_prefix?: string | null = null;
  upstream_nats_wait_timeout_ms?: number | null = null;
  upstream_reversews_bind?: string | null = null;
  upstream_reversews_wait_timeout_ms?: number | null = null;
  upstream_nativemessaging_host_name?: string | null = null;
  upstream_ws_connect_error_settle_timeout_ms?: number | null = null;
  upstream_cdp_send_timeout_ms = 10_000;
  private next_id = 1;
  private pending = new Map<
    number,
    {
      method: string;
      resolve: (value: ProtocolResult) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout> | null;
    }
  >();
  private recv_listeners = new Set<(message: CdpResponseMessage | CdpEventMessage) => void>();
  private close_listeners = new Set<(error: Error) => void>();
  private event_listeners = new Map<CdpNamedSchema<z.ZodType>, Set<UpstreamEventListener>>();

  constructor(options: UpstreamTransportOptions = {}) {
    this.upstream_mode = options.upstream_mode ?? "ws";
    this.upstream_ws_cdp_url = options.upstream_ws_cdp_url ?? null;
    this.upstream_nats_url = options.upstream_nats_url ?? null;
    this.upstream_nats_subject_prefix = options.upstream_nats_subject_prefix ?? null;
    this.upstream_nats_wait_timeout_ms = options.upstream_nats_wait_timeout_ms ?? null;
    this.upstream_reversews_bind = options.upstream_reversews_bind ?? null;
    this.upstream_reversews_wait_timeout_ms = options.upstream_reversews_wait_timeout_ms ?? null;
    this.upstream_nativemessaging_host_name = options.upstream_nativemessaging_host_name ?? null;
    this.upstream_ws_connect_error_settle_timeout_ms = options.upstream_ws_connect_error_settle_timeout_ms ?? null;
    this.upstream_cdp_send_timeout_ms = options.upstream_cdp_send_timeout_ms ?? 10_000;
  }

  async connect() {
    throw new Error(`${this.constructor.name}.connect is not implemented.`);
  }

  update(config: UpstreamTransportOptions = {}) {
    this.upstream_ws_cdp_url = config.upstream_ws_cdp_url ?? this.upstream_ws_cdp_url;
    this.upstream_nats_url = config.upstream_nats_url ?? this.upstream_nats_url;
    this.upstream_nats_subject_prefix = config.upstream_nats_subject_prefix ?? this.upstream_nats_subject_prefix;
    this.upstream_nats_wait_timeout_ms = config.upstream_nats_wait_timeout_ms ?? this.upstream_nats_wait_timeout_ms;
    this.upstream_reversews_bind = config.upstream_reversews_bind ?? this.upstream_reversews_bind;
    this.upstream_reversews_wait_timeout_ms =
      config.upstream_reversews_wait_timeout_ms ?? this.upstream_reversews_wait_timeout_ms;
    this.upstream_nativemessaging_host_name =
      config.upstream_nativemessaging_host_name ?? this.upstream_nativemessaging_host_name;
    this.upstream_ws_connect_error_settle_timeout_ms =
      config.upstream_ws_connect_error_settle_timeout_ms ?? this.upstream_ws_connect_error_settle_timeout_ms;
    this.upstream_cdp_send_timeout_ms = config.upstream_cdp_send_timeout_ms ?? this.upstream_cdp_send_timeout_ms;
    return this;
  }

  configForLauncher(): LauncherOptions {
    return {};
  }

  async close() {}

  send(message: CdpCommandMessage): void;
  send(
    method: string,
    params?: ProtocolPayload,
    sessionId?: cdp.types.ts.Target.SessionID | null,
    options?: { timeout_ms?: number | null },
  ): Promise<ProtocolResult>;
  send<
    Params extends z.ZodType<Record<string, unknown>>,
    Result extends z.ZodType<Record<string, unknown>>,
    Name extends string,
  >(
    command: CdpCommandSchema<Params, Result, Name>,
    params?: z.input<Params>,
    route?: TargetRoute | string | null,
  ): Promise<z.output<Result>>;
  send<
    Params extends z.ZodType<Record<string, unknown>>,
    Result extends z.ZodType<Record<string, unknown>>,
    Name extends string,
  >(
    command_or_message_or_method: CdpCommandMessage | string | CdpCommandSchema<Params, Result, Name>,
    params: ProtocolPayload | z.input<Params> = {},
    route_or_sessionId: TargetRoute | cdp.types.ts.Target.SessionID | null = null,
    options: { timeout_ms?: number | null } = {},
  ): void | Promise<ProtocolResult> | Promise<z.output<Result>> {
    if (typeof command_or_message_or_method !== "string" && "method" in command_or_message_or_method) {
      throw new Error(`${this.constructor.name}.send is not implemented.`);
    }
    if (typeof command_or_message_or_method === "string") {
      const method = command_or_message_or_method;
      const sessionId = typeof route_or_sessionId === "string" ? route_or_sessionId : null;
      const timeout_ms = options.timeout_ms ?? this.upstream_cdp_send_timeout_ms;
      const id = this.next_id++;
      const message: CdpCommandMessage = {
        id,
        method,
        params: params as ProtocolPayload,
      };
      if (sessionId) message.sessionId = sessionId;
      return new Promise((resolve, reject) => {
        const timeout =
          timeout_ms != null && timeout_ms > 0
            ? setTimeout(() => {
                if (!this.pending.delete(id)) return;
                reject(new Error(`${method} timed out after ${timeout_ms}ms`));
              }, timeout_ms)
            : null;
        this.pending.set(id, { method, resolve, reject, timeout });
        try {
          this.send(message);
        } catch (error) {
          const pending = this.pending.get(id);
          if (!pending) return;
          this.pending.delete(id);
          if (pending.timeout) clearTimeout(pending.timeout);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    }
    if (typeof route_or_sessionId === "string")
      return this.send(
        command_or_message_or_method.id,
        command_or_message_or_method.params.parse(params),
        route_or_sessionId,
      ).then((result) => command_or_message_or_method.result.parse(result));
    const route = route_or_sessionId && typeof route_or_sessionId === "object" ? route_or_sessionId : undefined;
    if (route && route.sessionId == null) throw new Error(`No CDP session is attached for targetId=${route.targetId}.`);
    return this.send(
      command_or_message_or_method.id,
      command_or_message_or_method.params.parse(params),
      route?.sessionId ?? null,
    ).then((result) => command_or_message_or_method.result.parse(result));
  }

  on<Event extends CdpNamedSchema<z.ZodType>>(
    event: Event,
    listener: (
      payload: z.output<Event>,
      targetId: cdp.types.ts.Target.TargetID | null,
      sessionId: cdp.types.ts.Target.SessionID | null,
    ) => void,
  ) {
    const typed_listener: UpstreamEventListener = (payload, targetId, sessionId) => {
      listener(event.parse(payload), targetId, sessionId);
    };
    const listeners = this.event_listeners.get(event);
    if (listeners) listeners.add(typed_listener);
    else this.event_listeners.set(event, new Set([typed_listener]));
    return {
      remove: () => {
        const current_listeners = this.event_listeners.get(event);
        current_listeners?.delete(typed_listener);
        if (current_listeners?.size === 0) this.event_listeners.delete(event);
      },
    };
  }

  async getTargets() {
    return (await this.send(Target.GetTargetsCommand, {})).targetInfos;
  }

  async resolveTargetId(params: CdpDebuggeeCommandParams) {
    return typeof params.targetId === "string" && params.targetId.length > 0 ? params.targetId : null;
  }

  async createTarget(url: string) {
    return (await this.send(Target.CreateTargetCommand, { url })).targetId;
  }

  async attachToTarget(targetId: cdp.types.ts.Target.TargetID) {
    return (await this.send(Target.AttachToTargetCommand, { targetId, flatten: true })).sessionId;
  }

  async detachFromTarget(sessionId: cdp.types.ts.Target.SessionID) {
    await this.send(Target.DetachFromTargetCommand, { sessionId });
  }

  onRecv(listener: (message: CdpResponseMessage | CdpEventMessage) => void) {
    this.recv_listeners.add(listener);
    return () => this.recv_listeners.delete(listener);
  }

  onClose(listener: (error: Error) => void) {
    this.close_listeners.add(listener);
    return () => this.close_listeners.delete(listener);
  }

  protected emitRecv(message: CdpResponseMessage | CdpEventMessage) {
    for (const listener of this.recv_listeners) listener(message);
  }

  protected emitClose(error: Error) {
    for (const pending of this.pending.values()) {
      if (pending.timeout) clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    for (const listener of this.close_listeners) listener(error);
  }

  protected parseAndEmitRecv(data: unknown) {
    const parsed = JSON.parse(typeof data === "string" ? data : String(data));
    if ("id" in parsed) {
      const response = CdpResponseMessageSchema.parse(parsed);
      const pending = this.pending.get(response.id);
      if (pending) {
        this.pending.delete(response.id);
        if (pending.timeout) clearTimeout(pending.timeout);
        if (response.error) pending.reject(new Error(response.error.message));
        else pending.resolve((response.result ?? {}) as ProtocolResult);
      }
      this.emitRecv(response);
      return;
    }
    const event = CdpEventMessageSchema.parse(parsed);
    const payload = (event.params ?? {}) as ProtocolPayload;
    this.emitUpstreamEvent(event.method, payload, null, event.sessionId ?? null);
    this.emitRecv(event);
  }

  protected emitUpstreamEvent(
    method: string,
    payload: ProtocolPayload,
    targetId: cdp.types.ts.Target.TargetID | null,
    sessionId: cdp.types.ts.Target.SessionID | null,
  ) {
    for (const [upstream_event, listeners] of this.event_listeners) {
      if (upstream_event.id !== method) continue;
      for (const listener of listeners) listener(payload, targetId, sessionId);
    }
  }

  async waitForPeer() {}
}

function parseHostPort(value: string, defaultHost: string, defaultPort: number) {
  const parsed = new URL(/^[a-z][a-z\d+\-.]*:\/\//i.test(value) ? value : `ws://${value}`);
  const host = parsed.hostname || defaultHost;
  const port = Number(parsed.port || defaultPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error(`Invalid host:port ${value}`);
  return { host, port };
}

export { UpstreamTransport, parseHostPort };
export type { UpstreamMode, UpstreamNatsRole, UpstreamTransportOptions, TargetRoute, UpstreamEventListener };
