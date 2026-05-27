/// <reference types="chrome" />

import { z } from "zod";

const isZodType = (value: unknown): value is z.ZodType =>
  value != null && typeof value === "object" && typeof (value as z.ZodType).parse === "function";

const CdpCommandParamsSchema = z.object({}).passthrough();
type CdpCommandParams = z.infer<typeof CdpCommandParamsSchema>;

const CdpCommandResultSchema = z.object({}).passthrough();
type CdpCommandResult = z.infer<typeof CdpCommandResultSchema>;

const CdpEventParamsSchema = z.object({}).passthrough();
type CdpEventParams = z.infer<typeof CdpEventParamsSchema>;

const RuntimeBindingCalledEventSchema = z
  .object({
    name: z.string(),
    payload: z.string(),
    executionContextId: z.number().optional(),
  })
  .passthrough();
type RuntimeBindingCalledEvent = z.infer<typeof RuntimeBindingCalledEventSchema>;

const TargetAttachedToTargetEventSchema = z
  .object({
    sessionId: z.string(),
    targetInfo: z.object({ targetId: z.string() }).passthrough(),
    waitingForDebugger: z.boolean(),
  })
  .passthrough();
type TargetAttachedToTargetEvent = z.infer<typeof TargetAttachedToTargetEventSchema>;

const ModCDPRoutesSchema = z.object({}).catchall(z.string());
type ModCDPRoutes = z.infer<typeof ModCDPRoutesSchema>;

const ModCDPRouterOptionsSchema = z
  .object({
    router_routes: ModCDPRoutesSchema.optional(),
    loopback_execution_context_timeout_ms: z.number().positive().optional(),
  })
  .passthrough();
type ModCDPRouterOptions = z.infer<typeof ModCDPRouterOptionsSchema>;

const ModCDPCustomPayloadSchema = z.object({}).passthrough();
type ModCDPCustomPayload = z.infer<typeof ModCDPCustomPayloadSchema>;

type ModCDPNamedValue = {
  cdp_command_name?: string;
  cdp_event_name?: string;
  id?: string;
  name?: string;
  meta?: () =>
    | {
        cdp_command_name?: unknown;
        cdp_event_name?: unknown;
        id?: unknown;
        name?: unknown;
      }
    | undefined;
};

function normalizeModCDPName(value: ModCDPName) {
  if (typeof value === "string") return value;
  const meta = typeof value?.meta === "function" ? value.meta() : undefined;
  const name =
    value?.cdp_command_name ??
    value?.cdp_event_name ??
    (typeof meta?.cdp_command_name === "string" ? meta.cdp_command_name : undefined) ??
    (typeof meta?.cdp_event_name === "string" ? meta.cdp_event_name : undefined) ??
    value?.id ??
    (typeof meta?.id === "string" ? meta.id : undefined) ??
    (typeof meta?.name === "string" ? meta.name : undefined) ??
    value?.name;
  if (typeof name !== "string" || !name) throw new Error("Expected a CDP name string or named CDP schema.");
  return name;
}

const ModCDPNameSchema = z.custom<string | ModCDPNamedValue>((value) => {
  try {
    normalizeModCDPName(value as ModCDPName);
    return true;
  } catch {
    return false;
  }
});
type ModCDPName = z.infer<typeof ModCDPNameSchema>;

const ModCDPZodTypeSchema = z.custom<z.ZodType>(isZodType);
type ModCDPZodType = z.infer<typeof ModCDPZodTypeSchema>;

const ModCDPPayloadJsonSchemaSchema = z.record(z.string(), z.unknown());
const ModCDPPayloadShapeSchema = z.record(z.string(), ModCDPZodTypeSchema);
type ModCDPPayloadShape = z.infer<typeof ModCDPPayloadShapeSchema>;

const ModCDPPayloadSchemaSpecSchema = z.union([
  ModCDPZodTypeSchema,
  ModCDPPayloadShapeSchema,
  ModCDPPayloadJsonSchemaSchema,
]);
type ModCDPPayloadSchemaSpec = z.infer<typeof ModCDPPayloadSchemaSpecSchema>;

function validateZodSchema(schema: ModCDPPayloadSchemaSpec | null | undefined) {
  if (!schema) return null;
  if (isZodType(schema)) return schema;
  if (Object.values(schema).every(isZodType)) return z.object(schema as ModCDPPayloadShape).passthrough();
  if (typeof schema === "object") {
    const zod_schema = z.fromJSONSchema(schema);
    return isScalarJsonSchema(schema) ? z.object({ value: zod_schema }).passthrough() : zod_schema;
  }
  throw new Error("Unsupported payload schema; pass a Zod schema, Zod shape, or object JSON schema.");
}

function isScalarJsonSchema(schema: Record<string, unknown>) {
  return (
    typeof schema.type === "string" &&
    !["object", "array"].includes(schema.type) &&
    !("properties" in schema) &&
    !("items" in schema)
  );
}

const ModCDPEvaluateParamsSchema = z.object({
  expression: z.string(),
  params: ModCDPCustomPayloadSchema.optional(),
  cdpSessionId: z.string().nullable().optional(),
});
type ModCDPEvaluateParams = z.infer<typeof ModCDPEvaluateParamsSchema>;

const ModCDPAddCustomCommandParamsSchema = z.object({
  name: ModCDPNameSchema,
  expression: z.string().nullable().optional(),
  params_schema: ModCDPPayloadSchemaSpecSchema.nullable().optional(),
  result_schema: ModCDPPayloadSchemaSpecSchema.nullable().optional(),
});
type ModCDPAddCustomCommandParams = z.infer<typeof ModCDPAddCustomCommandParamsSchema>;

const ModCDPAddCustomEventObjectParamsSchema = z.object({
  name: ModCDPNameSchema,
  event_schema: ModCDPPayloadSchemaSpecSchema.nullable().optional(),
});
type ModCDPAddCustomEventObjectParams = z.infer<typeof ModCDPAddCustomEventObjectParamsSchema>;
const ModCDPAddCustomEventParamsSchema = z.union([ModCDPZodTypeSchema, ModCDPAddCustomEventObjectParamsSchema]);
type ModCDPAddCustomEventParams = z.infer<typeof ModCDPAddCustomEventParamsSchema>;

const ModCDPAddMiddlewareParamsSchema = z.object({
  name: ModCDPNameSchema.optional(),
  phase: z.enum(["request", "response", "event"]),
  expression: z.string(),
});
type ModCDPAddMiddlewareParams = z.infer<typeof ModCDPAddMiddlewareParamsSchema>;

const ModCDPLauncherOptionsSchema = z.object({}).passthrough();
type ModCDPLauncherOptions = z.infer<typeof ModCDPLauncherOptionsSchema>;

const ModCDPUpstreamOptionsSchema = z
  .object({
    upstream_mode: z.enum(["ws", "pipe", "nativemessaging", "reversews", "nats", "chromedebugger"]).optional(),
    upstream_ws_cdp_url: z.string().nullable().optional(),
    upstream_nats_url: z.string().nullable().optional(),
    upstream_nats_subject_prefix: z.string().nullable().optional(),
    upstream_nats_wait_timeout_ms: z.number().positive().optional(),
    upstream_reversews_bind: z.string().nullable().optional(),
    upstream_reversews_wait_timeout_ms: z.number().positive().optional(),
    upstream_nativemessaging_host_name: z.string().nullable().optional(),
    upstream_ws_connect_error_settle_timeout_ms: z.number().positive().optional(),
  })
  .passthrough();
type ModCDPUpstreamOptions = z.infer<typeof ModCDPUpstreamOptionsSchema>;

const ModCDPClientOptionsSchema = z
  .object({
    client_hydrate_aliases: z.boolean().optional(),
    client_mirror_upstream_events: z.boolean().optional(),
    client_cdp_send_timeout_ms: z.number().positive().optional(),
    client_event_wait_timeout_ms: z.number().positive().optional(),
    client_heartbeat_interval_ms: z.number().positive().optional(),
  })
  .passthrough();
type ModCDPClientOptions = z.infer<typeof ModCDPClientOptionsSchema>;

const ModCDPDownstreamOptionsSchema = z
  .object({
    downstream_client_timeout_ms: z.number().positive().optional(),
    downstream_close_browser_on_disconnect: z.boolean().optional(),
  })
  .passthrough();
type ModCDPDownstreamOptions = z.infer<typeof ModCDPDownstreamOptionsSchema>;

const ModCDPServerOptionsSchema = z
  .object({
    upstream: ModCDPUpstreamOptionsSchema.optional(),
    router: ModCDPRouterOptionsSchema.optional(),
    client_options: ModCDPClientOptionsSchema.optional(),
    downstream: ModCDPDownstreamOptionsSchema.optional(),
    server_browser_token: z.string().nullable().optional(),
    custom_commands: z.array(ModCDPAddCustomCommandParamsSchema).optional(),
    custom_events: z.array(ModCDPAddCustomEventObjectParamsSchema).optional(),
    custom_middlewares: z.array(ModCDPAddMiddlewareParamsSchema).optional(),
  })
  .passthrough();
type ModCDPServerOptions = z.infer<typeof ModCDPServerOptionsSchema>;

const ModCDPConfigureParamsSchema = ModCDPServerOptionsSchema;
type ModCDPConfigureParams = z.infer<typeof ModCDPConfigureParamsSchema>;

const ModCDPPingParamsSchema = z.object({
  sent_at: z.number().optional(),
});
type ModCDPPingParams = z.infer<typeof ModCDPPingParamsSchema>;

const ModCDPPongEventSchema = z.object({
  sent_at: z.number(),
  received_at: z.number(),
  from: z.string(),
});
type ModCDPPongEvent = z.infer<typeof ModCDPPongEventSchema>;

const ModCDPPingLatencySchema = z.object({
  sent_at: z.number(),
  received_at: z.number().nullable(),
  returned_at: z.number(),
  round_trip_ms: z.number(),
  service_worker_ms: z.number().nullable(),
  return_path_ms: z.number().nullable(),
});
type ModCDPPingLatency = z.infer<typeof ModCDPPingLatencySchema>;

const ModCDPGetTopologyParamsSchema = z
  .object({
    rootTargetId: z.string().optional(),
    targetId: z.string().optional(),
    active: z.boolean().optional(),
  })
  .passthrough();
type ModCDPGetTopologyParams = z.infer<typeof ModCDPGetTopologyParamsSchema>;

const ModCDPTopologyFrameSchema = z
  .object({
    targetId: z.string(),
    url: z.string().nullable().optional(),
    parentFrameId: z.string().nullable().optional(),
    outerBackendNodeId: z.number().int().nullable().optional(),
  })
  .passthrough();
type ModCDPTopologyFrame = z.infer<typeof ModCDPTopologyFrameSchema>;

const ModCDPTopologyDomRootSchema = z
  .object({
    kind: z.enum(["document", "shadow"]),
    frameId: z.string(),
    outerBackendNodeId: z.number().int().nullable().optional(),
    innerBackendNodeId: z.number().int().nullable().optional(),
    mode: z.enum(["open", "closed", "user-agent"]).optional(),
    executionContextId: z.number().int().optional(),
    uniqueContextId: z.string().optional(),
  })
  .passthrough();
type ModCDPTopologyDomRoot = z.infer<typeof ModCDPTopologyDomRootSchema>;

const ModCDPTopologyTargetSchema = z
  .object({
    targetId: z.string(),
    type: z.string(),
    title: z.string().optional(),
    url: z.string().optional(),
    attached: z.boolean().optional(),
    parentId: z.string().optional(),
    parentFrameId: z.string().optional(),
    sessionId: z.string().nullable().optional(),
  })
  .passthrough();
type ModCDPTopologyTarget = z.infer<typeof ModCDPTopologyTargetSchema>;

const ModCDPTopologyExecutionContextSchema = z
  .object({
    id: z.number().int(),
    origin: z.string().optional(),
    name: z.string().optional(),
    uniqueId: z.string().optional(),
    auxData: z.record(z.string(), z.unknown()).optional(),
    sessionId: z.string().nullable(),
    targetId: z.string(),
    frameId: z.string().nullable().optional(),
    world: z.string(),
  })
  .passthrough();
type ModCDPTopologyExecutionContext = z.infer<typeof ModCDPTopologyExecutionContextSchema>;

const ModCDPTopologySchema = z
  .object({
    objectGroup: z.string(),
    rootFrameId: z.string(),
    frames: z.record(z.string(), ModCDPTopologyFrameSchema),
    roots: z.record(z.string(), ModCDPTopologyDomRootSchema),
    targets: z.record(z.string(), ModCDPTopologyTargetSchema),
    contexts: z.record(z.string(), ModCDPTopologyExecutionContextSchema),
  })
  .passthrough();
type ModCDPTopology = z.infer<typeof ModCDPTopologySchema>;

const ModCDPCommandParamsSchema = z.union([
  ModCDPEvaluateParamsSchema,
  ModCDPGetTopologyParamsSchema,
  ModCDPAddCustomCommandParamsSchema,
  ModCDPAddCustomEventParamsSchema,
  ModCDPAddMiddlewareParamsSchema,
  ModCDPConfigureParamsSchema,
  ModCDPPingParamsSchema,
  ModCDPCustomPayloadSchema,
]);
type ModCDPCommandParams = z.infer<typeof ModCDPCommandParamsSchema>;

const ModCDPCommandResultSchema = z.union([z.object({ ok: z.boolean() }).passthrough(), ModCDPCustomPayloadSchema]);
type ModCDPCommandResult = z.infer<typeof ModCDPCommandResultSchema>;

const ModCDPEvaluateResponseSchema = z.unknown();
type ModCDPEvaluateResponse = z.infer<typeof ModCDPEvaluateResponseSchema>;

const ModCDPGetTopologyResponseSchema = ModCDPTopologySchema;
type ModCDPGetTopologyResponse = z.infer<typeof ModCDPGetTopologyResponseSchema>;

const ModCDPAddCustomCommandResponseSchema = z
  .object({
    name: z.string(),
    registered: z.boolean(),
  })
  .passthrough();
type ModCDPAddCustomCommandResponse = z.infer<typeof ModCDPAddCustomCommandResponseSchema>;

const ModCDPAddCustomEventResponseSchema = z
  .object({
    name: z.string(),
    registered: z.boolean(),
  })
  .passthrough();
type ModCDPAddCustomEventResponse = z.infer<typeof ModCDPAddCustomEventResponseSchema>;

const ModCDPAddMiddlewareResponseSchema = z
  .object({
    name: z.string(),
    phase: z.enum(["request", "response", "event"]),
    registered: z.boolean(),
  })
  .passthrough();
type ModCDPAddMiddlewareResponse = z.infer<typeof ModCDPAddMiddlewareResponseSchema>;

const ModCDPConfigureResponseSchema = z.object({}).passthrough();
type ModCDPConfigureResponse = z.infer<typeof ModCDPConfigureResponseSchema>;

const ModCDPPingResponseSchema = z
  .object({
    ok: z.boolean(),
  })
  .passthrough();
type ModCDPPingResponse = z.infer<typeof ModCDPPingResponseSchema>;

const ModCDPBindingPayloadSchema = z.object({
  event: z.string(),
  data: z.unknown(),
  cdpSessionId: z.string().nullable().optional(),
});
type ModCDPBindingPayload = z.infer<typeof ModCDPBindingPayloadSchema>;

const CdpDebuggeeCommandParamsSchema = ModCDPCustomPayloadSchema.extend({
  debuggee: z.custom<chrome.debugger.Debuggee>().nullable().optional(),
  tabId: z.number().nullable().optional(),
  targetId: z.string().nullable().optional(),
  extensionId: z.string().nullable().optional(),
});
type CdpDebuggeeCommandParams = z.infer<typeof CdpDebuggeeCommandParamsSchema>;

const ProtocolParamsSchema = z.union([CdpCommandParamsSchema, ModCDPCommandParamsSchema]);
type ProtocolParams = z.infer<typeof ProtocolParamsSchema>;

const ProtocolResultSchema = z.union([CdpCommandResultSchema, ModCDPCommandResultSchema]);
type ProtocolResult = z.infer<typeof ProtocolResultSchema>;

const ProtocolEventParamsSchema = z.union([CdpEventParamsSchema, ModCDPPongEventSchema, ModCDPCustomPayloadSchema]);
type ProtocolEventParams = z.infer<typeof ProtocolEventParamsSchema>;

const ProtocolPayloadSchema = z.union([
  ProtocolParamsSchema,
  ProtocolResultSchema,
  ProtocolEventParamsSchema,
  ModCDPBindingPayloadSchema,
  z.null(),
]);
type ProtocolPayload = z.infer<typeof ProtocolPayloadSchema>;

const ModCDPCustomCommandRegistrationSchema = ModCDPAddCustomCommandParamsSchema;
type ModCDPCustomCommandRegistration = z.infer<typeof ModCDPCustomCommandRegistrationSchema>;

const ModCDPCustomEventRegistrationSchema = ModCDPAddCustomEventObjectParamsSchema;
type ModCDPCustomEventRegistration = z.infer<typeof ModCDPCustomEventRegistrationSchema>;

const ModCDPMiddlewareRegistrationSchema = ModCDPAddMiddlewareParamsSchema;
type ModCDPMiddlewareRegistration = z.infer<typeof ModCDPMiddlewareRegistrationSchema>;

const CdpErrorSchema = z
  .object({
    code: z.number().optional(),
    message: z.string(),
    data: z.unknown().optional(),
  })
  .passthrough();
type CdpError = z.infer<typeof CdpErrorSchema>;

const CdpCommandMessageSchema = z
  .object({
    id: z.number(),
    method: z.string(),
    params: ProtocolParamsSchema.optional(),
    sessionId: z.string().optional(),
  })
  .passthrough();
type CdpCommandMessage = z.infer<typeof CdpCommandMessageSchema>;

const CdpResponseMessageSchema = z
  .object({
    id: z.number(),
    result: z.unknown().optional(),
    error: CdpErrorSchema.optional(),
    sessionId: z.string().optional(),
  })
  .passthrough();
type CdpResponseMessage = z.infer<typeof CdpResponseMessageSchema>;

const CdpEventMessageSchema = z
  .object({
    method: z.string(),
    params: ProtocolEventParamsSchema.optional(),
    sessionId: z.string().optional(),
  })
  .passthrough();
type CdpEventMessage = z.infer<typeof CdpEventMessageSchema>;

const CdpMessageSchema = z.union([CdpCommandMessageSchema, CdpResponseMessageSchema, CdpEventMessageSchema]);
type CdpMessage = z.infer<typeof CdpMessageSchema>;

const TranslatedStepSchema = z
  .object({
    method: z.string(),
    params: ProtocolParamsSchema.optional(),
    sessionId: z.string().nullable().optional(),
    unwrap: z.enum(["runtime", "runtime_json"]).optional(),
  })
  .passthrough();
type TranslatedStep = z.infer<typeof TranslatedStepSchema>;

const TranslatedCommandSchema = z
  .object({
    route: z.string(),
    target: z.enum(["direct_cdp", "service_worker"]),
    steps: z.array(TranslatedStepSchema),
  })
  .passthrough();
type TranslatedCommand = z.infer<typeof TranslatedCommandSchema>;

const UnwrappedModCDPEventSchema = z
  .object({
    event: z.string(),
    data: ProtocolPayloadSchema,
    sessionId: z.string().nullable(),
  })
  .passthrough();
type UnwrappedModCDPEvent = z.infer<typeof UnwrappedModCDPEventSchema>;

const Mod = {
  Routes: ModCDPRoutesSchema,
  CustomPayload: ModCDPCustomPayloadSchema,
  Name: ModCDPNameSchema,
  ZodType: ModCDPZodTypeSchema,
  PayloadShape: ModCDPPayloadShapeSchema,
  PayloadSchemaSpec: ModCDPPayloadSchemaSpecSchema,
  EvaluateParams: ModCDPEvaluateParamsSchema,
  GetTopologyParams: ModCDPGetTopologyParamsSchema,
  AddCustomCommandParams: ModCDPAddCustomCommandParamsSchema,
  AddCustomEventObjectParams: ModCDPAddCustomEventObjectParamsSchema,
  AddCustomEventParams: ModCDPAddCustomEventParamsSchema,
  AddMiddlewareParams: ModCDPAddMiddlewareParamsSchema,
  LauncherOptions: ModCDPLauncherOptionsSchema,
  UpstreamOptions: ModCDPUpstreamOptionsSchema,
  ClientOptions: ModCDPClientOptionsSchema,
  ServerOptions: ModCDPServerOptionsSchema,
  ConfigureParams: ModCDPConfigureParamsSchema,
  PingParams: ModCDPPingParamsSchema,
  PongEvent: ModCDPPongEventSchema,
  PingLatency: ModCDPPingLatencySchema,
  TopologyFrame: ModCDPTopologyFrameSchema,
  TopologyDomRoot: ModCDPTopologyDomRootSchema,
  TopologyTarget: ModCDPTopologyTargetSchema,
  TopologyExecutionContext: ModCDPTopologyExecutionContextSchema,
  Topology: ModCDPTopologySchema,
  CommandParams: ModCDPCommandParamsSchema,
  CommandResult: ModCDPCommandResultSchema,
  EvaluateResponse: ModCDPEvaluateResponseSchema,
  GetTopologyResponse: ModCDPGetTopologyResponseSchema,
  AddCustomCommandResponse: ModCDPAddCustomCommandResponseSchema,
  AddCustomEventResponse: ModCDPAddCustomEventResponseSchema,
  AddMiddlewareResponse: ModCDPAddMiddlewareResponseSchema,
  ConfigureResponse: ModCDPConfigureResponseSchema,
  PingResponse: ModCDPPingResponseSchema,
  BindingPayload: ModCDPBindingPayloadSchema,
  CustomCommandRegistration: ModCDPCustomCommandRegistrationSchema,
  CustomEventRegistration: ModCDPCustomEventRegistrationSchema,
  MiddlewareRegistration: ModCDPMiddlewareRegistrationSchema,
} as const;

export {
  CdpCommandParamsSchema,
  CdpCommandResultSchema,
  CdpEventParamsSchema,
  RuntimeBindingCalledEventSchema,
  TargetAttachedToTargetEventSchema,
  ModCDPRoutesSchema,
  ModCDPRouterOptionsSchema,
  ModCDPCustomPayloadSchema,
  normalizeModCDPName,
  ModCDPNameSchema,
  ModCDPZodTypeSchema,
  ModCDPPayloadJsonSchemaSchema,
  ModCDPPayloadShapeSchema,
  ModCDPPayloadSchemaSpecSchema,
  validateZodSchema,
  ModCDPEvaluateParamsSchema,
  ModCDPAddCustomCommandParamsSchema,
  ModCDPAddCustomEventObjectParamsSchema,
  ModCDPAddCustomEventParamsSchema,
  ModCDPAddMiddlewareParamsSchema,
  ModCDPLauncherOptionsSchema,
  ModCDPUpstreamOptionsSchema,
  ModCDPClientOptionsSchema,
  ModCDPDownstreamOptionsSchema,
  ModCDPServerOptionsSchema,
  ModCDPConfigureParamsSchema,
  ModCDPPingParamsSchema,
  ModCDPPongEventSchema,
  ModCDPPingLatencySchema,
  ModCDPGetTopologyParamsSchema,
  ModCDPTopologyFrameSchema,
  ModCDPTopologyDomRootSchema,
  ModCDPTopologyTargetSchema,
  ModCDPTopologyExecutionContextSchema,
  ModCDPTopologySchema,
  ModCDPCommandParamsSchema,
  ModCDPCommandResultSchema,
  ModCDPEvaluateResponseSchema,
  ModCDPGetTopologyResponseSchema,
  ModCDPAddCustomCommandResponseSchema,
  ModCDPAddCustomEventResponseSchema,
  ModCDPAddMiddlewareResponseSchema,
  ModCDPConfigureResponseSchema,
  ModCDPPingResponseSchema,
  ModCDPBindingPayloadSchema,
  CdpDebuggeeCommandParamsSchema,
  ProtocolParamsSchema,
  ProtocolResultSchema,
  ProtocolEventParamsSchema,
  ProtocolPayloadSchema,
  ModCDPCustomCommandRegistrationSchema,
  ModCDPCustomEventRegistrationSchema,
  ModCDPMiddlewareRegistrationSchema,
  CdpErrorSchema,
  CdpCommandMessageSchema,
  CdpResponseMessageSchema,
  CdpEventMessageSchema,
  CdpMessageSchema,
  TranslatedStepSchema,
  TranslatedCommandSchema,
  UnwrappedModCDPEventSchema,
  Mod,
};
export type {
  CdpCommandParams,
  CdpCommandResult,
  CdpEventParams,
  RuntimeBindingCalledEvent,
  TargetAttachedToTargetEvent,
  ModCDPRoutes,
  ModCDPRouterOptions,
  ModCDPCustomPayload,
  ModCDPNamedValue,
  ModCDPName,
  ModCDPZodType,
  ModCDPPayloadShape,
  ModCDPPayloadSchemaSpec,
  ModCDPEvaluateParams,
  ModCDPAddCustomCommandParams,
  ModCDPAddCustomEventObjectParams,
  ModCDPAddCustomEventParams,
  ModCDPAddMiddlewareParams,
  ModCDPLauncherOptions,
  ModCDPUpstreamOptions,
  ModCDPClientOptions,
  ModCDPDownstreamOptions,
  ModCDPServerOptions,
  ModCDPConfigureParams,
  ModCDPPingParams,
  ModCDPPongEvent,
  ModCDPPingLatency,
  ModCDPGetTopologyParams,
  ModCDPTopologyFrame,
  ModCDPTopologyDomRoot,
  ModCDPTopologyTarget,
  ModCDPTopologyExecutionContext,
  ModCDPTopology,
  ModCDPCommandParams,
  ModCDPCommandResult,
  ModCDPEvaluateResponse,
  ModCDPGetTopologyResponse,
  ModCDPAddCustomCommandResponse,
  ModCDPAddCustomEventResponse,
  ModCDPAddMiddlewareResponse,
  ModCDPConfigureResponse,
  ModCDPPingResponse,
  ModCDPBindingPayload,
  CdpDebuggeeCommandParams,
  ProtocolParams,
  ProtocolResult,
  ProtocolEventParams,
  ProtocolPayload,
  ModCDPCustomCommandRegistration,
  ModCDPCustomEventRegistration,
  ModCDPMiddlewareRegistration,
  CdpError,
  CdpCommandMessage,
  CdpResponseMessage,
  CdpEventMessage,
  CdpMessage,
  TranslatedStep,
  TranslatedCommand,
  UnwrappedModCDPEvent,
};
