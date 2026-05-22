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
  getLoopbackCdpUrl: () => string | null;
  setLoopbackCdpUrl: (url: string | null) => void;
  getCdpSendTimeoutMs: () => number;
  getExecutionContextTimeoutMs: () => number;
  getWsConnectErrorSettleTimeoutMs: () => number;
};

const targetAutoAttachParams = {
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
 * publish Stagehand/ModCDP events, or interpret topology beyond the narrow
 * discovery probe needed to verify the current service worker.
 *
 * Lifecycle:
 * 1. The server constructs the transport with config accessors.
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
  private nextLoopbackId = 1;

  // CDP endpoint URL -> open WebSocket. Written by loopbackWS; read by
  // loopbackWS and initializeLoopbackCDP so one socket is reused per endpoint.
  private readonly loopbackSockets = new Map<string, WebSocket>();

  // CDP endpoint URL -> in-flight socket open promise. Written by loopbackWS;
  // read by loopbackWS to coalesce concurrent connection attempts.
  private readonly loopbackSocketPromises = new Map<string, Promise<WebSocket>>();

  // Native Target.SessionID -> first Runtime execution context id observed
  // during loopback discovery. Updated by Runtime.executionContextCreated;
  // read by waitForLoopbackExecutionContext.
  private readonly loopbackSessionContexts = new Map<string, number>();

  // Native Target.SessionID -> waiters for the first Runtime execution context
  // on that session. Written/read by waitForLoopbackExecutionContext and
  // resolved by Runtime.executionContextCreated.
  private readonly loopbackContextWaiters = new Map<string, Set<(contextId: number) => void>>();

  // Sockets that have received Target.setAutoAttach and Target.setDiscoverTargets.
  // Written/read by initializeLoopbackCDP.
  private readonly initializedLoopbackSockets = new WeakSet<WebSocket>();

  // Loopback CDP request id -> pending promise callbacks. Written by
  // sendToLoopback; resolved/rejected by WebSocket response/error/close.
  private readonly loopbackPending = new Map<
    number,
    { resolve: (value: ProtocolResult) => void; reject: (error: Error) => void }
  >();

  // Typed upstream event schema -> subscribers. Written by on; read by
  // emitLoopbackUpstreamEvent from the WebSocket message handler.
  private readonly event_listeners = new Map<CdpNamedSchema<z.ZodType>, Set<ServerUpstreamEventListener>>();

  // Runtime/config accessors owned by ModCDPServer. Read whenever a command or
  // socket operation needs current config values.
  private readonly getLoopbackCdpUrl: LoopbackCdpTransportOptions["getLoopbackCdpUrl"];
  private readonly setLoopbackCdpUrl: LoopbackCdpTransportOptions["setLoopbackCdpUrl"];
  private readonly getCdpSendTimeoutMs: LoopbackCdpTransportOptions["getCdpSendTimeoutMs"];
  private readonly getExecutionContextTimeoutMs: LoopbackCdpTransportOptions["getExecutionContextTimeoutMs"];
  private readonly getWsConnectErrorSettleTimeoutMs: LoopbackCdpTransportOptions["getWsConnectErrorSettleTimeoutMs"];

  constructor(options: LoopbackCdpTransportOptions) {
    this.getLoopbackCdpUrl = options.getLoopbackCdpUrl;
    this.setLoopbackCdpUrl = options.setLoopbackCdpUrl;
    this.getCdpSendTimeoutMs = options.getCdpSendTimeoutMs;
    this.getExecutionContextTimeoutMs = options.getExecutionContextTimeoutMs;
    this.getWsConnectErrorSettleTimeoutMs = options.getWsConnectErrorSettleTimeoutMs;
    this.on(Runtime.ExecutionContextCreatedEvent, (event, _targetId, sessionId) => {
      if (sessionId == null) return;
      this.loopbackSessionContexts.set(sessionId, event.context.id);
      const waiters = this.loopbackContextWaiters.get(sessionId);
      if (!waiters) return;
      this.loopbackContextWaiters.delete(sessionId);
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
    if (!this.getLoopbackCdpUrl()) throw new Error(`No loopback_cdp_url configured for Target.getTargets.`);
    await this.initializeLoopbackCDP();
    return (await this.send(Target.GetTargetsCommand, {})).targetInfos;
  }

  /** Resolve a target id from CDP debuggee-shaped params when possible. */
  async resolveTargetId(params: CdpDebuggeeCommandParams) {
    const resolvedDebuggee = params.debuggee ?? this.compactDebuggee(params);
    if (resolvedDebuggee.targetId) return resolvedDebuggee.targetId;
    const chromeApi = globalThis.chrome;
    let resolvedTabUrl: string | null = null;
    if (resolvedDebuggee.tabId && chromeApi?.tabs?.get) {
      const tab = await chromeApi.tabs.get(resolvedDebuggee.tabId).catch((): null => null);
      resolvedTabUrl = tab?.url || tab?.pendingUrl || null;
    }
    if (!resolvedTabUrl) return null;
    const targetInfos = await this.getTargets();
    return targetInfos.find((target) => target.type === "page" && target.url === resolvedTabUrl)?.targetId ?? null;
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
      Target.SetAutoAttachCommand.params.parse(targetAutoAttachParams),
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
    const previousLoopbackUrl = this.getLoopbackCdpUrl();
    const fail = (version?: unknown) => {
      this.setLoopbackCdpUrl(previousLoopbackUrl ?? null);
      return {
        loopback_cdp_url: null as null,
        verified: false,
        ...(version ? { version } : {}),
      };
    };
    try {
      const version = await fetch(`${url}/json/version`).then((response) => response.ok && response.json());
      if (!version?.webSocketDebuggerUrl) return fail();

      this.setLoopbackCdpUrl(version.webSocketDebuggerUrl);
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
      const contextIdPromise = this.waitForLoopbackExecutionContext(sessionId);
      await this.sendToLoopback(Runtime.EnableCommand.id, Runtime.EnableCommand.params.parse({}), sessionId);
      const executionContextId = await contextIdPromise;
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
        loopback_cdp_url: this.getLoopbackCdpUrl(),
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
    const existing = this.loopbackSockets.get(endpoint);
    if (existing?.readyState === WebSocket.OPEN) return existing;
    const pending = this.loopbackSocketPromises.get(endpoint);
    if (pending) return pending;

    const nextSocket = this.openCDPSocket(endpoint).then((ws) => {
      this.loopbackSockets.set(endpoint, ws);
      this.loopbackSocketPromises.delete(endpoint);
      ws.addEventListener("message", (event) => {
        const msg = JSON.parse(event.data);
        if (!("id" in msg)) {
          const cdpEvent = CdpEventMessageSchema.parse(msg);
          this.emitLoopbackUpstreamEvent(
            cdpEvent.method,
            (cdpEvent.params ?? {}) as ProtocolPayload,
            cdpEvent.sessionId ?? null,
          );
          return;
        }
        const response = CdpResponseMessageSchema.parse(msg);
        const pending = this.loopbackPending.get(response.id);
        if (!pending) return;
        this.loopbackPending.delete(response.id);
        if (response.error) pending.reject(new Error(response.error.message));
        else pending.resolve((response.result ?? {}) as ProtocolResult);
      });
      ws.addEventListener("error", () => {
        if (this.loopbackSockets.get(endpoint) === ws) this.loopbackSockets.delete(endpoint);
        this.loopbackSessionContexts.clear();
        this.rejectLoopbackPending(new Error(`CDP socket error ${endpoint}`));
      });
      ws.addEventListener("close", (event) => {
        if (this.loopbackSockets.get(endpoint) === ws) this.loopbackSockets.delete(endpoint);
        this.loopbackSessionContexts.clear();
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
    this.loopbackSocketPromises.set(endpoint, nextSocket);
    return nextSocket;
  }

  private async openCDPSocket(endpoint: string): Promise<WebSocket> {
    if (!/^wss?:\/\//i.test(endpoint)) {
      throw new Error(`loopback_cdp_url must be a ws:// or wss:// CDP websocket URL, got ${endpoint}.`);
    }
    return new Promise<WebSocket>((resolve, reject) => {
      const w = new WebSocket(endpoint);
      let settled = false;
      let errorEvent: Event | null = null;
      const describe = (prefix: string, closeEvent?: CloseEvent) => {
        const parts = [`${prefix} ${endpoint}`, `readyState=${w.readyState}`];
        if (errorEvent) parts.push(`error.type=${errorEvent.type}`);
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
          errorEvent = event;
          setTimeout(() => fail(new Error(describe("CDP socket error"))), this.getWsConnectErrorSettleTimeoutMs());
        },
        { once: true },
      );
      w.addEventListener("close", (event) => fail(new Error(describe("CDP socket closed", event))), { once: true });
    });
  }

  private async sendToLoopback(method: string, params: ProtocolParams = {}, sessionId: string | null = null) {
    const endpoint = this.getLoopbackCdpUrl();
    if (!endpoint) throw new Error(`No loopback_cdp_url configured for ${method}.`);
    const ws = await this.loopbackWS(endpoint);
    const id = this.nextLoopbackId++;
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
        if (!this.loopbackPending.delete(id)) return;
        reject(new Error(`${method} timed out after ${this.getCdpSendTimeoutMs()}ms`));
      }, this.getCdpSendTimeoutMs());
      this.loopbackPending.set(id, {
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
    const endpoint = this.getLoopbackCdpUrl();
    if (!endpoint) return;
    const ws = await this.loopbackWS(endpoint);
    if (this.initializedLoopbackSockets.has(ws)) return;
    await this.sendToLoopback(
      Target.SetAutoAttachCommand.id,
      Target.SetAutoAttachCommand.params.parse(targetAutoAttachParams),
    );
    await this.sendToLoopback(
      Target.SetDiscoverTargetsCommand.id,
      Target.SetDiscoverTargetsCommand.params.parse({ discover: true }),
    );
    this.initializedLoopbackSockets.add(ws);
  }

  private waitForLoopbackExecutionContext(sessionId: string, timeoutMs = this.getExecutionContextTimeoutMs()) {
    const existing = this.loopbackSessionContexts.get(sessionId);
    if (existing != null) return Promise.resolve(existing);
    return new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const waiters = this.loopbackContextWaiters.get(sessionId);
        waiters?.delete(complete);
        if (waiters?.size === 0) this.loopbackContextWaiters.delete(sessionId);
        reject(new Error(`Timed out waiting for Runtime.executionContextCreated for session ${sessionId}.`));
      }, timeoutMs);
      const complete = (contextId: number) => {
        clearTimeout(timeout);
        resolve(contextId);
      };
      const waiters = this.loopbackContextWaiters.get(sessionId);
      if (waiters) waiters.add(complete);
      else this.loopbackContextWaiters.set(sessionId, new Set([complete]));
    });
  }

  private rejectLoopbackPending(error: Error) {
    for (const pending of this.loopbackPending.values()) pending.reject(error);
    this.loopbackPending.clear();
  }
}
