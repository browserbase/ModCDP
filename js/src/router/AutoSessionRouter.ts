import type { cdp } from "../types/generated/cdp.js";
import type {
  ModCDPGetTopologyParams,
  ModCDPTopology,
  ModCDPTopologyDomRoot,
  ModCDPTopologyExecutionContext,
  ModCDPTopologyFrame,
  ModCDPTopologyTarget,
  ProtocolParams,
  ProtocolResult,
} from "../types/modcdp.js";

type SendCDP = (method: string, params?: ProtocolParams, sessionId?: string | null) => Promise<ProtocolResult>;
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
type FrameTree = cdp.types.ts.Page.FrameTree;
type TargetInfo = cdp.types.ts.Target.TargetInfo;
type DomNode = cdp.types.ts.DOM.Node;

const maxDetachedSessionGuards = 1024;
const topologyConcurrency = 8;
const piercerWorldName = "__modcdp_piercer__";

export class AutoSessionRouter {
  readonly sessionIdFromTargetId = new Map<cdp.types.ts.Target.TargetID, cdp.types.ts.Target.SessionID>();
  readonly targetIdFromSessionId = new Map<cdp.types.ts.Target.SessionID, cdp.types.ts.Target.TargetID>();
  readonly targets = new Map<cdp.types.ts.Target.TargetID, ModCDPTopologyTarget>();
  readonly contexts = new Map<string, ModCDPTopologyExecutionContext>();

  readonly target_sessions = this.sessionIdFromTargetId;
  readonly session_targets = new Map<string, Record<string, unknown>>();
  readonly execution_contexts = new Map<string, number>();
  private readonly execution_context_waiters = new Map<string, Set<ExecutionContextWaiter>>();
  private readonly detached_sessions = new Map<string, true>();

  constructor(
    private readonly send: SendCDP,
    private readonly defaultExecutionContextTimeoutMs: () => number,
  ) {}

  sessionIdForTarget(targetId: string) {
    return this.sessionIdFromTargetId.get(targetId) ?? null;
  }

  async attachToTarget(targetId: string) {
    return await this.ensureSession(targetId);
  }

  async ensureSession(targetId: cdp.types.ts.Target.TargetID) {
    const existingSessionId = this.sessionIdFromTargetId.get(targetId);
    if (existingSessionId != null && !this.detached_sessions.has(existingSessionId)) return existingSessionId;

    const result = (await this.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    })) as cdp.types.ts.Target.AttachToTargetResult;
    const sessionId = typeof result.sessionId === "string" && result.sessionId.length > 0 ? result.sessionId : null;
    if (sessionId == null) throw new Error(`Target.attachToTarget returned no sessionId for targetId=${targetId}.`);
    this.recordTargetSession(targetId, sessionId, this.targets.get(targetId));
    return sessionId;
  }

  async sendToFrame(frame: { targetId: cdp.types.ts.Target.TargetID }, method: string, params: ProtocolParams = {}) {
    return await this.send(method, params, await this.ensureSession(frame.targetId));
  }

  recordProtocolEvent(method: string, data: unknown, sessionId: string | null) {
    const eventData = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
    if (method === "Target.attachedToTarget") {
      const attachedSessionId = typeof eventData.sessionId === "string" ? eventData.sessionId : sessionId;
      const targetInfo =
        eventData.targetInfo && typeof eventData.targetInfo === "object" && !Array.isArray(eventData.targetInfo)
          ? (eventData.targetInfo as TargetInfo)
          : null;
      if (attachedSessionId && targetInfo?.targetId)
        this.recordTargetSession(targetInfo.targetId, attachedSessionId, targetInfo);
    } else if (method === "Target.detachedFromTarget") {
      const detachedSessionId = typeof eventData.sessionId === "string" ? eventData.sessionId : sessionId;
      if (detachedSessionId) this.forgetSession(detachedSessionId);
    } else if (method === "Target.targetInfoChanged") {
      const targetInfo =
        eventData.targetInfo && typeof eventData.targetInfo === "object" && !Array.isArray(eventData.targetInfo)
          ? (eventData.targetInfo as TargetInfo)
          : null;
      if (targetInfo?.targetId) this.recordTarget(targetInfo);
    } else if (method === "Target.targetDestroyed") {
      const targetId = typeof eventData.targetId === "string" ? eventData.targetId : null;
      if (targetId) this.forgetTarget(targetId);
    } else if (method === "Runtime.executionContextCreated") {
      const context =
        eventData.context && typeof eventData.context === "object" && !Array.isArray(eventData.context)
          ? (eventData.context as cdp.types.ts.Runtime.ExecutionContextDescription)
          : null;
      if (sessionId && typeof context?.id === "number") this.recordExecutionContext(sessionId, context);
    } else if (method === "Runtime.executionContextDestroyed") {
      const executionContextId = typeof eventData.executionContextId === "number" ? eventData.executionContextId : null;
      if (sessionId && executionContextId != null) this.forgetExecutionContextById(sessionId, executionContextId);
    } else if (method === "Runtime.executionContextsCleared") {
      if (sessionId) this.forgetExecutionContextsForSession(sessionId);
    } else if (method === "Page.frameNavigated" || method === "Page.frameDetached") {
      const frame =
        eventData.frame && typeof eventData.frame === "object" && !Array.isArray(eventData.frame)
          ? (eventData.frame as Record<string, unknown>)
          : null;
      const frameId =
        typeof eventData.frameId === "string" ? eventData.frameId : typeof frame?.id === "string" ? frame.id : null;
      if (sessionId && frameId) this.forgetExecutionContextsForFrame(sessionId, frameId);
    }
  }

  waitForExecutionContext(sessionId: string | null, { timeout_ms }: { timeout_ms?: number } = {}) {
    return this.waitForMatchingExecutionContext(
      (context) => context.sessionId === sessionId,
      sessionId,
      timeout_ms,
    ).then((context) => context.id);
  }

  async ensureExecutionContext(
    frame: { frameId: cdp.types.ts.Page.FrameId; targetId: cdp.types.ts.Target.TargetID },
    selector: ContextSelector = { world: "main" },
  ) {
    const sessionId = await this.ensureSession(frame.targetId);
    const existing = this.findExecutionContext(sessionId, frame.frameId, selector);
    if (existing) return existing;

    await this.send("Runtime.enable", {}, sessionId);
    if (selector.world === "isolated" || selector.world === "piercer") {
      const created = (await this.send(
        "Page.createIsolatedWorld",
        {
          frameId: frame.frameId,
          worldName: selector.worldName ?? (selector.world === "piercer" ? piercerWorldName : undefined),
          grantUniveralAccess: true,
        },
        sessionId,
      )) as cdp.types.ts.Page.CreateIsolatedWorldResult;
      return await this.waitForMatchingExecutionContext(
        (context) => context.sessionId === sessionId && context.id === created.executionContextId,
        sessionId,
      );
    }

    return await this.waitForMatchingExecutionContext(
      (context) =>
        context.sessionId === sessionId && context.frameId === frame.frameId && context.world === selector.world,
      sessionId,
    );
  }

  async getTopology(params: ModCDPGetTopologyParams = {}): Promise<ModCDPTopology> {
    const objectGroup = `modcdp-topology-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const targetInfos =
      ((await this.send("Target.getTargets")) as cdp.types.ts.Target.GetTargetsResult).targetInfos ?? [];
    for (const targetInfo of targetInfos) this.recordTarget(targetInfo);

    const rootTarget = this.resolveRootTarget(params, targetInfos);
    if (rootTarget == null) throw new Error("Mod.getTopology could not resolve a page target.");
    const frames = new Map<cdp.types.ts.Page.FrameId, ModCDPTopologyFrame>();
    const rootSessionId = await this.enableTarget(rootTarget.targetId);
    const rootTree = ((await this.send("Page.getFrameTree", {}, rootSessionId)) as cdp.types.ts.Page.GetFrameTreeResult)
      .frameTree;
    const rootFrameId = rootTree.frame.id;
    this.recordFrameTree(rootTree, rootTarget.targetId, null, frames);

    const oopifTargets = targetInfos.filter(
      (target) => target.type === "iframe" && target.parentFrameId && !frames.has(target.targetId),
    );
    await runTopologyQueue(oopifTargets, async (target) => {
      const sessionId = await this.enableTarget(target.targetId);
      const frameTree = ((await this.send("Page.getFrameTree", {}, sessionId)) as cdp.types.ts.Page.GetFrameTreeResult)
        .frameTree;
      this.recordFrameTree(frameTree, target.targetId, target.parentFrameId ?? null, frames);
    });

    await runTopologyQueue([...frames.entries()], async ([frameId, frame]) => {
      if (!frame.parentFrameId) return;
      const parent = frames.get(frame.parentFrameId);
      if (!parent) return;
      const parentSessionId = await this.ensureSession(parent.targetId);
      const owner = (await this.send(
        "DOM.getFrameOwner",
        { frameId },
        parentSessionId,
      )) as cdp.types.ts.DOM.GetFrameOwnerResult;
      if (owner.backendNodeId != null) frame.outerBackendNodeId = owner.backendNodeId;
    });

    const contexts = new Map<string, ModCDPTopologyExecutionContext>();
    const roots = new Map<cdp.types.ts.Runtime.RemoteObjectId, ModCDPTopologyDomRoot>();
    await runTopologyQueue([...frames.entries()], async ([frameId, frame]) => {
      const context = await this.ensureExecutionContext({ frameId, targetId: frame.targetId }, { world: "piercer" });
      contexts.set(context.uniqueId, context);
      const rootObject = (await this.send(
        "Runtime.evaluate",
        {
          expression: "document.documentElement",
          objectGroup,
          uniqueContextId: context.uniqueId,
        },
        context.sessionId,
      )) as cdp.types.ts.Runtime.EvaluateResult;
      const objectId = rootObject.result.objectId;
      if (!objectId) throw new Error(`Mod.getTopology could not resolve document root for frameId=${frameId}.`);
      const described = (await this.send(
        "DOM.describeNode",
        { objectId },
        context.sessionId,
      )) as cdp.types.ts.DOM.DescribeNodeResult;
      roots.set(objectId, {
        kind: "document",
        frameId,
        outerBackendNodeId: frame.outerBackendNodeId ?? null,
        innerBackendNodeId: described.node.backendNodeId ?? null,
        uniqueContextId: context.uniqueId,
      });
    });

    await runTopologyQueue([...new Set([...frames.values()].map((frame) => frame.targetId))], async (targetId) => {
      const sessionId = await this.ensureSession(targetId);
      const document = (await this.send(
        "DOM.getDocument",
        { depth: -1, pierce: true },
        sessionId,
      )) as cdp.types.ts.DOM.GetDocumentResult;
      await this.recordShadowRoots(document.root, frames, roots, objectGroup);
    });

    for (const context of this.contexts.values()) {
      if ([...frames.values()].some((frame) => frame.targetId === context.targetId))
        contexts.set(context.uniqueId, context);
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

  private resolveRootTarget(params: ModCDPGetTopologyParams, targetInfos: TargetInfo[]) {
    const requestedTargetId = params.rootTargetId ?? params.targetId ?? null;
    if (requestedTargetId) return targetInfos.find((target) => target.targetId === requestedTargetId) ?? null;
    return targetInfos.find((target) => target.type === "page" && !target.url.startsWith("devtools://")) ?? null;
  }

  private async enableTarget(targetId: cdp.types.ts.Target.TargetID) {
    const sessionId = await this.ensureSession(targetId);
    await Promise.all([
      this.send("Page.enable", {}, sessionId),
      this.send("DOM.enable", {}, sessionId),
      this.send("Runtime.enable", {}, sessionId),
    ]);
    return sessionId;
  }

  private recordFrameTree(
    tree: FrameTree,
    targetId: cdp.types.ts.Target.TargetID,
    parentFrameId: cdp.types.ts.Page.FrameId | null,
    frames: Map<cdp.types.ts.Page.FrameId, ModCDPTopologyFrame>,
  ) {
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
  ) {
    const currentFrameId = node.frameId ?? frameId;
    for (const shadowRoot of node.shadowRoots ?? []) {
      if (currentFrameId) {
        const frame = frames.get(currentFrameId);
        const context = frame
          ? this.findExecutionContext(await this.ensureSession(frame.targetId), currentFrameId, { world: "piercer" })
          : null;
        if (frame && context) {
          const resolved = (await this.send(
            "DOM.resolveNode",
            {
              backendNodeId: shadowRoot.backendNodeId,
              executionContextId: context.id,
              objectGroup,
            },
            context.sessionId,
          )) as cdp.types.ts.DOM.ResolveNodeResult;
          const objectId = resolved.object.objectId;
          if (objectId) {
            roots.set(objectId, {
              kind: "shadow",
              frameId: currentFrameId,
              outerBackendNodeId: hostBackendNodeId ?? node.backendNodeId ?? null,
              innerBackendNodeId: shadowRoot.backendNodeId ?? null,
              mode: shadowRoot.shadowRootType,
              uniqueContextId: context.uniqueId,
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

  private recordTarget(targetInfo: TargetInfo) {
    if (!targetInfo.targetId) return;
    const sessionId = this.sessionIdFromTargetId.get(targetInfo.targetId) ?? null;
    const topologyTarget: ModCDPTopologyTarget = {
      ...targetInfo,
      targetId: targetInfo.targetId,
      type: targetInfo.type,
      sessionId,
    };
    this.targets.set(targetInfo.targetId, topologyTarget);
  }

  private recordTargetSession(
    targetId: string,
    sessionId: string,
    targetInfo: TargetInfo | ModCDPTopologyTarget | null | undefined,
  ) {
    this.detached_sessions.delete(sessionId);
    this.sessionIdFromTargetId.set(targetId, sessionId);
    this.targetIdFromSessionId.set(sessionId, targetId);
    if (targetInfo) {
      this.session_targets.set(sessionId, targetInfo as Record<string, unknown>);
      this.targets.set(targetId, { ...(targetInfo as TargetInfo), targetId, type: targetInfo.type, sessionId });
    }
  }

  private recordExecutionContext(sessionId: string, context: cdp.types.ts.Runtime.ExecutionContextDescription) {
    if (this.detached_sessions.has(sessionId)) return;
    const targetId = this.targetIdFromSessionId.get(sessionId);
    if (!targetId) return;
    if (typeof context.id !== "number") return;
    if (!this.execution_contexts.has(sessionId)) this.execution_contexts.set(sessionId, context.id);
    if (!context.uniqueId) return;
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
    this.contexts.set(context.uniqueId, topologyContext);
    const waiters = this.execution_context_waiters.get(sessionId);
    if (!waiters) return;
    for (const waiter of [...waiters]) {
      if (!waiter.matches(topologyContext)) continue;
      waiters.delete(waiter);
      clearTimeout(waiter.timeout);
      waiter.resolve(topologyContext);
    }
    if (waiters.size === 0) this.execution_context_waiters.delete(sessionId);
  }

  private findExecutionContext(sessionId: string, frameId: string, selector: ContextSelector) {
    for (const context of this.contexts.values()) {
      if (context.sessionId !== sessionId || context.frameId !== frameId) continue;
      if (selector.world === "piercer" && context.world === "piercer") return context;
      if (selector.world === "isolated" && context.name === selector.worldName) return context;
      if (selector.world === "main" && context.world === "main") return context;
      if (context.world === selector.world) return context;
    }
    return null;
  }

  private waitForMatchingExecutionContext(
    matches: (context: ModCDPTopologyExecutionContext) => boolean,
    sessionId: string | null,
    timeoutMs = this.defaultExecutionContextTimeoutMs(),
  ) {
    for (const context of this.contexts.values()) {
      if (matches(context)) return Promise.resolve(context);
    }
    if (!sessionId) return Promise.reject(new Error("Cannot wait for a Runtime execution context without a session."));
    return new Promise<ModCDPTopologyExecutionContext>((resolve, reject) => {
      const waiter: ExecutionContextWaiter = {
        resolve,
        reject,
        matches,
        timeout: setTimeout(() => {
          const waiters = this.execution_context_waiters.get(sessionId);
          waiters?.delete(waiter);
          if (waiters?.size === 0) this.execution_context_waiters.delete(sessionId);
          reject(new Error(`Timed out waiting for Runtime.executionContextCreated for session ${sessionId}.`));
        }, timeoutMs),
      };
      const waiters = this.execution_context_waiters.get(sessionId);
      if (waiters) waiters.add(waiter);
      else this.execution_context_waiters.set(sessionId, new Set([waiter]));
    });
  }

  private forgetTarget(targetId: string) {
    const sessionId = this.sessionIdFromTargetId.get(targetId);
    if (sessionId) this.forgetSession(sessionId);
    this.targets.delete(targetId);
  }

  private forgetSession(sessionId: string) {
    const targetId = this.targetIdFromSessionId.get(sessionId);
    if (targetId) this.sessionIdFromTargetId.delete(targetId);
    this.targetIdFromSessionId.delete(sessionId);
    this.session_targets.delete(sessionId);
    this.forgetExecutionContextsForSession(sessionId);
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

  private forgetExecutionContextById(sessionId: string, executionContextId: number) {
    for (const [uniqueId, context] of this.contexts) {
      if (context.sessionId === sessionId && context.id === executionContextId) this.contexts.delete(uniqueId);
    }
    if (this.execution_contexts.get(sessionId) === executionContextId) this.execution_contexts.delete(sessionId);
  }

  private forgetExecutionContextsForSession(sessionId: string) {
    for (const [uniqueId, context] of this.contexts) {
      if (context.sessionId === sessionId) this.contexts.delete(uniqueId);
    }
    this.execution_contexts.delete(sessionId);
  }

  private forgetExecutionContextsForFrame(sessionId: string, frameId: string) {
    for (const [uniqueId, context] of this.contexts) {
      if (context.sessionId === sessionId && context.frameId === frameId) this.contexts.delete(uniqueId);
    }
  }

  private markDetachedSession(sessionId: string) {
    this.detached_sessions.delete(sessionId);
    this.detached_sessions.set(sessionId, true);
    while (this.detached_sessions.size > maxDetachedSessionGuards) {
      const oldestSessionId = this.detached_sessions.keys().next().value;
      if (!oldestSessionId) break;
      this.detached_sessions.delete(oldestSessionId);
    }
  }
}

async function runTopologyQueue<T>(items: Iterable<T>, worker: (item: T) => Promise<void>) {
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
