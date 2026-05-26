import type { cdp } from "../types/generated/cdp.js";
import { commands as nativeCommandSchemas } from "../types/generated/zod.js";
import type { CdpCommandSchema } from "../types/generated/zod/helpers.js";
import * as Runtime from "../types/generated/zod/Runtime.js";
import * as Target from "../types/generated/zod/Target.js";
import type { ServerUpstreamTransport, TargetRoute } from "../server/ServerUpstreamTransport.js";
import {
  CdpDebuggeeCommandParamsSchema,
  type CdpDebuggeeCommandParams,
  type ProtocolParams,
  type ProtocolResult,
} from "../types/modcdp.js";

type TargetInfo = cdp.types.ts.Target.TargetInfo;
type RecordedTarget = Partial<TargetInfo> & {
  targetId: cdp.types.ts.Target.TargetID;
  type: string;
  sessionId?: cdp.types.ts.Target.SessionID | null;
};
type ExecutionContextWaiter = {
  resolve: (context_id: cdp.types.ts.Runtime.ExecutionContextId) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const native_commands_by_id: ReadonlyMap<string, CdpCommandSchema> = new Map(
  Object.values(nativeCommandSchemas).map((command) => [command.id, command]),
);

/**
 * Owns ModCDP's browser graph and target/session/context routing policy.
 *
 * AutoSessionRouter records Target/Page/Runtime events, maintains the current
 * target-to-session graph, and hydrates target routes on demand. It does not
 * know how commands are physically delivered. Loopback WebSocket request ids,
 * chrome.debugger debuggee selection, native event source normalization, and
 * upstream setup all live behind the ServerUpstreamTransport interface.
 *
 * State machine:
 * 1. Target records arrive from Target.getTargets or target-info events.
 * 2. ensureRouteForTarget attaches a target and records either a native session id
 *    or a sessionless attached target supplied by the upstream.
 * 3. Runtime events add or invalidate execution context records.
 * 4. Target detach and target destroy events remove only the state affected by
 *    the browser event.
 */
export class AutoSessionRouter {
  // TargetID -> native flattened Target.SessionID. Updated by ensureRouteForTarget
  // and Target.attachedToTarget events; read by routing and injectors.
  readonly sessionId_from_targetId = new Map<cdp.types.ts.Target.TargetID, cdp.types.ts.Target.SessionID>();

  // Native flattened Target.SessionID -> TargetID. Updated with
  // sessionId_from_targetId; read when events arrive with only a session id.
  readonly targetId_from_sessionId = new Map<cdp.types.ts.Target.SessionID, cdp.types.ts.Target.TargetID>();

  // TargetID -> latest target metadata plus router-owned session metadata.
  // Updated from target discovery/events; read by target selection.
  readonly targets = new Map<cdp.types.ts.Target.TargetID, RecordedTarget>();

  // SessionID -> first Runtime execution context id observed for that session.
  // Updated by Runtime.executionContextCreated; read by ModCDPClient injectors.
  readonly execution_contexts = new Map<cdp.types.ts.Target.SessionID, cdp.types.ts.Runtime.ExecutionContextId>();

  // Context waiters keyed by native session id. Added by waitForExecutionContext
  // and resolved/rejected by recordExecutionContext and invalidation methods.
  private readonly execution_context_waiters = new Map<string, Set<ExecutionContextWaiter>>();

  // Semantic upstream selected by the owner. The router calls methods on this
  // object but never mutates transport-owned private state.
  private readonly upstream: ServerUpstreamTransport;

  // Timeout in milliseconds for Runtime.executionContextCreated waits. Set once
  // by the owner when constructing the router; read when installing a new
  // execution-context waiter.
  private readonly loopback_execution_context_timeout_ms: number;

  constructor({
    upstream,
    loopback_execution_context_timeout_ms,
  }: {
    upstream: ServerUpstreamTransport;
    loopback_execution_context_timeout_ms: number;
  }) {
    this.upstream = upstream;
    this.loopback_execution_context_timeout_ms = loopback_execution_context_timeout_ms;
  }

  /** Route a CDP command using router-owned target/session policy. */
  async send(
    method: string,
    params: ProtocolParams = {},
    requestedSessionId: cdp.types.ts.Target.SessionID | null = null,
  ): Promise<ProtocolResult> {
    const command = native_commands_by_id.get(method);
    if (!command) throw new Error(`AutoSessionRouter cannot route unknown CDP command ${method}.`);
    const commandParams = command.params.parse(params);
    const domain = command.id.split(".")[0] ?? "";
    if (domain === "Browser" || domain === "Target" || domain === "SystemInfo")
      return await this.upstream.send(command, commandParams);
    if (requestedSessionId != null) {
      const targetId = this.targetId_from_sessionId.get(requestedSessionId);
      if (!targetId) throw new Error(`No target is recorded for sessionId=${requestedSessionId}.`);
      return await this.upstream.send(command, commandParams, { targetId, sessionId: requestedSessionId });
    }
    const route = await this.ensureRouteForTarget(
      await this.resolveTargetId(CdpDebuggeeCommandParamsSchema.parse(params)),
    );
    return await this.upstream.send(command, commandParams, route);
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

  /** Subscribe this router to the selected upstream's normalized CDP events. */
  listen(): { remove: () => void } {
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
    ];
    return { remove: () => subscriptions.forEach((subscription) => subscription.remove()) };
  }

  /** Wait for the first execution context associated with a real session id. */
  waitForExecutionContext(sessionId: string | null, { timeout_ms }: { timeout_ms?: number } = {}): Promise<number> {
    const effective_timeout_ms = timeout_ms ?? this.loopback_execution_context_timeout_ms;
    if (!sessionId) return Promise.reject(new Error("Cannot wait for a Runtime execution context without a session."));
    const existing = this.execution_contexts.get(sessionId);
    if (existing != null) return Promise.resolve(existing);
    return new Promise<number>((resolve, reject) => {
      const waiter: ExecutionContextWaiter = {
        resolve,
        reject,
        timeout: setTimeout(() => {
          const waiters = this.execution_context_waiters.get(sessionId);
          waiters?.delete(waiter);
          if (waiters?.size === 0) this.execution_context_waiters.delete(sessionId);
          reject(new Error(`Timed out waiting for Runtime.executionContextCreated for session ${sessionId}.`));
        }, effective_timeout_ms),
      };
      const waiters = this.execution_context_waiters.get(sessionId);
      if (waiters) waiters.add(waiter);
      else this.execution_context_waiters.set(sessionId, new Set([waiter]));
    });
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

  private recordTarget(targetInfo: TargetInfo): void {
    const sessionId = this.sessionId_from_targetId.get(targetInfo.targetId);
    const existing = this.targets.get(targetInfo.targetId);
    const target: RecordedTarget = {
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
    targetInfo: TargetInfo | RecordedTarget | null | undefined,
  ): void {
    this.sessionId_from_targetId.set(targetId, sessionId);
    this.targetId_from_sessionId.set(sessionId, targetId);
    const target = targetInfo
      ? { ...targetInfo, targetId, type: targetInfo.type, sessionId }
      : { targetId, type: this.targets.get(targetId)?.type ?? "page", sessionId };
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
    if (sessionId && !this.execution_contexts.has(sessionId)) this.execution_contexts.set(sessionId, context.id);
    const waiters = sessionId ? this.execution_context_waiters.get(sessionId) : null;
    if (!waiters) return;
    for (const waiter of [...waiters]) {
      waiters.delete(waiter);
      clearTimeout(waiter.timeout);
      waiter.resolve(context.id);
    }
    if (waiters.size === 0 && sessionId) this.execution_context_waiters.delete(sessionId);
  }

  private forgetTarget(targetId: cdp.types.ts.Target.TargetID): void {
    const sessionId = this.sessionId_from_targetId.get(targetId);
    if (sessionId) this.forgetSession(sessionId);
    this.targets.delete(targetId);
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
    if (this.execution_contexts.get(routeKey) === executionContextId) this.execution_contexts.delete(routeKey);
  }

  private forgetExecutionContextsForRoute(routeKey: string): void {
    this.execution_contexts.delete(routeKey);
  }
}
