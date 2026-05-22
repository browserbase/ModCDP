import type { z } from "zod";
import type { cdp } from "../types/generated/cdp.js";
import type { CdpCommandSchema, CdpNamedSchema } from "../types/generated/zod/helpers.js";
import type { CdpDebuggeeCommandParams, ProtocolPayload } from "../types/modcdp.js";

export type TargetRoute = {
  targetId: cdp.types.ts.Target.TargetID;
  sessionId?: cdp.types.ts.Target.SessionID | null;
};

export type ServerUpstreamEventListener = (
  payload: ProtocolPayload,
  targetId: cdp.types.ts.Target.TargetID | null,
  sessionId: cdp.types.ts.Target.SessionID | null,
) => void;

export type ServerUpstreamTransport = {
  getTargets(): Promise<cdp.types.ts.Target.TargetInfo[]>;
  resolveTargetId(params: CdpDebuggeeCommandParams): Promise<cdp.types.ts.Target.TargetID | null>;
  createTarget(url: string): Promise<cdp.types.ts.Target.TargetID>;
  attachToTarget(targetId: cdp.types.ts.Target.TargetID): Promise<cdp.types.ts.Target.SessionID | null>;
  detachFromTarget(sessionId: cdp.types.ts.Target.SessionID): Promise<void>;
  send<
    Params extends z.ZodType<Record<string, unknown>>,
    Result extends z.ZodType<Record<string, unknown>>,
    Name extends string,
  >(
    command: CdpCommandSchema<Params, Result, Name>,
    params?: z.input<Params>,
    route?: TargetRoute,
  ): Promise<z.output<Result>>;
  on<Event extends CdpNamedSchema<z.ZodType>>(
    event: Event,
    listener: (
      payload: z.output<Event>,
      targetId: cdp.types.ts.Target.TargetID | null,
      sessionId: cdp.types.ts.Target.SessionID | null,
    ) => void,
  ): { remove: () => void };
};
