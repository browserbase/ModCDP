import type { z } from "zod";
import type { cdp } from "../types/generated/cdp.js";
import type { CdpCommandSchema, CdpNamedSchema } from "../types/generated/zod/helpers.js";
import * as Runtime from "../types/generated/zod/Runtime.js";
import * as Target from "../types/generated/zod/Target.js";
import {
  CdpEventMessageSchema,
  CdpResponseMessageSchema,
  type CdpDebuggeeCommandParams,
  type ProtocolParams,
  type ProtocolPayload,
  type ProtocolResult,
} from "../types/modcdp.js";
import type { ServerUpstreamEventListener, ServerUpstreamTransport, TargetRoute } from "./ServerUpstreamTransport.js";

type LoopbackCdpTransportOptions = {
  loopback_cdp_url: string | null;
  cdp_send_timeout_ms: number;
  loopback_execution_context_timeout_ms: number;
  ws_connect_error_settle_timeout_ms: number;
};

const target_auto_attach_params = {
  autoAttach: true,
  waitForDebuggerOnStart: false,
  flatten: true,
} satisfies cdp.types.ts.Target.SetAutoAttachParams;

/**
 * Owns server upstream traffic sent through a loopback CDP WebSocket.
 *
 * This class owns loopback socket lifecycle, request id tracking, pending
 * request rejection, loopback event listener dispatch, loopback execution
 * context waits used by discovery, and loopback endpoint verification. It does
 * not choose ModCDP routes, manage custom command registries, run middleware,
 * publish Stagehand/ModCDP events, or interpret browser-specific semantics
 * beyond the narrow discovery probe needed to verify the current service worker.
 *
 * Lifecycle:
 * 1. The server constructs the transport with current config values.
 * 2. `getTargets()` or `send()` opens the loopback WebSocket and initializes
 *    target auto-attach/discovery once per socket.
 * 3. CDP socket event messages are normalized and dispatched to typed
 *    `on(event, listener)` subscriptions.
 * 4. Socket error/close clears loopback execution-context facts and rejects
 *    pending CDP requests owned by this transport.
 */
export class LoopbackCdpTransport implements ServerUpstreamTransport {
  // Monotonic WebSocket request id for loopback CDP messages. Written only by
  // sendToLoopback; read only when matching WebSocket responses.
  private next_loopback_id = 1;

  // CDP endpoint URL -> open WebSocket. Written by loopbackWS; read by
  // loopbackWS and initializeLoopbackCDP so one socket is reused per endpoint.
  private readonly loopback_sockets = new Map<string, WebSocket>();

  // CDP endpoint URL -> in-flight socket open promise. Written by loopbackWS;
  // read by loopbackWS to coalesce concurrent connection attempts.
  private readonly loopback_socket_promises = new Map<string, Promise<WebSocket>>();

  // Native Target.SessionID -> first Runtime execution context id observed
  // during loopback discovery. Updated by Runtime.executionContextCreated;
  // read by waitForLoopbackExecutionContext.
  private readonly loopback_session_contexts = new Map<string, number>();

  // Native Target.SessionID -> waiters for the first Runtime execution context
  // on that session. Written/read by waitForLoopbackExecutionContext and
  // resolved by Runtime.executionContextCreated.
  private readonly loopback_context_waiters = new Map<string, Set<(contextId: number) => void>>();

  // Sockets that have received Target.setAutoAttach and Target.setDiscoverTargets.
  // Written/read by initializeLoopbackCDP.
  private readonly initialized_loopback_sockets = new WeakSet<WebSocket>();

  // Loopback CDP request id -> pending promise callbacks. Written by
  // sendToLoopback; resolved/rejected by WebSocket response/error/close.
  private readonly loopback_pending = new Map<
    number,
    { resolve: (value: ProtocolResult) => void; reject: (error: Error) => void }
  >();

  // Typed upstream event schema -> subscribers. Written by on; read by
  // emitLoopbackUpstreamEvent from the WebSocket message handler.
  private readonly event_listeners = new Map<CdpNamedSchema<z.ZodType>, Set<ServerUpstreamEventListener>>();

  // Current loopback CDP endpoint owned by this transport instance. Written by
  // discoverLoopbackCDP while probing; read by all loopback CDP sends.
  private loopback_cdp_url: string | null;

  // Request timeout for loopback CDP sends. Set at construction from server
  // config; read by sendToLoopback.
  private readonly cdp_send_timeout_ms: number;

  // Runtime.executionContextCreated wait timeout for discovery. Set at
  // construction from server config; read by waitForLoopbackExecutionContext.
  private readonly loopback_execution_context_timeout_ms: number;

  // Delay used to let websocket close details arrive after an error event. Set
  // at construction from server config; read by loopbackWS.
  private readonly ws_connect_error_settle_timeout_ms: number;

  constructor(options: LoopbackCdpTransportOptions) {
    this.loopback_cdp_url = options.loopback_cdp_url;
    this.cdp_send_timeout_ms = options.cdp_send_timeout_ms;
    this.loopback_execution_context_timeout_ms = options.loopback_execution_context_timeout_ms;
    this.ws_connect_error_settle_timeout_ms = options.ws_connect_error_settle_timeout_ms;
    this.on(Runtime.ExecutionContextCreatedEvent, (event, _targetId, sessionId) => {
      if (sessionId == null) return;
      this.loopback_session_contexts.set(sessionId, event.context.id);
      const waiters = this.loopback_context_waiters.get(sessionId);
      if (!waiters) return;
      this.loopback_context_waiters.delete(sessionId);
      for (const resolve of waiters) resolve(event.context.id);
    });
  }

  /** Resolve an HTTP DevTools endpoint to a WebSocket endpoint, or return an existing WebSocket URL. */
  static async resolveEndpoint(endpoint: string | null) {
    if (!endpoint || /^wss?:\/\//i.test(endpoint)) return endpoint;
    if (!/^https?:\/\//i.test(endpoint)) {
      throw new Error(`loopback_cdp_url must be a ws://, wss://, http://, or https:// CDP endpoint, got ${endpoint}.`);
    }
    const { webSocketDebuggerUrl } = await fetch(`${endpoint}/json/version`).then((r) => r.json());
    if (!webSocketDebuggerUrl) throw new Error(`loopback_cdp_url HTTP discovery returned no webSocketDebuggerUrl.`);
    return webSocketDebuggerUrl;
  }

  /** Register a typed listener for one native CDP event schema. */
  on<Event extends CdpNamedSchema<z.ZodType>>(
    event: Event,
    listener: (
      payload: z.output<Event>,
      targetId: cdp.types.ts.Target.TargetID | null,
      sessionId: cdp.types.ts.Target.SessionID | null,
    ) => void,
  ) {
    const typed_listener: ServerUpstreamEventListener = (payload, targetId, sessionId) => {
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

  /** Return current browser targets through the loopback CDP endpoint. */
  async getTargets() {
    if (!this.loopback_cdp_url) throw new Error(`No loopback_cdp_url configured for Target.getTargets.`);
    await this.initializeLoopbackCDP();
    return (await this.send(Target.GetTargetsCommand, {})).targetInfos;
  }

  /** Resolve a target id from CDP debuggee-shaped params when possible. */
  async resolveTargetId(params: CdpDebuggeeCommandParams) {
    const resolved_debuggee = params.debuggee ?? this.compactDebuggee(params);
    if (resolved_debuggee.targetId) return resolved_debuggee.targetId;
    const chrome_api = globalThis.chrome;
    let resolved_tab_url: string | null = null;
    if (resolved_debuggee.tabId && chrome_api?.tabs?.get) {
      const tab = await chrome_api.tabs.get(resolved_debuggee.tabId).catch((): null => null);
      resolved_tab_url = tab?.url || tab?.pendingUrl || null;
    }
    if (!resolved_tab_url) return null;
    const targetInfos = await this.getTargets();
    return targetInfos.find((target) => target.type === "page" && target.url === resolved_tab_url)?.targetId ?? null;
  }

  /** Create a new page target through loopback CDP. */
  async createTarget(url: string) {
    return (await this.send(Target.CreateTargetCommand, { url })).targetId;
  }

  /** Attach to a target through flattened loopback CDP and return the native session id. */
  async attachToTarget(targetId: cdp.types.ts.Target.TargetID) {
    return (await this.send(Target.AttachToTargetCommand, { targetId, flatten: true })).sessionId;
  }

  /** Detach a native loopback CDP session. */
  async detachFromTarget(sessionId: cdp.types.ts.Target.SessionID) {
    await this.send(Target.DetachFromTargetCommand, { sessionId });
  }

  /** Send one typed CDP command through loopback CDP, optionally scoped to a target route. */
  async send<
    Params extends z.ZodType<Record<string, unknown>>,
    Result extends z.ZodType<Record<string, unknown>>,
    Name extends string,
  >(
    command: CdpCommandSchema<Params, Result, Name>,
    params?: z.input<Params>,
    route: TargetRoute | undefined = undefined,
  ): Promise<z.output<Result>> {
    await this.initializeLoopbackCDP();
    if (!route) return command.result.parse(await this.sendToLoopback(command.id, command.params.parse(params)));
    if (route.sessionId == null)
      throw new Error(`loopback_cdp route for ${command.id} has no session for targetId=${route.targetId}.`);
    await this.sendToLoopback(
      Target.SetAutoAttachCommand.id,
      Target.SetAutoAttachCommand.params.parse(target_auto_attach_params),
      route.sessionId,
    );
    return command.result.parse(await this.sendToLoopback(command.id, command.params.parse(params), route.sessionId));
  }

  /** Verify a local loopback CDP endpoint points at this ModCDP service worker. */
  async discoverLoopbackCDP({
    browserToken,
    serviceWorkerUrl,
  }: {
    browserToken: string | null;
    serviceWorkerUrl: string;
  }): Promise<{ loopback_cdp_url: string | null; verified: boolean; version?: unknown }> {
    if (!browserToken) return { loopback_cdp_url: null as null, verified: false };

    const url = "http://127.0.0.1:9222";
    const previous_loopback_url = this.loopback_cdp_url;
    const fail = (version?: unknown) => {
      this.loopback_cdp_url = previous_loopback_url ?? null;
      return {
        loopback_cdp_url: null as null,
        verified: false,
        ...(version ? { version } : {}),
      };
    };
    try {
      const version = await fetch(`${url}/json/version`).then((response) => response.ok && response.json());
      if (!version?.webSocketDebuggerUrl) return fail();

      this.loopback_cdp_url = version.webSocketDebuggerUrl;
      const { targetInfos } = Target.GetTargetsCommand.result.parse(
        await this.sendToLoopback(Target.GetTargetsCommand.id, Target.GetTargetsCommand.params.parse({})),
      );
      const worker = targetInfos.find((target) => target.type === "service_worker" && target.url === serviceWorkerUrl);
      if (!worker) return fail(version);

      const { sessionId } = Target.AttachToTargetCommand.result.parse(
        await this.sendToLoopback(
          Target.AttachToTargetCommand.id,
          Target.AttachToTargetCommand.params.parse({
            targetId: worker.targetId,
            flatten: true,
          }),
        ),
      );
      const execution_context_ready = this.waitForLoopbackExecutionContext(sessionId);
      await this.sendToLoopback(Runtime.EnableCommand.id, Runtime.EnableCommand.params.parse({}), sessionId);
      const executionContextId = await execution_context_ready;
      const result = Runtime.CallFunctionOnCommand.result.parse(
        await this.sendToLoopback(
          Runtime.CallFunctionOnCommand.id,
          Runtime.CallFunctionOnCommand.params.parse({
            functionDeclaration: `function() { return globalThis.ModCDP?.browser_token === ${JSON.stringify(browserToken)}; }`,
            executionContextId,
            returnByValue: true,
          }),
          sessionId,
        ),
      );
      if (result.result?.value !== true) return fail(version);

      await this.initializeLoopbackCDP();
      return {
        loopback_cdp_url: this.loopback_cdp_url,
        verified: true,
        version,
      };
    } catch {
      return fail();
    }
  }

  private compactDebuggee(input: {
    [Key in keyof chrome.debugger.Debuggee]?: chrome.debugger.Debuggee[Key] | null;
  }): chrome.debugger.Debuggee {
    return {
      ...(typeof input.tabId === "number" ? { tabId: input.tabId } : {}),
      ...(typeof input.targetId === "string" ? { targetId: input.targetId } : {}),
      ...(typeof input.extensionId === "string" ? { extensionId: input.extensionId } : {}),
    };
  }

  private emitLoopbackUpstreamEvent(
    method: string,
    payload: ProtocolPayload,
    sessionId: cdp.types.ts.Target.SessionID | null,
  ) {
    for (const [event, listeners] of this.event_listeners) {
      if (event.id !== method) continue;
      for (const listener of listeners) listener(payload, null, sessionId);
    }
  }

  private async loopbackWS(endpoint: string): Promise<WebSocket> {
    const existing = this.loopback_sockets.get(endpoint);
    if (existing?.readyState === WebSocket.OPEN) return existing;
    const pending = this.loopback_socket_promises.get(endpoint);
    if (pending) return pending;

    const next_socket = this.openCDPSocket(endpoint).then((ws) => {
      this.loopback_sockets.set(endpoint, ws);
      this.loopback_socket_promises.delete(endpoint);
      ws.addEventListener("message", (event) => {
        const msg = JSON.parse(event.data);
        if (!("id" in msg)) {
          const cdp_event = CdpEventMessageSchema.parse(msg);
          this.emitLoopbackUpstreamEvent(
            cdp_event.method,
            (cdp_event.params ?? {}) as ProtocolPayload,
            cdp_event.sessionId ?? null,
          );
          return;
        }
        const response = CdpResponseMessageSchema.parse(msg);
        const pending = this.loopback_pending.get(response.id);
        if (!pending) return;
        this.loopback_pending.delete(response.id);
        if (response.error) pending.reject(new Error(response.error.message));
        else pending.resolve((response.result ?? {}) as ProtocolResult);
      });
      ws.addEventListener("error", () => {
        if (this.loopback_sockets.get(endpoint) === ws) this.loopback_sockets.delete(endpoint);
        this.loopback_session_contexts.clear();
        this.rejectLoopbackPending(new Error(`CDP socket error ${endpoint}`));
      });
      ws.addEventListener("close", (event) => {
        if (this.loopback_sockets.get(endpoint) === ws) this.loopback_sockets.delete(endpoint);
        this.loopback_session_contexts.clear();
        this.rejectLoopbackPending(
          new Error(
            `CDP socket closed ${endpoint} close.code=${event.code} close.reason=${event.reason || ""} close.wasClean=${
              event.wasClean
            }`,
          ),
        );
      });
      return ws;
    });
    this.loopback_socket_promises.set(endpoint, next_socket);
    return next_socket;
  }

  private async openCDPSocket(endpoint: string): Promise<WebSocket> {
    if (!/^wss?:\/\//i.test(endpoint)) {
      throw new Error(`loopback_cdp_url must be a ws:// or wss:// CDP websocket URL, got ${endpoint}.`);
    }
    return new Promise<WebSocket>((resolve, reject) => {
      const w = new WebSocket(endpoint);
      let settled = false;
      let error_event: Event | null = null;
      const describe = (prefix: string, closeEvent?: CloseEvent) => {
        const parts = [`${prefix} ${endpoint}`, `readyState=${w.readyState}`];
        if (error_event) parts.push(`error.type=${error_event.type}`);
        if (closeEvent) {
          parts.push(`close.code=${closeEvent.code}`);
          parts.push(`close.reason=${closeEvent.reason || ""}`);
          parts.push(`close.wasClean=${closeEvent.wasClean}`);
        }
        return parts.join(" ");
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      w.addEventListener(
        "open",
        () => {
          if (settled) return;
          settled = true;
          resolve(w);
        },
        { once: true },
      );
      w.addEventListener(
        "error",
        (event) => {
          error_event = event;
          setTimeout(() => fail(new Error(describe("CDP socket error"))), this.ws_connect_error_settle_timeout_ms);
        },
        { once: true },
      );
      w.addEventListener("close", (event) => fail(new Error(describe("CDP socket closed", event))), { once: true });
    });
  }

  private async sendToLoopback(method: string, params: ProtocolParams = {}, sessionId: string | null = null) {
    const endpoint = this.loopback_cdp_url;
    if (!endpoint) throw new Error(`No loopback_cdp_url configured for ${method}.`);
    const ws = await this.loopbackWS(endpoint);
    const id = this.next_loopback_id++;
    const message: {
      id: number;
      method: string;
      params: ProtocolParams;
      sessionId?: string;
    } = {
      id,
      method,
      params,
    };
    if (sessionId) message.sessionId = sessionId;
    ws.send(JSON.stringify(message));
    return new Promise<ProtocolResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.loopback_pending.delete(id)) return;
        reject(new Error(`${method} timed out after ${this.cdp_send_timeout_ms}ms`));
      }, this.cdp_send_timeout_ms);
      this.loopback_pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });
  }

  private async initializeLoopbackCDP() {
    const endpoint = this.loopback_cdp_url;
    if (!endpoint) return;
    const ws = await this.loopbackWS(endpoint);
    if (this.initialized_loopback_sockets.has(ws)) return;
    await this.sendToLoopback(
      Target.SetAutoAttachCommand.id,
      Target.SetAutoAttachCommand.params.parse(target_auto_attach_params),
    );
    await this.sendToLoopback(
      Target.SetDiscoverTargetsCommand.id,
      Target.SetDiscoverTargetsCommand.params.parse({ discover: true }),
    );
    this.initialized_loopback_sockets.add(ws);
  }

  private waitForLoopbackExecutionContext(sessionId: string, timeout_ms = this.loopback_execution_context_timeout_ms) {
    const existing = this.loopback_session_contexts.get(sessionId);
    if (existing != null) return Promise.resolve(existing);
    return new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const waiters = this.loopback_context_waiters.get(sessionId);
        waiters?.delete(complete);
        if (waiters?.size === 0) this.loopback_context_waiters.delete(sessionId);
        reject(new Error(`Timed out waiting for Runtime.executionContextCreated for session ${sessionId}.`));
      }, timeout_ms);
      const complete = (contextId: number) => {
        clearTimeout(timeout);
        resolve(contextId);
      };
      const waiters = this.loopback_context_waiters.get(sessionId);
      if (waiters) waiters.add(complete);
      else this.loopback_context_waiters.set(sessionId, new Set([complete]));
    });
  }

  private rejectLoopbackPending(error: Error) {
    for (const pending of this.loopback_pending.values()) pending.reject(error);
    this.loopback_pending.clear();
  }
}
