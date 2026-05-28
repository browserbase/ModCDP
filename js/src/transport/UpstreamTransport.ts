// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/transport/UpstreamTransport.py
// - ./go/modcdp/transport/UpstreamTransport.go
import type { z } from "zod";
import type { LauncherConfig } from "../launcher/BrowserLauncher.js";
import type { cdp } from "../types/generated/cdp.js";
import type { CdpCommandSchema, CdpNamedSchema } from "../types/generated/zod/helpers.js";
import * as Target from "../types/generated/zod/Target.js";
import type {
  CdpCommandMessage,
  CdpDebuggeeCommandParams,
  CdpEventMessage,
  CdpResponseMessage,
  ModCDPUpstreamConfig,
  ProtocolPayload,
  ProtocolResult,
} from "../types/modcdp.js";
import { CdpEventMessageSchema, CdpResponseMessageSchema, ModCDPUpstreamConfigSchema } from "../types/modcdp.js";
import { modCDPToJSON } from "../types/toJSON.js";

type UpstreamMode = "ws";
type UpstreamTransportConfig = z.input<typeof ModCDPUpstreamConfigSchema>;
type UpstreamTransportBaseConfig = {
  upstream_mode: string;
  upstream_cdp_send_timeout_ms: number;
  upstream_ws_cdp_url?: string;
  upstream_ws_connect_error_settle_timeout_ms?: number;
} & Record<string, unknown>;

type TargetRoute = {
  targetId: cdp.types.ts.Target.TargetID;
  sessionId?: cdp.types.ts.Target.SessionID | null;
};
type UpstreamPeerWaitConfig = { connected_after_ms?: number | null };
type UpstreamPeerKind = "browser_cdp" | "modcdp_server";

type UpstreamEventListener = (
  payload: ProtocolPayload,
  targetId: cdp.types.ts.Target.TargetID | null,
  sessionId: cdp.types.ts.Target.SessionID | null,
) => void;

class UpstreamTransport {
  config: UpstreamTransportBaseConfig;
  // The kind of remote peer this client-side transport talks to. Most
  // transports talk to raw browser CDP. Reverse client transports talk to a
  // ModCDPServer downstream connection and therefore do not use the local
  // AutoSessionRouter bootstrap path.
  peer_kind: UpstreamPeerKind = "browser_cdp";
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

  constructor(config: UpstreamTransportConfig = {}) {
    this.config = ModCDPUpstreamConfigSchema.parse(config);
  }

  async connect() {
    throw new Error(`${this.constructor.name}.connect is not implemented.`);
  }

  update(config: UpstreamTransportConfig | Record<string, unknown> = {}) {
    this.config = ModCDPUpstreamConfigSchema.parse({ ...this.config, ...config });
    return this;
  }

  configForLauncher(): LauncherConfig {
    return {};
  }

  async close() {}

  send(message: CdpCommandMessage): void;
  send(
    method: string,
    params?: ProtocolPayload,
    sessionId?: cdp.types.ts.Target.SessionID | null,
    config?: { timeout_ms?: number | null },
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
    command: CdpCommandMessage | string | CdpCommandSchema<Params, Result, Name>,
    params: ProtocolPayload | z.input<Params> = {},
    route_or_sessionId: TargetRoute | cdp.types.ts.Target.SessionID | null = null,
    config: { timeout_ms?: number | null } = {},
  ): void | Promise<ProtocolResult> | Promise<z.output<Result>> {
    if (typeof command !== "string" && "method" in command) {
      throw new Error(`${this.constructor.name}.send is not implemented.`);
    }
    if (typeof command === "string") {
      const method = command;
      const sessionId = typeof route_or_sessionId === "string" ? route_or_sessionId : null;
      const timeout_ms = config.timeout_ms ?? this.config.upstream_cdp_send_timeout_ms;
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
      return this.send(command.id, command.params.parse(params), route_or_sessionId).then((result) =>
        command.result.parse(result),
      );
    const route = route_or_sessionId && typeof route_or_sessionId === "object" ? route_or_sessionId : undefined;
    if (route && route.sessionId == null) throw new Error(`No CDP session is attached for targetId=${route.targetId}.`);
    return this.send(command.id, command.params.parse(params), route?.sessionId ?? null).then((result) =>
      command.result.parse(result),
    );
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

  async waitForPeer(_config: UpstreamPeerWaitConfig = {}) {}

  toJSON() {
    return modCDPToJSON(this, {
      config: this.config,
      state: {
        pending: this.pending.size,
        recv_listeners: this.recv_listeners.size,
        close_listeners: this.close_listeners.size,
        event_listeners: this.event_listeners.size,
      },
    });
  }
}

function parseHostPort(value: string, defaultHost: string, defaultPort: number) {
  const parsed = new URL(/^[a-z][a-z\d+\-.]*:\/\//i.test(value) ? value : `ws://${value}`);
  const host = parsed.hostname || defaultHost;
  const port = Number(parsed.port || defaultPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error(`Invalid host:port ${value}`);
  return { host, port };
}

export { UpstreamTransport, parseHostPort };
export type {
  UpstreamMode,
  UpstreamTransportBaseConfig,
  UpstreamTransportConfig,
  TargetRoute,
  UpstreamPeerWaitConfig,
  UpstreamPeerKind,
  UpstreamEventListener,
};
