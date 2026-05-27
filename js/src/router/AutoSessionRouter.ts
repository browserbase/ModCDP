// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/router/AutoSessionRouter.py
// - ./go/modcdp/router/AutoSessionRouter.go
import type { cdp } from "../types/generated/cdp.js";
import type { z } from "zod";
import * as DOM from "../types/generated/zod/DOM.js";
import * as Page from "../types/generated/zod/Page.js";
import * as Runtime from "../types/generated/zod/Runtime.js";
import * as Target from "../types/generated/zod/Target.js";
import type { TargetRoute, UpstreamTransport } from "../transport/UpstreamTransport.js";
import type { CDPTypes } from "../types/CDPTypes.js";
import { modCDPToJSON } from "../types/toJSON.js";
import {
  CdpDebuggeeCommandParamsSchema,
  type CdpDebuggeeCommandParams,
  type ModCDPGetTopologyParams,
  type ModCDPRouterConfig,
  ModCDPRouterConfigSchema,
  type ModCDPRoutes,
  type ModCDPTopology,
  type ModCDPTopologyDomRoot,
  type ModCDPTopologyExecutionContext,
  type ModCDPTopologyFrame,
  type ModCDPTopologyTarget,
  type ProtocolParams,
  type ProtocolResult,
} from "../types/modcdp.js";

type FrameTree = cdp.types.ts.Page.FrameTree;
type DomNode = cdp.types.ts.DOM.Node;
type TargetInfo = cdp.types.ts.Target.TargetInfo;
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
type AutoSessionRouterConfig = z.input<typeof ModCDPRouterConfigSchema> & {
  upstream: UpstreamTransport;
  types: CDPTypes;
};

const topologyConcurrency = 8;
const piercerWorldName = "__modcdp_piercer__";
const DEFAULT_CLIENT_ROUTER_ROUTES = {
  "Mod.*": "service_worker",
  "Custom.*": "service_worker",
  "*.*": "service_worker",
} satisfies ModCDPRoutes;

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
 * live behind the UpstreamTransport interface.
 *
 * State machine:
 * 1. Target records arrive from Target.getTargets or target-info events.
 * 2. ensureRouteForTarget attaches a target and records either a native session id
 *    or a sessionless attached target supplied by the upstream.
 * 3. Runtime/Page events add or invalidate execution context records.
 * 4. Frame detach, navigation, target detach, and target destroy events remove
 *    only the state affected by the browser event.
 */
class AutoSessionRouter {
  config: ModCDPRouterConfig;

  // TargetID -> native flattened Target.SessionID. Updated by ensureRouteForTarget
  // and Target.attachedToTarget events; read by routing, injectors, and topology.
  readonly sessionId_from_targetId = new Map<cdp.types.ts.Target.TargetID, cdp.types.ts.Target.SessionID>();

  // Native flattened Target.SessionID -> TargetID. Updated with
  // sessionId_from_targetId; read when events arrive with only a session id.
  readonly targetId_from_sessionId = new Map<cdp.types.ts.Target.SessionID, cdp.types.ts.Target.TargetID>();

  // TargetID -> latest target metadata plus router-owned session metadata.
  // Updated from target discovery/events; read by topology and target selection.
  readonly targets = new Map<cdp.types.ts.Target.TargetID, ModCDPTopologyTarget>();

  // Context key -> execution context. The key is Chrome's uniqueId when present,
  // otherwise target/session plus context id. Updated by Runtime events and by
  // Page.createIsolatedWorld; read by waits, DOM root resolution, and topology.
  readonly contexts = new Map<string, ModCDPTopologyExecutionContext>();

  // Context waiters keyed by native session id or by target id for sessionless
  // upstreams. Added by waitForExecutionContextMatching and resolved/rejected by
  // recordExecutionContext and invalidation methods.
  private readonly execution_context_waiters = new Map<string, Set<ExecutionContextWaiter>>();

  // Semantic upstream selected by the owner. The router calls methods on this
  // object but never mutates transport-owned private state.
  private readonly upstream: UpstreamTransport;

  // Protocol registry used only for native command schema lookup/validation
  // before routing. The router does not own custom command behavior or aliases.
  private readonly types: CDPTypes;

  private subscription_cleanup: (() => void) | null = null;

  constructor({ upstream, types, ...config }: AutoSessionRouterConfig) {
    this.upstream = upstream;
    this.types = types;
    this.config = ModCDPRouterConfigSchema.parse({
      ...config,
      router_routes: {
        ...DEFAULT_CLIENT_ROUTER_ROUTES,
        ...(config.router_routes ?? {}),
      },
    });
  }

  /** Install routing event listeners and enable browser-side target discovery. */
  async start() {
    if (this.subscription_cleanup) return;
    const subscription_cleanup = this.listen();
    this.subscription_cleanup = subscription_cleanup;
    try {
      await Promise.all([
        this.upstream.send(Target.SetAutoAttachCommand, targetAutoAttachParams),
        this.upstream.send(Target.SetDiscoverTargetsCommand, { discover: true }),
      ]);
    } catch (error) {
      if (this.subscription_cleanup === subscription_cleanup) {
        subscription_cleanup();
        this.subscription_cleanup = null;
      }
      throw error;
    }
  }

  stop() {
    this.subscription_cleanup?.();
    this.subscription_cleanup = null;
  }

  toJSON() {
    return modCDPToJSON(this, {
      config: {
        router_routes: this.config.router_routes,
        loopback_execution_context_timeout_ms: this.config.loopback_execution_context_timeout_ms,
      },
      state: {
        started: this.subscription_cleanup != null,
        sessions: this.sessionId_from_targetId.size,
        targets: this.targets.size,
        contexts: this.contexts.size,
        execution_context_waiters: this.execution_context_waiters.size,
      },
    });
  }

  /** Route a CDP command using router-owned target/session policy. */
  async send(
    method: string,
    params: ProtocolParams = {},
    requestedSessionId: cdp.types.ts.Target.SessionID | null = null,
  ): Promise<ProtocolResult> {
    const command = this.types.nativeCommandSchema(method);
    if (!command) throw new Error(`AutoSessionRouter cannot route unknown CDP command ${method}.`);
    const domain = command.id.split(".")[0] ?? "";
    if (requestedSessionId != null) {
      const targetId = this.targetId_from_sessionId.get(requestedSessionId);
      if (!targetId) throw new Error(`No target is recorded for sessionId=${requestedSessionId}.`);
      const route = {
        targetId,
        sessionId: requestedSessionId,
      };
      const routed_params =
        command.id === Runtime.CallFunctionOnCommand.id
          ? await this.callFunctionOnParamsForRoute(params, route)
          : params;
      return await this.upstream.send(command, routed_params, route);
    }
    if (domain === "Browser" || domain === "Target" || domain === "SystemInfo")
      return await this.upstream.send(command, params);
    const route = await this.ensureRouteForTarget(
      await this.resolveTargetId(CdpDebuggeeCommandParamsSchema.parse(params)),
    );
    const routed_params =
      command.id === Runtime.CallFunctionOnCommand.id ? await this.callFunctionOnParamsForRoute(params, route) : params;
    return await this.upstream.send(command, routed_params, route);
  }

  /** Ensure a target has a real native flattened CDP session id. */
  async ensureSessionForTarget(targetId: cdp.types.ts.Target.TargetID): Promise<cdp.types.ts.Target.SessionID> {
    const route = await this.ensureRouteForTarget(targetId);
    if (route.sessionId == null) throw new Error(`Upstream attached targetId=${targetId} without a CDP session id.`);
    return route.sessionId;
  }

  /** Ensure a target is addressable by the selected upstream. */
  async ensureRouteForTarget(targetId: cdp.types.ts.Target.TargetID | null): Promise<TargetRoute> {
    targetId ??= await this.resolveTargetId(CdpDebuggeeCommandParamsSchema.parse({}));
    const sessionId = targetId ? this.sessionId_from_targetId.get(targetId) : null;
    if (targetId && sessionId != null) return { targetId, sessionId };
    const target = targetId ? this.targets.get(targetId) : null;
    if (targetId && target?.sessionId === null) return { targetId, sessionId: null };
    targetId ??= await this.upstream.createTarget("about:blank#modcdp");
    const attachedSessionId = await this.upstream.attachToTarget(targetId);
    if (attachedSessionId == null) {
      this.recordTargetSessionlessAttachment(targetId);
      return { targetId, sessionId: null };
    }
    this.recordTargetSession(targetId, attachedSessionId, this.targets.get(targetId));
    return { targetId, sessionId: attachedSessionId };
  }

  private listen() {
    const subscriptions = [
      this.upstream.on(Target.AttachedToTargetEvent, (event) =>
        this.recordTargetSession(event.targetInfo.targetId, event.sessionId, event.targetInfo),
      ),
      this.upstream.on(Target.DetachedFromTargetEvent, (event) => this.forgetSession(event.sessionId)),
      this.upstream.on(Target.TargetInfoChangedEvent, (event) => this.recordTarget(event.targetInfo)),
      this.upstream.on(Target.TargetDestroyedEvent, (event) => this.forgetTarget(event.targetId)),
      this.upstream.on(Runtime.ExecutionContextCreatedEvent, (event, targetId, sessionId) => {
        this.recordExecutionContext(targetId, sessionId, event.context);
      }),
      this.upstream.on(Runtime.ExecutionContextDestroyedEvent, (event, _targetId, sessionId) => {
        if (sessionId) this.forgetExecutionContextById(sessionId, event.executionContextId);
      }),
      this.upstream.on(Runtime.ExecutionContextsClearedEvent, (_event, _targetId, sessionId) => {
        if (sessionId) this.forgetExecutionContextsForRoute(sessionId);
      }),
      this.upstream.on(Page.FrameNavigatedEvent, (event, targetId, sessionId) => {
        this.forgetExecutionContextsForFrame(sessionId, targetId, event.frame.id);
      }),
      this.upstream.on(Page.FrameDetachedEvent, (event, targetId, sessionId) => {
        this.forgetExecutionContextsForFrame(sessionId, targetId, event.frameId);
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }

  /** Wait for the first execution context associated with a real session id. */
  waitForExecutionContext(sessionId: string | null, { timeout_ms }: { timeout_ms?: number } = {}): Promise<number> {
    return this.waitForExecutionContextMatching(
      (context) => context.sessionId === sessionId,
      sessionId,
      timeout_ms,
    ).then((context) => context.id);
  }

  private async callFunctionOnParamsForRoute(params: ProtocolParams, route: TargetRoute): Promise<ProtocolParams> {
    const call_params = Runtime.CallFunctionOnCommand.params.parse(params);
    // objectId and uniqueContextId already pin the call to a browser-owned
    // context. Only inject executionContextId for global calls that need the
    // route's current Runtime context.
    if (call_params.executionContextId != null || call_params.uniqueContextId != null || call_params.objectId != null)
      return call_params;
    const context = await this.waitForExecutionContextMatching(
      (current_context) =>
        current_context.targetId === route.targetId &&
        (route.sessionId == null || current_context.sessionId === route.sessionId),
      route.sessionId ?? route.targetId,
    );
    return {
      ...call_params,
      executionContextId: context.id,
    };
  }

  /** Ensure the requested execution context exists for a frame. */
  async ensureExecutionContext(
    frame: {
      frameId: cdp.types.ts.Page.FrameId;
      targetId: cdp.types.ts.Target.TargetID;
    },
    selector: ContextSelector = { world: "main" },
  ): Promise<ModCDPTopologyExecutionContext> {
    const route = await this.ensureRouteForTarget(frame.targetId);
    const existing = this.findExecutionContext(route.targetId, route.sessionId, frame.frameId, selector);
    if (existing) return existing;

    await this.upstream.send(Runtime.EnableCommand, {}, route);
    if (selector.world === "isolated" || selector.world === "piercer") {
      const created = await this.upstream.send(
        Page.CreateIsolatedWorldCommand,
        {
          frameId: frame.frameId,
          worldName: selector.worldName ?? (selector.world === "piercer" ? piercerWorldName : undefined),
          grantUniveralAccess: true,
        },
        route,
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

    return await this.waitForExecutionContextMatching(
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
    const rootTree = (await this.upstream.send(Page.GetFrameTreeCommand, {}, rootRoute)).frameTree;
    const rootFrameId = rootTree.frame.id;
    this.recordFrameTree(rootTree, rootTarget.targetId, null, frames);

    const oopifTargets = targetInfos.filter(
      (target) => target.type === "iframe" && target.parentFrameId && !frames.has(target.targetId),
    );
    await runTopologyQueue(oopifTargets, async (target) => {
      const route = await this.enableTarget(target.targetId);
      const frameTree = (await this.upstream.send(Page.GetFrameTreeCommand, {}, route)).frameTree;
      this.recordFrameTree(frameTree, target.targetId, target.parentFrameId ?? null, frames);
    });

    await runTopologyQueue([...frames.entries()], async ([frameId, frame]) => {
      if (!frame.parentFrameId) return;
      const parent = frames.get(frame.parentFrameId);
      if (!parent) return;
      const parentRoute = await this.ensureRouteForTarget(parent.targetId);
      const owner = await this.upstream.send(DOM.GetFrameOwnerCommand, { frameId }, parentRoute);
      if (owner.backendNodeId != null) frame.outerBackendNodeId = owner.backendNodeId;
    });

    const contexts = new Map<string, ModCDPTopologyExecutionContext>();
    const roots = new Map<cdp.types.ts.Runtime.RemoteObjectId, ModCDPTopologyDomRoot>();
    await runTopologyQueue([...frames.entries()], async ([frameId, frame]) => {
      const context = await this.ensureExecutionContext({ frameId, targetId: frame.targetId }, { world: "piercer" });
      contexts.set(this.contextKey(context.targetId, context.sessionId ?? null, context.id, context.uniqueId), context);
      const rootObject = await this.upstream.send(
        Runtime.EvaluateCommand,
        {
          expression: "document.documentElement",
          objectGroup,
          ...(context.uniqueId ? { uniqueContextId: context.uniqueId } : { contextId: context.id }),
        },
        context,
      );
      const objectId = rootObject.result.objectId;
      if (!objectId) throw new Error(`Mod.getTopology could not resolve document root for frameId=${frameId}.`);
      const node = (
        await this.upstream.send(
          DOM.DescribeNodeCommand,
          {
            objectId,
          },
          context,
        )
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
      const route = await this.ensureRouteForTarget(targetId);
      const document = await this.upstream.send(
        DOM.GetDocumentCommand,
        {
          depth: -1,
          pierce: true,
        },
        route,
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
    const tabId = params.debuggee?.tabId ?? params.tabId ?? null;
    if (typeof tabId === "number" && globalThis.chrome?.tabs?.get) {
      const tab = await globalThis.chrome.tabs.get(tabId);
      const tabUrl = tab.url || tab.pendingUrl || null;
      if (tabUrl) {
        const targetId = targetInfos.find((target) => target.type === "page" && target.url === tabUrl)?.targetId;
        if (targetId) return targetId;
      }
    }
    return (
      targetInfos.find((target) => target.type === "page" && !target.url.startsWith("devtools://"))?.targetId ?? null
    );
  }

  private async enableTarget(targetId: cdp.types.ts.Target.TargetID): Promise<TargetRoute> {
    const route = await this.ensureRouteForTarget(targetId);
    await Promise.all([
      this.upstream.send(Page.EnableCommand, {}, route),
      this.upstream.send(DOM.EnableCommand, {}, route),
      this.upstream.send(Runtime.EnableCommand, {}, route),
      this.upstream.send(Target.SetAutoAttachCommand, targetAutoAttachParams, route).catch(() => ({})),
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
          ? this.findExecutionContext(frame.targetId, null, currentFrameId, {
              world: "piercer",
            })
          : null;
        if (frame && context) {
          const objectId = (
            await this.upstream.send(
              DOM.ResolveNodeCommand,
              {
                backendNodeId: shadowRoot.backendNodeId,
                executionContextId: context.id,
                objectGroup,
              },
              context,
            )
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
    const sessionId = this.sessionId_from_targetId.get(targetInfo.targetId);
    const existing = this.targets.get(targetInfo.targetId);
    const target: ModCDPTopologyTarget = {
      ...targetInfo,
      targetId: targetInfo.targetId,
      type: targetInfo.type,
    };
    if (sessionId !== undefined) target.sessionId = sessionId;
    else if (existing?.sessionId === null) target.sessionId = null;
    this.targets.set(targetInfo.targetId, target);
  }

  private recordTargetSession(
    targetId: cdp.types.ts.Target.TargetID,
    sessionId: cdp.types.ts.Target.SessionID,
    targetInfo: TargetInfo | ModCDPTopologyTarget | null | undefined,
  ): void {
    this.sessionId_from_targetId.set(targetId, sessionId);
    this.targetId_from_sessionId.set(sessionId, targetId);
    const target = targetInfo
      ? { ...targetInfo, targetId, type: targetInfo.type, sessionId }
      : {
          targetId,
          type: this.targets.get(targetId)?.type ?? "page",
          sessionId,
        };
    this.targets.set(targetId, target);
  }

  private recordTargetSessionlessAttachment(targetId: cdp.types.ts.Target.TargetID): void {
    const existing = this.targets.get(targetId);
    this.targets.set(
      targetId,
      existing ? { ...existing, sessionId: null } : { targetId, type: "page", sessionId: null },
    );
  }

  private recordExecutionContext(
    eventTargetId: cdp.types.ts.Target.TargetID | null,
    sessionId: cdp.types.ts.Target.SessionID | null,
    context: cdp.types.ts.Runtime.ExecutionContextDescription,
  ): void {
    const targetId = eventTargetId ?? (sessionId ? (this.targetId_from_sessionId.get(sessionId) ?? null) : null);
    if (!targetId) return;
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

  private waitForExecutionContextMatching(
    matches: (context: ModCDPTopologyExecutionContext) => boolean,
    waiterKey: string | null,
    timeoutMs = this.config.loopback_execution_context_timeout_ms,
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
    const sessionId = this.sessionId_from_targetId.get(targetId);
    if (sessionId) this.forgetSession(sessionId);
    this.targets.delete(targetId);
    this.forgetExecutionContextsForRoute(targetId);
  }

  private forgetSession(sessionId: cdp.types.ts.Target.SessionID): void {
    const targetId = this.targetId_from_sessionId.get(sessionId);
    if (targetId) this.sessionId_from_targetId.delete(targetId);
    this.targetId_from_sessionId.delete(sessionId);
    this.forgetExecutionContextsForRoute(sessionId);
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
  }

  private forgetExecutionContextsForRoute(routeKey: string): void {
    for (const [contextKey, context] of this.contexts) {
      if (context.sessionId === routeKey || context.targetId === routeKey) this.contexts.delete(contextKey);
    }
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

export { DEFAULT_CLIENT_ROUTER_ROUTES, AutoSessionRouter };
export type { AutoSessionRouterConfig };
