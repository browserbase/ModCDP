import type { z } from "zod";
import type { cdp } from "../types/generated/cdp.js";
import type { CdpCommandSchema, CdpNamedSchema } from "../types/generated/zod/helpers.js";
import * as Target from "../types/generated/zod/Target.js";
import type { CdpDebuggeeCommandParams, ProtocolPayload, ProtocolResult } from "../types/modcdp.js";
import type { ServerUpstreamEventListener, ServerUpstreamTransport, TargetRoute } from "../router/AutoSessionRouter.js";

type ChromeDebuggerTransportOptions = {
  globalScope: typeof globalThis & { chrome?: typeof chrome };
};

const targetAutoAttachParams = {
  autoAttach: true,
  waitForDebuggerOnStart: false,
  flatten: true,
} satisfies cdp.types.ts.Target.SetAutoAttachParams;

/**
 * Owns server upstream traffic sent through chrome.debugger.
 *
 * This class owns chrome.debugger debuggee selection, attach lifecycle,
 * chrome.debugger event normalization, and target/session bookkeeping needed by
 * debugger routing. It does not choose ModCDP routes, manage custom command registries, run
 * middleware, publish ModCDP events, or own loopback WebSocket state.
 *
 * Lifecycle:
 * 1. The server constructs the transport with an extension service-worker
 *    global scope.
 * 2. `getTargets()` reads chrome.debugger targets and refreshes tab-to-target
 *    facts.
 * 3. `attachToTarget()` attaches the debuggee for the requested target and
 *    enables flattened auto-attach.
 * 4. chrome.debugger events update debugger-local session maps and dispatch to
 *    typed `on(event, listener)` subscriptions.
 */
export class ChromeDebuggerTransport implements ServerUpstreamTransport {
  // JSON(debuggee) values attached in this service worker. Updated by
  // attachDebuggee/onDetach; read before attach to avoid duplicate native
  // chrome.debugger.attach calls.
  private readonly attached_debuggees = new Set<string>();

  // Normalized CDP event listeners registered by AutoSessionRouter and the
  // server event publisher. Updated by on; read from installEventListener.
  private readonly event_listeners = new Map<CdpNamedSchema<z.ZodType>, Set<ServerUpstreamEventListener>>();

  // Native Target.SessionID -> TargetID from debugger Target.attachedToTarget
  // events. Updated by installEventListener; read when sending a command that
  // already carries a child session id.
  private readonly targetId_from_sessionId = new Map<string, string>();

  // chrome.tabs tab id -> CDP TargetID. Refreshed by getTargets and
  // Target.attachedToTarget events; read by resolveTargetId/createTarget.
  private readonly targetId_from_tabId = new Map<number, string>();

  // TargetID -> chrome.debugger.Debuggee selected for that target. Updated by
  // attachToTarget; read by send so subsequent commands use the same native
  // debuggee shape.
  private readonly debuggee_from_targetId = new Map<string, chrome.debugger.Debuggee>();

  // True once chrome.debugger.onEvent/onDetach listeners are installed in this
  // service worker. Updated by installEventListener; read by getTargets.
  private event_listener_installed = false;

  // The extension service-worker global scope that exposes chrome.debugger and
  // chrome.tabs. Read by all debugger operations.
  private readonly globalScope: ChromeDebuggerTransportOptions["globalScope"];

  constructor(options: ChromeDebuggerTransportOptions) {
    this.globalScope = options.globalScope;
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

  /** Return current browser targets through chrome.debugger target discovery. */
  async getTargets() {
    const chromeApi = this.globalScope.chrome;
    this.installEventListener();
    if (!chromeApi?.debugger?.getTargets) throw new Error("chrome.debugger is unavailable.");
    const targetInfos = (await chromeApi.debugger.getTargets()).map((target) => {
      if (typeof target.tabId === "number") this.targetId_from_tabId.set(target.tabId, target.id);
      return {
        targetId: target.id,
        type: target.type,
        title: target.title,
        url: target.url,
        attached: target.attached,
        canAccessOpener: false,
        ...(typeof target.tabId === "number" ? { tabId: target.tabId } : {}),
      };
    });
    return Target.GetTargetsResult.parse({ targetInfos }).targetInfos;
  }

  /** Resolve a target id from target id, debuggee target id, or chrome tab id. */
  async resolveTargetId(params: CdpDebuggeeCommandParams) {
    if (typeof params.targetId === "string" && params.targetId.length > 0) return params.targetId;
    if (params.debuggee?.targetId) return params.debuggee.targetId;
    if (typeof params.tabId === "number") {
      await this.getTargets();
      return this.targetId_from_tabId.get(params.tabId) ?? null;
    }
    return null;
  }

  /** Create a new foreground tab and return the corresponding CDP target id. */
  async createTarget(url: string) {
    const tab = await this.globalScope.chrome.tabs.create({ url, active: true });
    if (!tab.id) throw new Error(`chrome_debugger could not create a tab for ${url}.`);
    await this.getTargets();
    const targetId = this.targetId_from_tabId.get(tab.id);
    if (!targetId) throw new Error(`chrome_debugger could not resolve target for created tab ${tab.id}.`);
    return targetId;
  }

  /** Attach chrome.debugger to a target; debugger transport has no native flattened session id for the parent. */
  async attachToTarget(targetId: cdp.types.ts.Target.TargetID) {
    const debuggee = await this.debuggeeForTarget(targetId);
    await this.attachDebuggee(debuggee);
    this.debuggee_from_targetId.set(targetId, debuggee);
    return null;
  }

  /** Forget a debugger child-session mapping after detach. */
  async detachFromTarget(sessionId: cdp.types.ts.Target.SessionID) {
    this.targetId_from_sessionId.delete(sessionId);
  }

  /** Send one typed CDP command through chrome.debugger, optionally scoped to a target route. */
  async send<
    Params extends z.ZodType<Record<string, unknown>>,
    Result extends z.ZodType<Record<string, unknown>>,
    Name extends string,
  >(
    command: CdpCommandSchema<Params, Result, Name>,
    params?: z.input<Params>,
    route: TargetRoute | undefined = undefined,
  ): Promise<z.output<Result>> {
    if (command.id === Target.GetTargetsCommand.id)
      return command.result.parse({ targetInfos: await this.getTargets() });
    if (!route) {
      const debuggee = await this.defaultDebuggee();
      await this.attachDebuggee(debuggee);
      return command.result.parse(await this.sendToDebugger(debuggee, command.id, command.params.parse(params)));
    }
    const routed_targetId = route.sessionId
      ? (this.targetId_from_sessionId.get(route.sessionId) ?? route.targetId)
      : route.targetId;
    const debuggee =
      this.debuggee_from_targetId.get(routed_targetId) ?? (await this.debuggeeForTarget(routed_targetId));
    await this.attachDebuggee(debuggee);
    return command.result.parse(await this.sendToDebugger(debuggee, command.id, command.params.parse(params)));
  }

  private async debuggeeForTarget(targetId: cdp.types.ts.Target.TargetID) {
    const targets = await this.getTargets();
    const target = targets.find((candidate) => candidate.targetId === targetId);
    if (!target) throw new Error(`chrome_debugger could not resolve targetId=${targetId}.`);
    const tabId = typeof target.tabId === "number" ? target.tabId : null;
    return tabId == null ? { targetId } : { tabId };
  }

  private async defaultDebuggee() {
    const targetId =
      (await this.resolveTargetId({})) ?? (await this.getTargets()).find((target) => target.type === "page")?.targetId;
    if (!targetId) return await this.debuggeeForTarget(await this.createTarget("about:blank#modcdp"));
    return await this.debuggeeForTarget(targetId);
  }

  private async attachDebuggee(debuggee: chrome.debugger.Debuggee) {
    const key = JSON.stringify(debuggee);
    if (this.attached_debuggees.has(key)) return;
    const chromeApi = this.globalScope.chrome;
    await new Promise<void>((resolve, reject) =>
      chromeApi.debugger.attach(debuggee, "1.3", () => {
        const error = chromeApi.runtime.lastError;
        if (!error || error.message?.includes("Another debugger is already attached")) resolve();
        else reject(new Error(error.message));
      }),
    );
    await new Promise<void>((resolve, reject) =>
      chromeApi.debugger.sendCommand(
        debuggee,
        Target.SetAutoAttachCommand.id,
        Target.SetAutoAttachCommand.params.parse(targetAutoAttachParams),
        () => {
          const error = chromeApi.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve();
        },
      ),
    );
    this.attached_debuggees.add(key);
  }

  private installEventListener() {
    const chromeApi = this.globalScope.chrome;
    if (this.event_listener_installed || !chromeApi?.debugger?.onEvent?.addListener) return;
    chromeApi.debugger.onEvent.addListener((source, method, params) => {
      const payload = (params ?? {}) as ProtocolPayload;
      const source_targetId =
        source.targetId ??
        (typeof source.tabId === "number" ? (this.targetId_from_tabId.get(source.tabId) ?? null) : null);
      const cdp_sessionId = source.sessionId ?? null;
      if (method === Target.AttachedToTargetEvent.id) {
        const attached = Target.AttachedToTargetEvent.parse(payload);
        if (typeof source.tabId === "number") this.targetId_from_tabId.set(source.tabId, attached.targetInfo.targetId);
        this.targetId_from_sessionId.set(attached.sessionId, attached.targetInfo.targetId);
      } else if (method === Target.DetachedFromTargetEvent.id) {
        const detached = Target.DetachedFromTargetEvent.parse(payload);
        this.targetId_from_sessionId.delete(detached.sessionId);
      }
      for (const [event, listeners] of this.event_listeners) {
        if (event.id !== method) continue;
        for (const listener of listeners) listener(payload, source_targetId, cdp_sessionId);
      }
    });
    chromeApi.debugger.onDetach?.addListener?.((source) => {
      this.attached_debuggees.delete(JSON.stringify(this.compactDebuggee(source)));
    });
    this.event_listener_installed = true;
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

  private sendToDebugger(
    debuggee: chrome.debugger.Debuggee,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<ProtocolResult> {
    const chromeApi = this.globalScope.chrome;
    return new Promise<ProtocolResult>((resolve, reject) =>
      chromeApi.debugger.sendCommand(debuggee, method, params, (result) => {
        const error = chromeApi.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(result as ProtocolResult);
      }),
    );
  }
}
