import type { cdp } from "../types/generated/cdp.js";
import * as DOM from "../types/generated/zod/DOM.js";
import * as Page from "../types/generated/zod/Page.js";
import * as Runtime from "../types/generated/zod/Runtime.js";
import * as Target from "../types/generated/zod/Target.js";
import {
  CdpDebuggeeCommandParamsSchema,
  type CdpDebuggeeCommandParams,
  type ModCDPGetTopologyParams,
  type ModCDPTopology,
  type ModCDPTopologyDomRoot,
  type ModCDPTopologyExecutionContext,
  type ModCDPTopologyFrame,
  type ModCDPTopologyTarget,
  type ProtocolParams,
  type ProtocolPayload,
  type ProtocolResult,
} from "../types/modcdp.js";

type FrameTree = cdp.types.ts.Page.FrameTree;
type DomNode = cdp.types.ts.DOM.Node;
type TargetInfo = cdp.types.ts.Target.TargetInfo;
type TargetRoute = {
  targetId: cdp.types.ts.Target.TargetID;
  sessionId: cdp.types.ts.Target.SessionID | null;
};
type ContextSelector = {
  world: string;
  worldName?: string;
};
type ExecutionContextWaiter = {
  resolve: (context: ModCDPTopologyExecutionContext) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  matches: (context: ModCDPTopologyExecutionContext) => boolean;
};

export type ServerUpstreamTransport = {
  getTargets(): Promise<cdp.types.ts.Target.TargetInfo[]>;
  resolveTargetId(params: CdpDebuggeeCommandParams): Promise<cdp.types.ts.Target.TargetID | null>;
  createTarget(url: string): Promise<cdp.types.ts.Target.TargetID>;
  attachToTarget(targetId: cdp.types.ts.Target.TargetID): Promise<cdp.types.ts.Target.SessionID | null>;
  detachFromTarget(sessionId: cdp.types.ts.Target.SessionID): Promise<void>;
  sendBrowserCommand(method: string, params?: ProtocolParams): Promise<ProtocolResult>;
  sendTargetCommand(
    targetId: cdp.types.ts.Target.TargetID,
    sessionId: cdp.types.ts.Target.SessionID | null,
    method: string,
    params?: ProtocolParams,
  ): Promise<ProtocolResult>;
  onEvent(
    listener: (
      method: string,
      payload: ProtocolParams,
      targetId: cdp.types.ts.Target.TargetID | null,
      sessionId: cdp.types.ts.Target.SessionID | null,
    ) => void,
  ): { remove: () => void };
};

const maxDetachedSessionGuards = 1024;
const topologyConcurrency = 8;
const piercerWorldName = "__modcdp_piercer__";

const targetAutoAttachParams = {
  autoAttach: true,
  waitForDebuggerOnStart: false,
  flatten: true,
} satisfies cdp.types.ts.Target.SetAutoAttachParams;

/**
 * Owns ModCDP's browser graph and target/session/context routing policy.
 *
 * AutoSessionRouter records Target/Page/Runtime events, maintains the current
 * target-to-session graph, hydrates target routes on demand, creates execution
 * contexts, and builds Mod.getTopology output. It does not know how commands
 * are physically delivered. Loopback WebSocket request ids, chrome.debugger
 * debuggee selection, native event source normalization, and upstream setup all
 * live behind the ServerUpstreamTransport interface.
 *
 * State machine:
 * 1. Target records arrive from Target.getTargets or target-info events.
 * 2. ensureTargetRoute attaches a target and records either a native session id
 *    or a sessionless attached target supplied by the upstream.
 * 3. Runtime/Page events add or invalidate execution context records.
 * 4. Frame detach, navigation, target detach, and target destroy events remove
 *    only the state affected by the browser event.
 */
export class AutoSessionRouter {
  // TargetID -> native flattened Target.SessionID. Updated by ensureTargetRoute
  // and Target.attachedToTarget events; read by routing, injectors, and topology.
  readonly sessionIdFromTargetId = new Map<cdp.types.ts.Target.TargetID, cdp.types.ts.Target.SessionID>();

  // Native flattened Target.SessionID -> TargetID. Updated with
  // sessionIdFromTargetId; read when events arrive with only a session id.
  readonly targetIdFromSessionId = new Map<cdp.types.ts.Target.SessionID, cdp.types.ts.Target.TargetID>();

  // TargetID -> latest target metadata plus router-owned session metadata.
  // Updated from target discovery/events; read by topology and target selection.
  readonly targets = new Map<cdp.types.ts.Target.TargetID, ModCDPTopologyTarget>();

  // Context key -> execution context. The key is Chrome's uniqueId when present,
  // otherwise target/session plus context id. Updated by Runtime events and by
  // Page.createIsolatedWorld; read by waits, DOM root resolution, and topology.
  readonly contexts = new Map<string, ModCDPTopologyExecutionContext>();

  // SessionID -> target metadata. Updated only when a real native session id
  // exists; read by ModCDPClient and tests that inspect router state.
  readonly session_targets = new Map<cdp.types.ts.Target.SessionID, ModCDPTopologyTarget>();

  // SessionID -> first Runtime execution context id observed for that session.
  // Updated by Runtime.executionContextCreated; read by ModCDPClient injectors.
  readonly execution_contexts = new Map<cdp.types.ts.Target.SessionID, cdp.types.ts.Runtime.ExecutionContextId>();

  // Target ids that are addressable through the upstream without a native CDP
  // session id. Updated by ensureTargetRoute; read before reattaching.
  private readonly attachedTargetIdsWithoutSession = new Set<cdp.types.ts.Target.TargetID>();

  // Context waiters keyed by native session id or by target id for sessionless
  // upstreams. Added by waitForMatchingExecutionContext and resolved/rejected by
  // recordExecutionContext and invalidation methods.
  private readonly execution_context_waiters = new Map<string, Set<ExecutionContextWaiter>>();

  // Recently detached native sessions. Updated on detach and bounded to avoid
  // reusing stale ids after event ordering races.
  private readonly detached_sessions = new Map<cdp.types.ts.Target.SessionID, true>();

  // Semantic upstream selected by the owner. The router calls methods on this
  // object but never mutates transport-owned private state.
  private readonly upstream: ServerUpstreamTransport;

  // Timeout supplier owned by client/server config. Read when installing a new
  // Runtime.executionContextCreated waiter.
  private readonly defaultExecutionContextTimeoutMs: () => number;

  constructor(upstream: ServerUpstreamTransport, defaultExecutionContextTimeoutMs: () => number) {
    this.upstream = upstream;
    this.defaultExecutionContextTimeoutMs = defaultExecutionContextTimeoutMs;
  }

  /** Route a CDP command using router-owned target/session policy. */
  async send(
    method: string,
    params: ProtocolParams = {},
    requestedSessionId: cdp.types.ts.Target.SessionID | null = null,
  ): Promise<ProtocolResult> {
    const domain = method.split(".")[0] ?? "";
    if (domain === "Browser" || domain === "Target" || domain === "SystemInfo") {
      return await this.upstream.sendBrowserCommand(method, params);
    }
    if (requestedSessionId != null) {
      const targetId = this.targetIdFromSessionId.get(requestedSessionId);
      if (!targetId) throw new Error(`No target is recorded for sessionId=${requestedSessionId}.`);
      return await this.upstream.sendTargetCommand(targetId, requestedSessionId, method, params);
    }
    const route = await this.ensureTargetRoute(
      await this.resolveTargetId(CdpDebuggeeCommandParamsSchema.parse(params)),
    );
    return await this.upstream.sendTargetCommand(route.targetId, route.sessionId, method, params);
  }

  /** Ensure a target has a real native flattened CDP session id. */
  async ensureSession(targetId: cdp.types.ts.Target.TargetID): Promise<cdp.types.ts.Target.SessionID> {
    const route = await this.ensureTargetRoute(targetId);
    if (route.sessionId == null) throw new Error(`Upstream attached targetId=${targetId} without a CDP session id.`);
    return route.sessionId;
  }

  /** Ensure a target is addressable by the selected upstream. */
  async ensureTargetRoute(targetId: cdp.types.ts.Target.TargetID | null): Promise<TargetRoute> {
    targetId ??= await this.resolveTargetId(CdpDebuggeeCommandParamsSchema.parse({}));
    const sessionId = targetId ? this.sessionIdFromTargetId.get(targetId) : null;
    if (targetId && sessionId != null && !this.detached_sessions.has(sessionId)) return { targetId, sessionId };
    if (targetId && this.attachedTargetIdsWithoutSession.has(targetId)) return { targetId, sessionId: null };
    targetId ??= await this.upstream.createTarget("about:blank#modcdp");
    const attachedSessionId = await this.upstream.attachToTarget(targetId);
    if (attachedSessionId == null) {
      this.attachedTargetIdsWithoutSession.add(targetId);
      this.recordTargetSessionlessAttachment(targetId);
      return { targetId, sessionId: null };
    }
    this.recordTargetSession(targetId, attachedSessionId, this.targets.get(targetId));
    return { targetId, sessionId: attachedSessionId };
  }

  /** Subscribe this router to the selected upstream's normalized CDP events. */
  listen(): { remove: () => void } {
    return this.upstream.onEvent((method, payload, targetId, sessionId) => {
      this.recordUpstreamEvent(method, payload, targetId, sessionId);
    });
  }

  /** Record a normalized upstream CDP event into the router graph. */
  recordUpstreamEvent(
    method: string,
    payload: ProtocolPayload,
    targetIdOrSessionId: cdp.types.ts.Target.TargetID | cdp.types.ts.Target.SessionID | null,
    sessionId: cdp.types.ts.Target.SessionID | null = null,
  ): void {
    const targetId = sessionId == null ? null : targetIdOrSessionId;
    const cdpSessionId = sessionId ?? targetIdOrSessionId;
    if (method === Target.AttachedToTargetEvent.id) {
      const event = Target.AttachedToTargetEvent.parse(payload);
      this.recordTargetSession(event.targetInfo.targetId, event.sessionId, event.targetInfo);
    } else if (method === Target.DetachedFromTargetEvent.id) {
      const event = Target.DetachedFromTargetEvent.parse(payload);
      this.forgetSession(event.sessionId);
      if (event.targetId) this.attachedTargetIdsWithoutSession.delete(event.targetId);
    } else if (method === Target.TargetInfoChangedEvent.id) {
      this.recordTarget(Target.TargetInfoChangedEvent.parse(payload).targetInfo);
    } else if (method === Target.TargetDestroyedEvent.id) {
      this.forgetTarget(Target.TargetDestroyedEvent.parse(payload).targetId);
    } else if (method === Runtime.ExecutionContextCreatedEvent.id) {
      this.recordExecutionContext(
        typeof targetId === "string" ? targetId : null,
        typeof cdpSessionId === "string" ? cdpSessionId : null,
        Runtime.ExecutionContextCreatedEvent.parse(payload).context,
      );
    } else if (method === Runtime.ExecutionContextDestroyedEvent.id && cdpSessionId) {
      this.forgetExecutionContextById(
        cdpSessionId,
        Runtime.ExecutionContextDestroyedEvent.parse(payload).executionContextId,
      );
    } else if (method === Runtime.ExecutionContextsClearedEvent.id && cdpSessionId) {
      this.forgetExecutionContextsForRoute(cdpSessionId);
    } else if (method === Page.FrameNavigatedEvent.id) {
      this.forgetExecutionContextsForFrame(cdpSessionId, targetId, Page.FrameNavigatedEvent.parse(payload).frame.id);
    } else if (method === Page.FrameDetachedEvent.id) {
      this.forgetExecutionContextsForFrame(cdpSessionId, targetId, Page.FrameDetachedEvent.parse(payload).frameId);
    }
  }

  /** Wait for the first execution context associated with a real session id. */
  waitForExecutionContext(sessionId: string | null, { timeout_ms }: { timeout_ms?: number } = {}): Promise<number> {
    return this.waitForMatchingExecutionContext(
      (context) => context.sessionId === sessionId,
      sessionId,
      timeout_ms,
    ).then((context) => context.id);
  }

  /** Ensure the requested execution context exists for a frame. */
  async ensureExecutionContext(
    frame: { frameId: cdp.types.ts.Page.FrameId; targetId: cdp.types.ts.Target.TargetID },
    selector: ContextSelector = { world: "main" },
  ): Promise<ModCDPTopologyExecutionContext> {
    const route = await this.ensureTargetRoute(frame.targetId);
    const existing = this.findExecutionContext(route.targetId, route.sessionId, frame.frameId, selector);
    if (existing) return existing;

    await this.upstream.sendTargetCommand(route.targetId, route.sessionId, "Runtime.enable", {});
    if (selector.world === "isolated" || selector.world === "piercer") {
      const created = Page.CreateIsolatedWorldResult.parse(
        await this.upstream.sendTargetCommand(route.targetId, route.sessionId, "Page.createIsolatedWorld", {
          frameId: frame.frameId,
          worldName: selector.worldName ?? (selector.world === "piercer" ? piercerWorldName : undefined),
          grantUniveralAccess: true,
        }),
      );
      const createdContext = this.findExecutionContext(route.targetId, route.sessionId, frame.frameId, selector);
      if (createdContext?.id === created.executionContextId) return createdContext;
      const context: ModCDPTopologyExecutionContext = {
        id: created.executionContextId,
        sessionId: route.sessionId,
        targetId: route.targetId,
        frameId: frame.frameId,
        world: selector.world === "piercer" ? "piercer" : selector.worldName || "isolated",
        name: selector.worldName,
      };
      this.contexts.set(this.contextKey(route.targetId, route.sessionId, context.id, context.uniqueId), context);
      return context;
    }

    return await this.waitForMatchingExecutionContext(
      (context) =>
        context.targetId === route.targetId &&
        context.sessionId === route.sessionId &&
        context.frameId === frame.frameId &&
        context.world === selector.world,
      route.sessionId ?? route.targetId,
    );
  }

  /** Build the current target/frame/DOM-root/execution-context topology. */
  async getTopology(params: ModCDPGetTopologyParams = {}): Promise<ModCDPTopology> {
    const objectGroup = `modcdp-topology-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const targetInfos = await this.upstream.getTargets();
    for (const targetInfo of targetInfos) this.recordTarget(targetInfo);

    const rootTarget = this.resolveRootTarget(params, targetInfos);
    if (rootTarget == null) throw new Error("Mod.getTopology could not resolve a page target.");
    const frames = new Map<cdp.types.ts.Page.FrameId, ModCDPTopologyFrame>();
    const rootRoute = await this.enableTarget(rootTarget.targetId);
    const rootTree = Page.GetFrameTreeResult.parse(
      await this.upstream.sendTargetCommand(rootRoute.targetId, rootRoute.sessionId, "Page.getFrameTree", {}),
    ).frameTree;
    const rootFrameId = rootTree.frame.id;
    this.recordFrameTree(rootTree, rootTarget.targetId, null, frames);

    const oopifTargets = targetInfos.filter(
      (target) => target.type === "iframe" && target.parentFrameId && !frames.has(target.targetId),
    );
    await runTopologyQueue(oopifTargets, async (target) => {
      const route = await this.enableTarget(target.targetId);
      const frameTree = Page.GetFrameTreeResult.parse(
        await this.upstream.sendTargetCommand(route.targetId, route.sessionId, "Page.getFrameTree", {}),
      ).frameTree;
      this.recordFrameTree(frameTree, target.targetId, target.parentFrameId ?? null, frames);
    });

    await runTopologyQueue([...frames.entries()], async ([frameId, frame]) => {
      if (!frame.parentFrameId) return;
      const parent = frames.get(frame.parentFrameId);
      if (!parent) return;
      const parentRoute = await this.ensureTargetRoute(parent.targetId);
      const owner = DOM.GetFrameOwnerResult.parse(
        await this.upstream.sendTargetCommand(parentRoute.targetId, parentRoute.sessionId, "DOM.getFrameOwner", {
          frameId,
        }),
      );
      if (owner.backendNodeId != null) frame.outerBackendNodeId = owner.backendNodeId;
    });

    const contexts = new Map<string, ModCDPTopologyExecutionContext>();
    const roots = new Map<cdp.types.ts.Runtime.RemoteObjectId, ModCDPTopologyDomRoot>();
    await runTopologyQueue([...frames.entries()], async ([frameId, frame]) => {
      const context = await this.ensureExecutionContext({ frameId, targetId: frame.targetId }, { world: "piercer" });
      contexts.set(this.contextKey(context.targetId, context.sessionId ?? null, context.id, context.uniqueId), context);
      const rootObject = Runtime.EvaluateResult.parse(
        await this.upstream.sendTargetCommand(context.targetId, context.sessionId ?? null, "Runtime.evaluate", {
          expression: "document.documentElement",
          objectGroup,
          ...(context.uniqueId ? { uniqueContextId: context.uniqueId } : { contextId: context.id }),
        }),
      );
      const objectId = rootObject.result.objectId;
      if (!objectId) throw new Error(`Mod.getTopology could not resolve document root for frameId=${frameId}.`);
      const node = DOM.DescribeNodeResult.parse(
        await this.upstream.sendTargetCommand(context.targetId, context.sessionId ?? null, "DOM.describeNode", {
          objectId,
        }),
      ).node;
      roots.set(objectId, {
        kind: "document",
        frameId,
        outerBackendNodeId: frame.outerBackendNodeId ?? null,
        innerBackendNodeId: node.backendNodeId ?? null,
        executionContextId: context.id,
        ...(context.uniqueId ? { uniqueContextId: context.uniqueId } : {}),
      });
    });

    await runTopologyQueue([...new Set([...frames.values()].map((frame) => frame.targetId))], async (targetId) => {
      const route = await this.ensureTargetRoute(targetId);
      const document = DOM.GetDocumentResult.parse(
        await this.upstream.sendTargetCommand(route.targetId, route.sessionId, "DOM.getDocument", {
          depth: -1,
          pierce: true,
        }),
      );
      await this.recordShadowRoots(document.root, frames, roots, objectGroup);
    });

    for (const context of this.contexts.values()) {
      if ([...frames.values()].some((frame) => frame.targetId === context.targetId)) {
        contexts.set(
          this.contextKey(context.targetId, context.sessionId ?? null, context.id, context.uniqueId),
          context,
        );
      }
    }

    return {
      objectGroup,
      rootFrameId,
      frames: Object.fromEntries(frames),
      roots: Object.fromEntries(roots),
      targets: Object.fromEntries(
        [...this.targets].filter(([targetId]) => targetInfos.some((target) => target.targetId === targetId)),
      ),
      contexts: Object.fromEntries(contexts),
    };
  }

  private resolveRootTarget(params: ModCDPGetTopologyParams, targetInfos: TargetInfo[]): TargetInfo | null {
    const requestedTargetId = params.rootTargetId ?? params.targetId ?? null;
    if (requestedTargetId) return targetInfos.find((target) => target.targetId === requestedTargetId) ?? null;
    return targetInfos.find((target) => target.type === "page" && !target.url.startsWith("devtools://")) ?? null;
  }

  private async resolveTargetId(params: CdpDebuggeeCommandParams): Promise<cdp.types.ts.Target.TargetID | null> {
    const explicitTargetId = await this.upstream.resolveTargetId(params);
    if (explicitTargetId) return explicitTargetId;
    const targetInfos = await this.upstream.getTargets();
    for (const targetInfo of targetInfos) this.recordTarget(targetInfo);
    return (
      targetInfos.find((target) => target.type === "page" && !target.url.startsWith("devtools://"))?.targetId ?? null
    );
  }

  private async enableTarget(targetId: cdp.types.ts.Target.TargetID): Promise<TargetRoute> {
    const route = await this.ensureTargetRoute(targetId);
    await Promise.all([
      this.upstream.sendTargetCommand(route.targetId, route.sessionId, "Page.enable", {}),
      this.upstream.sendTargetCommand(route.targetId, route.sessionId, "DOM.enable", {}),
      this.upstream.sendTargetCommand(route.targetId, route.sessionId, "Runtime.enable", {}),
      this.upstream
        .sendTargetCommand(route.targetId, route.sessionId, "Target.setAutoAttach", targetAutoAttachParams)
        .catch(() => ({})),
    ]);
    return route;
  }

  private recordFrameTree(
    tree: FrameTree,
    targetId: cdp.types.ts.Target.TargetID,
    parentFrameId: cdp.types.ts.Page.FrameId | null,
    frames: Map<cdp.types.ts.Page.FrameId, ModCDPTopologyFrame>,
  ): void {
    const frameId = tree.frame.id;
    frames.set(frameId, {
      targetId,
      url: tree.frame.url ?? null,
      parentFrameId: tree.frame.parentId ?? parentFrameId ?? null,
    });
    for (const child of tree.childFrames ?? []) this.recordFrameTree(child, targetId, frameId, frames);
  }

  private async recordShadowRoots(
    node: DomNode,
    frames: Map<cdp.types.ts.Page.FrameId, ModCDPTopologyFrame>,
    roots: Map<cdp.types.ts.Runtime.RemoteObjectId, ModCDPTopologyDomRoot>,
    objectGroup: string,
    frameId: cdp.types.ts.Page.FrameId | null = null,
    hostBackendNodeId: cdp.types.ts.DOM.BackendNodeId | null = null,
  ): Promise<void> {
    const currentFrameId = node.frameId ?? frameId;
    for (const shadowRoot of node.shadowRoots ?? []) {
      if (currentFrameId) {
        const frame = frames.get(currentFrameId);
        const context = frame
          ? this.findExecutionContext(frame.targetId, null, currentFrameId, { world: "piercer" })
          : null;
        if (frame && context) {
          const objectId = DOM.ResolveNodeResult.parse(
            await this.upstream.sendTargetCommand(context.targetId, context.sessionId ?? null, "DOM.resolveNode", {
              backendNodeId: shadowRoot.backendNodeId,
              executionContextId: context.id,
              objectGroup,
            }),
          ).object.objectId;
          if (objectId) {
            roots.set(objectId, {
              kind: "shadow",
              frameId: currentFrameId,
              outerBackendNodeId: hostBackendNodeId ?? node.backendNodeId ?? null,
              innerBackendNodeId: shadowRoot.backendNodeId ?? null,
              mode: shadowRoot.shadowRootType,
              executionContextId: context.id,
              ...(context.uniqueId ? { uniqueContextId: context.uniqueId } : {}),
            });
          }
        }
      }
      await this.recordShadowRoots(shadowRoot, frames, roots, objectGroup, currentFrameId, node.backendNodeId ?? null);
    }
    for (const child of node.children ?? []) {
      await this.recordShadowRoots(child, frames, roots, objectGroup, currentFrameId, hostBackendNodeId);
    }
    if (node.contentDocument) {
      await this.recordShadowRoots(
        node.contentDocument,
        frames,
        roots,
        objectGroup,
        node.contentDocument.frameId ?? currentFrameId,
        hostBackendNodeId,
      );
    }
  }

  private recordTarget(targetInfo: TargetInfo): void {
    const sessionId = this.sessionIdFromTargetId.get(targetInfo.targetId) ?? null;
    this.targets.set(targetInfo.targetId, {
      ...targetInfo,
      targetId: targetInfo.targetId,
      type: targetInfo.type,
      sessionId,
    });
  }

  private recordTargetSession(
    targetId: cdp.types.ts.Target.TargetID,
    sessionId: cdp.types.ts.Target.SessionID,
    targetInfo: TargetInfo | ModCDPTopologyTarget | null | undefined,
  ): void {
    this.detached_sessions.delete(sessionId);
    this.attachedTargetIdsWithoutSession.delete(targetId);
    this.sessionIdFromTargetId.set(targetId, sessionId);
    this.targetIdFromSessionId.set(sessionId, targetId);
    const target = targetInfo
      ? { ...targetInfo, targetId, type: targetInfo.type, sessionId }
      : { targetId, type: this.targets.get(targetId)?.type ?? "page", sessionId };
    this.targets.set(targetId, target);
    this.session_targets.set(sessionId, target);
  }

  private recordTargetSessionlessAttachment(targetId: cdp.types.ts.Target.TargetID): void {
    const existing = this.targets.get(targetId);
    if (!existing) return;
    this.targets.set(targetId, { ...existing, sessionId: null });
  }

  private recordExecutionContext(
    eventTargetId: cdp.types.ts.Target.TargetID | null,
    sessionId: cdp.types.ts.Target.SessionID | null,
    context: cdp.types.ts.Runtime.ExecutionContextDescription,
  ): void {
    if (sessionId && this.detached_sessions.has(sessionId)) return;
    const targetId = eventTargetId ?? (sessionId ? (this.targetIdFromSessionId.get(sessionId) ?? null) : null);
    if (!targetId) return;
    if (sessionId && !this.execution_contexts.has(sessionId)) this.execution_contexts.set(sessionId, context.id);
    const auxData = context.auxData && typeof context.auxData === "object" ? context.auxData : {};
    const frameId = typeof auxData.frameId === "string" ? auxData.frameId : null;
    const topologyContext: ModCDPTopologyExecutionContext = {
      ...context,
      id: context.id,
      sessionId,
      targetId,
      frameId,
      world:
        context.name === piercerWorldName
          ? "piercer"
          : auxData.type === "default"
            ? "main"
            : context.name || String(auxData.type ?? "isolated"),
    };
    this.contexts.set(this.contextKey(targetId, sessionId, context.id, context.uniqueId), topologyContext);
    const waiterKey = sessionId ?? targetId;
    const waiters = this.execution_context_waiters.get(waiterKey);
    if (!waiters) return;
    for (const waiter of [...waiters]) {
      if (!waiter.matches(topologyContext)) continue;
      waiters.delete(waiter);
      clearTimeout(waiter.timeout);
      waiter.resolve(topologyContext);
    }
    if (waiters.size === 0) this.execution_context_waiters.delete(waiterKey);
  }

  private findExecutionContext(
    targetId: cdp.types.ts.Target.TargetID,
    sessionId: cdp.types.ts.Target.SessionID | null,
    frameId: cdp.types.ts.Page.FrameId,
    selector: ContextSelector,
  ): ModCDPTopologyExecutionContext | null {
    for (const context of this.contexts.values()) {
      if (context.targetId !== targetId || context.frameId !== frameId) continue;
      if (sessionId != null && context.sessionId !== sessionId) continue;
      if (selector.world === "piercer" && context.world === "piercer") return context;
      if (selector.world === "isolated" && context.name === selector.worldName) return context;
      if (selector.world === "main" && context.world === "main") return context;
      if (context.world === selector.world) return context;
    }
    return null;
  }

  private waitForMatchingExecutionContext(
    matches: (context: ModCDPTopologyExecutionContext) => boolean,
    waiterKey: string | null,
    timeoutMs = this.defaultExecutionContextTimeoutMs(),
  ): Promise<ModCDPTopologyExecutionContext> {
    for (const context of this.contexts.values()) {
      if (matches(context)) return Promise.resolve(context);
    }
    if (!waiterKey) return Promise.reject(new Error("Cannot wait for a Runtime execution context without a route."));
    return new Promise<ModCDPTopologyExecutionContext>((resolve, reject) => {
      const waiter: ExecutionContextWaiter = {
        resolve,
        reject,
        matches,
        timeout: setTimeout(() => {
          const waiters = this.execution_context_waiters.get(waiterKey);
          waiters?.delete(waiter);
          if (waiters?.size === 0) this.execution_context_waiters.delete(waiterKey);
          reject(new Error(`Timed out waiting for Runtime.executionContextCreated for route ${waiterKey}.`));
        }, timeoutMs),
      };
      const waiters = this.execution_context_waiters.get(waiterKey);
      if (waiters) waiters.add(waiter);
      else this.execution_context_waiters.set(waiterKey, new Set([waiter]));
    });
  }

  private forgetTarget(targetId: cdp.types.ts.Target.TargetID): void {
    const sessionId = this.sessionIdFromTargetId.get(targetId);
    if (sessionId) this.forgetSession(sessionId);
    this.attachedTargetIdsWithoutSession.delete(targetId);
    this.targets.delete(targetId);
    this.forgetExecutionContextsForRoute(targetId);
  }

  private forgetSession(sessionId: cdp.types.ts.Target.SessionID): void {
    const targetId = this.targetIdFromSessionId.get(sessionId);
    if (targetId) this.sessionIdFromTargetId.delete(targetId);
    this.targetIdFromSessionId.delete(sessionId);
    this.session_targets.delete(sessionId);
    this.forgetExecutionContextsForRoute(sessionId);
    this.markDetachedSession(sessionId);
    const waiters = this.execution_context_waiters.get(sessionId);
    if (!waiters) return;
    this.execution_context_waiters.delete(sessionId);
    const error = new Error(`Runtime execution context wait cancelled because session ${sessionId} detached.`);
    for (const waiter of waiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
  }

  private forgetExecutionContextById(
    routeKey: string,
    executionContextId: cdp.types.ts.Runtime.ExecutionContextId,
  ): void {
    for (const [contextKey, context] of this.contexts) {
      if ((context.sessionId === routeKey || context.targetId === routeKey) && context.id === executionContextId) {
        this.contexts.delete(contextKey);
      }
    }
    if (this.execution_contexts.get(routeKey) === executionContextId) this.execution_contexts.delete(routeKey);
  }

  private forgetExecutionContextsForRoute(routeKey: string): void {
    for (const [contextKey, context] of this.contexts) {
      if (context.sessionId === routeKey || context.targetId === routeKey) this.contexts.delete(contextKey);
    }
    this.execution_contexts.delete(routeKey);
  }

  private forgetExecutionContextsForFrame(
    sessionId: cdp.types.ts.Target.SessionID | null,
    targetId: cdp.types.ts.Target.TargetID | null,
    frameId: cdp.types.ts.Page.FrameId,
  ): void {
    for (const [contextKey, context] of this.contexts) {
      if (context.frameId !== frameId) continue;
      if (sessionId != null && context.sessionId === sessionId) this.contexts.delete(contextKey);
      else if (targetId != null && context.targetId === targetId) this.contexts.delete(contextKey);
    }
  }

  private markDetachedSession(sessionId: cdp.types.ts.Target.SessionID): void {
    this.detached_sessions.delete(sessionId);
    this.detached_sessions.set(sessionId, true);
    while (this.detached_sessions.size > maxDetachedSessionGuards) {
      const oldestSessionId = this.detached_sessions.keys().next().value;
      if (!oldestSessionId) break;
      this.detached_sessions.delete(oldestSessionId);
    }
  }

  private contextKey(
    targetId: cdp.types.ts.Target.TargetID,
    sessionId: cdp.types.ts.Target.SessionID | null,
    contextId: cdp.types.ts.Runtime.ExecutionContextId,
    uniqueId: string | undefined,
  ): string {
    return uniqueId ?? `${sessionId ?? targetId}:${contextId}`;
  }
}

async function runTopologyQueue<T>(items: Iterable<T>, worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(topologyConcurrency, queue.length) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (item == null) return;
      await worker(item);
    }
  });
  await Promise.all(workers);
}
