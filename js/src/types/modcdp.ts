/// <reference types="chrome" />
// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/types/modcdp.py
// - ./go/modcdp/types/types.go

import { z } from "zod";

const isZodType = (value: unknown): value is z.ZodType =>
  value != null && typeof value === "object" && typeof (value as z.ZodType).parse === "function";

const CdpCommandParamsSchema = z.record(z.string(), z.unknown());
type CdpCommandParams = z.infer<typeof CdpCommandParamsSchema>;

const CdpCommandResultSchema = z.record(z.string(), z.unknown());
type CdpCommandResult = z.infer<typeof CdpCommandResultSchema>;

const CdpEventParamsSchema = z.record(z.string(), z.unknown());
type CdpEventParams = z.infer<typeof CdpEventParamsSchema>;

const RuntimeBindingCalledEventSchema = z.object({
  name: z.string(),
  payload: z.string(),
  executionContextId: z.number().optional().nullable(),
});
type RuntimeBindingCalledEvent = z.infer<typeof RuntimeBindingCalledEventSchema>;

const TargetAttachedToTargetEventSchema = z.object({
  sessionId: z.string(),
  targetInfo: z.object({ targetId: z.string() }),
  waitingForDebugger: z.boolean(),
});
type TargetAttachedToTargetEvent = z.infer<typeof TargetAttachedToTargetEventSchema>;

const DEFAULT_LAUNCHER_CHROME_READY_TIMEOUT_MS = 45_000;
const DEFAULT_LAUNCHER_CHROME_READY_POLL_INTERVAL_MS = 100;
const DEFAULT_CLIENT_CDP_SEND_TIMEOUT_MS = 10_000;
const DEFAULT_CLIENT_EVENT_WAIT_TIMEOUT_MS = 10_000;
const DEFAULT_CLIENT_HEARTBEAT_INTERVAL_MS = 250;
const DEFAULT_DOWNSTREAM_CLIENT_TIMEOUT_MS = 1_000;
const DEFAULT_ROUTER_EXECUTION_CONTEXT_TIMEOUT_MS = 10_000;
const DEFAULT_UPSTREAM_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS = 250;
const DEFAULT_LAUNCHER_BB_BASE_URL = "https://api.browserbase.com";
const DEFAULT_LAUNCHER_BB_VIEWPORT = { width: 1288, height: 711 };

const ModCDPRoutesSchema = z.object({}).catchall(z.string());
type ModCDPRoutes = z.infer<typeof ModCDPRoutesSchema>;

const ModCDPRouterConfigSchema = z
  .object({
    router_routes: ModCDPRoutesSchema.default({}),
    loopback_execution_context_timeout_ms: z.number().positive().default(DEFAULT_ROUTER_EXECUTION_CONTEXT_TIMEOUT_MS),
  })
  .strict();
type ModCDPRouterConfig = z.infer<typeof ModCDPRouterConfigSchema>;

const ModCDPCustomPayloadSchema = z.record(z.string(), z.unknown());
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
    return isScalarJsonSchema(schema) ? z.object({ value: zod_schema }) : zod_schema;
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
  params: ModCDPCustomPayloadSchema.optional().nullable(),
  cdpSessionId: z.string().optional().nullable(),
});
type ModCDPEvaluateParams = z.infer<typeof ModCDPEvaluateParamsSchema>;

const ModCDPAddCustomCommandParamsSchema = z.object({
  name: ModCDPNameSchema,
  expression: z.string().optional().nullable(),
  params_schema: ModCDPPayloadSchemaSpecSchema.optional().nullable(),
  result_schema: ModCDPPayloadSchemaSpecSchema.optional().nullable(),
});
type ModCDPAddCustomCommandParams = z.infer<typeof ModCDPAddCustomCommandParamsSchema>;

const ModCDPAddCustomEventObjectParamsSchema = z.object({
  name: ModCDPNameSchema,
  event_schema: ModCDPPayloadSchemaSpecSchema.optional().nullable(),
});
type ModCDPAddCustomEventObjectParams = z.infer<typeof ModCDPAddCustomEventObjectParamsSchema>;
const ModCDPAddCustomEventParamsSchema = z.union([ModCDPZodTypeSchema, ModCDPAddCustomEventObjectParamsSchema]);
type ModCDPAddCustomEventParams = z.infer<typeof ModCDPAddCustomEventParamsSchema>;

const ModCDPAddMiddlewareParamsSchema = z.object({
  name: ModCDPNameSchema.optional().nullable(),
  phase: z.enum(["request", "response", "event"]),
  expression: z.string(),
});
type ModCDPAddMiddlewareParams = z.infer<typeof ModCDPAddMiddlewareParamsSchema>;

const BrowserbaseBrowserSettingsSchema = z
  .object({
    extensionId: z.string().optional(),
    viewport: z.unknown().default(DEFAULT_LAUNCHER_BB_VIEWPORT),
  })
  .catchall(z.unknown());

const BrowserbaseSessionCreateParamsSchema = z
  .object({
    browserSettings: BrowserbaseBrowserSettingsSchema.optional(),
    userMetadata: z.record(z.string(), z.unknown()).default({}),
    extensionId: z.string().optional(),
    region: z.string().optional(),
  })
  .catchall(z.unknown());

const ModCDPLauncherConfigSchema = z
  .object({
    launcher_mode: z.enum(["local", "remote", "bb", "none"]).default("none"),
    launcher_local_executable_path: z.string().optional(),
    launcher_local_user_data_dir: z.string().optional(),
    launcher_remote_cdp_url: z.string().optional(),
    launcher_local_cdp_listen_port: z.number().int().min(0).optional(),
    launcher_local_headless: z.boolean().optional(),
    launcher_local_sandbox: z.boolean().optional(),
    launcher_local_args: z.array(z.string()).default([]),
    launcher_local_extra_args: z.array(z.string()).default([]),
    launcher_local_loopback_cdp: z.boolean().default(false),
    launcher_local_cleanup_user_data_dir: z.boolean().default(false),
    launcher_local_chrome_ready_timeout_ms: z.number().positive().default(DEFAULT_LAUNCHER_CHROME_READY_TIMEOUT_MS),
    launcher_local_chrome_ready_poll_interval_ms: z
      .number()
      .positive()
      .default(DEFAULT_LAUNCHER_CHROME_READY_POLL_INTERVAL_MS),
    launcher_bb_api_key: z.string().optional(),
    launcher_bb_base_url: z.string().default(DEFAULT_LAUNCHER_BB_BASE_URL),
    launcher_bb_session_id: z.string().optional(),
    launcher_bb_keep_alive: z.boolean().default(false),
    launcher_bb_close_session_on_close: z.boolean().optional(),
    launcher_bb_region: z.string().optional(),
    launcher_bb_timeout: z.number().positive().optional(),
    launcher_bb_extension_id: z.string().optional(),
    launcher_bb_browser_settings: BrowserbaseBrowserSettingsSchema.default({ viewport: DEFAULT_LAUNCHER_BB_VIEWPORT }),
    launcher_bb_user_metadata: z.record(z.string(), z.unknown()).default({}),
    launcher_bb_session_create_params: BrowserbaseSessionCreateParamsSchema.default({ userMetadata: {} }),
  })
  .strict();
type ModCDPLauncherConfig = z.infer<typeof ModCDPLauncherConfigSchema>;

const ModCDPUpstreamConfigSchema = z
  .object({
    upstream_mode: z.enum(["ws"]).default("ws"),
    upstream_ws_cdp_url: z.string().optional(),
    upstream_ws_connect_error_settle_timeout_ms: z
      .number()
      .positive()
      .default(DEFAULT_UPSTREAM_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS),
    upstream_cdp_send_timeout_ms: z.number().positive().default(DEFAULT_CLIENT_CDP_SEND_TIMEOUT_MS),
  })
  .strict();
type ModCDPUpstreamConfig = z.infer<typeof ModCDPUpstreamConfigSchema>;

const ModCDPClientConfigSchema = z
  .object({
    client_hydrate_aliases: z.boolean().default(true),
    client_mirror_upstream_events: z.boolean().default(true),
    client_cdp_send_timeout_ms: z.number().positive().default(DEFAULT_CLIENT_CDP_SEND_TIMEOUT_MS),
    client_event_wait_timeout_ms: z.number().positive().default(DEFAULT_CLIENT_EVENT_WAIT_TIMEOUT_MS),
    client_heartbeat_interval_ms: z.number().positive().default(DEFAULT_CLIENT_HEARTBEAT_INTERVAL_MS),
  })
  .strict();
type ModCDPClientConfig = z.infer<typeof ModCDPClientConfigSchema>;

const ModCDPDownstreamConfigSchema = z
  .object({
    downstream_client_timeout_ms: z.number().positive().default(DEFAULT_DOWNSTREAM_CLIENT_TIMEOUT_MS),
    downstream_close_browser_on_disconnect: z.boolean().default(false),
    closeBrowser: z
      .custom<() => void | Promise<void>>((value) => typeof value === "function")
      .meta({ modcdp_wire: "omit" })
      .optional(),
  })
  .strict();
type ModCDPDownstreamConfig = z.infer<typeof ModCDPDownstreamConfigSchema>;

const ModCDPServerConfigSchema = z
  .object({
    upstream: ModCDPUpstreamConfigSchema.optional(),
    router: ModCDPRouterConfigSchema.optional(),
    client_config: ModCDPClientConfigSchema.optional(),
    downstream: ModCDPDownstreamConfigSchema.optional(),
    server_browser_token: z.string().optional(),
    custom_commands: z.array(ModCDPAddCustomCommandParamsSchema).optional(),
    custom_events: z.array(ModCDPAddCustomEventObjectParamsSchema).optional(),
    custom_middlewares: z.array(ModCDPAddMiddlewareParamsSchema).optional(),
  })
  .strict();
type ModCDPServerConfig = z.infer<typeof ModCDPServerConfigSchema>;

const ModCDPConfigureParamsSchema = ModCDPServerConfigSchema;
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

const ModCDPGetTopologyParamsSchema = z.object({
  rootTargetId: z.string().optional().nullable(),
  targetId: z.string().optional().nullable(),
  active: z.boolean().optional().nullable(),
});
type ModCDPGetTopologyParams = z.infer<typeof ModCDPGetTopologyParamsSchema>;

const ModCDPTopologyFrameSchema = z.object({
  targetId: z.string(),
  url: z.string().optional().nullable(),
  parentFrameId: z.string().optional().nullable(),
  outerBackendNodeId: z.number().int().optional().nullable(),
});
type ModCDPTopologyFrame = z.infer<typeof ModCDPTopologyFrameSchema>;

const ModCDPTopologyDomRootSchema = z.object({
  kind: z.enum(["document", "shadow"]),
  frameId: z.string(),
  outerBackendNodeId: z.number().int().optional().nullable(),
  innerBackendNodeId: z.number().int().optional().nullable(),
  mode: z.enum(["open", "closed", "user-agent"]).optional().nullable(),
  executionContextId: z.number().int().optional().nullable(),
  uniqueContextId: z.string().optional().nullable(),
});
type ModCDPTopologyDomRoot = z.infer<typeof ModCDPTopologyDomRootSchema>;

const ModCDPTopologyTargetSchema = z
  .object({
    targetId: z.string(),
    type: z.string(),
    title: z.string().optional().nullable(),
    url: z.string().optional().nullable(),
    attached: z.boolean().optional().nullable(),
    parentId: z.string().optional().nullable(),
    parentFrameId: z.string().optional().nullable(),
    sessionId: z.string().optional().nullable(),
  })
  .passthrough();
type ModCDPTopologyTarget = z.infer<typeof ModCDPTopologyTargetSchema>;

const ModCDPTopologyExecutionContextSchema = z.object({
  id: z.number().int(),
  origin: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  uniqueId: z.string().optional().nullable(),
  auxData: z.record(z.string(), z.unknown()).optional().nullable(),
  sessionId: z.string().nullable(),
  targetId: z.string(),
  frameId: z.string().optional().nullable(),
  world: z.string(),
});
type ModCDPTopologyExecutionContext = z.infer<typeof ModCDPTopologyExecutionContextSchema>;

const ModCDPTopologySchema = z.object({
  objectGroup: z.string(),
  rootFrameId: z.string(),
  frames: z.record(z.string(), ModCDPTopologyFrameSchema),
  roots: z.record(z.string(), ModCDPTopologyDomRootSchema),
  targets: z.record(z.string(), ModCDPTopologyTargetSchema),
  contexts: z.record(z.string(), ModCDPTopologyExecutionContextSchema),
});
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

const ModCDPCommandResultSchema = z.union([z.object({ ok: z.boolean() }), ModCDPCustomPayloadSchema]);
type ModCDPCommandResult = z.infer<typeof ModCDPCommandResultSchema>;

const ModCDPEvaluateResponseSchema = z.unknown();
type ModCDPEvaluateResponse = z.infer<typeof ModCDPEvaluateResponseSchema>;

const ModCDPGetTopologyResponseSchema = ModCDPTopologySchema;
type ModCDPGetTopologyResponse = z.infer<typeof ModCDPGetTopologyResponseSchema>;

const ModCDPAddCustomCommandResponseSchema = z.object({
  name: z.string(),
  registered: z.boolean(),
});
type ModCDPAddCustomCommandResponse = z.infer<typeof ModCDPAddCustomCommandResponseSchema>;

const ModCDPAddCustomEventResponseSchema = z.object({
  name: z.string(),
  registered: z.boolean(),
});
type ModCDPAddCustomEventResponse = z.infer<typeof ModCDPAddCustomEventResponseSchema>;

const ModCDPAddMiddlewareResponseSchema = z.object({
  name: z.string(),
  phase: z.enum(["request", "response", "event"]),
  registered: z.boolean(),
});
type ModCDPAddMiddlewareResponse = z.infer<typeof ModCDPAddMiddlewareResponseSchema>;

const ModCDPConfigureResponseSchema = z.object({}).passthrough();
type ModCDPConfigureResponse = z.infer<typeof ModCDPConfigureResponseSchema>;

const ModCDPPingResponseSchema = z.object({
  ok: z.boolean(),
});
type ModCDPPingResponse = z.infer<typeof ModCDPPingResponseSchema>;

const ModCDPBindingPayloadSchema = z.object({
  event: z.string(),
  data: z.unknown(),
  cdpSessionId: z.string().nullable().optional(),
});
type ModCDPBindingPayload = z.infer<typeof ModCDPBindingPayloadSchema>;

const CdpDebuggeeCommandParamsSchema = z
  .object({
    debuggee: z.custom<chrome.debugger.Debuggee>().nullable().optional(),
    tabId: z.number().nullable().optional(),
    targetId: z.string().nullable().optional(),
    extensionId: z.string().nullable().optional(),
  })
  .catchall(z.unknown());
type CdpDebuggeeCommandParams = z.infer<typeof CdpDebuggeeCommandParamsSchema>;

const ProtocolParamsSchema = z.union([CdpCommandParamsSchema, ModCDPCommandParamsSchema]);
type ProtocolParams = z.infer<typeof ProtocolParamsSchema>;

const ProtocolResultSchema = z.union([CdpCommandResultSchema, ModCDPCommandResultSchema]);
type ProtocolResult = CdpCommandResult;

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

const CdpErrorSchema = z.object({
  code: z.number().optional().nullable(),
  message: z.string(),
  data: z.unknown().optional().nullable(),
});
type CdpError = z.infer<typeof CdpErrorSchema>;

const CdpCommandMessageSchema = z.object({
  id: z.number(),
  method: z.string(),
  params: ProtocolParamsSchema.optional().nullable(),
  sessionId: z.string().optional().nullable(),
});
type CdpCommandMessage = z.infer<typeof CdpCommandMessageSchema>;

const CdpResponseMessageSchema = z.object({
  id: z.number(),
  result: z.unknown().optional().nullable(),
  error: CdpErrorSchema.optional().nullable(),
  sessionId: z.string().optional().nullable(),
});
type CdpResponseMessage = z.infer<typeof CdpResponseMessageSchema>;

const CdpEventMessageSchema = z.object({
  method: z.string(),
  params: ProtocolEventParamsSchema.optional().nullable(),
  sessionId: z.string().optional().nullable(),
});
type CdpEventMessage = z.infer<typeof CdpEventMessageSchema>;

const CdpMessageSchema = z.union([CdpCommandMessageSchema, CdpResponseMessageSchema, CdpEventMessageSchema]);
type CdpMessage = z.infer<typeof CdpMessageSchema>;

const TranslatedStepSchema = z.object({
  method: z.string(),
  params: ProtocolParamsSchema.optional().nullable(),
  sessionId: z.string().optional().nullable(),
  unwrap: z.enum(["runtime", "runtime_json"]).optional().nullable(),
});
type TranslatedStep = z.infer<typeof TranslatedStepSchema>;

const TranslatedCommandSchema = z.object({
  route: z.string(),
  target: z.enum(["direct_cdp", "service_worker"]),
  steps: z.array(TranslatedStepSchema),
});
type TranslatedCommand = z.infer<typeof TranslatedCommandSchema>;

const UnwrappedModCDPEventSchema = z.object({
  event: z.string(),
  data: ProtocolPayloadSchema,
  sessionId: z.string().nullable(),
});
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
  LauncherConfig: ModCDPLauncherConfigSchema,
  UpstreamConfig: ModCDPUpstreamConfigSchema,
  ClientConfig: ModCDPClientConfigSchema,
  DownstreamConfig: ModCDPDownstreamConfigSchema,
  ServerConfig: ModCDPServerConfigSchema,
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
  DEFAULT_LAUNCHER_BB_BASE_URL,
  DEFAULT_LAUNCHER_BB_VIEWPORT,
  DEFAULT_LAUNCHER_CHROME_READY_TIMEOUT_MS,
  DEFAULT_LAUNCHER_CHROME_READY_POLL_INTERVAL_MS,
  DEFAULT_CLIENT_CDP_SEND_TIMEOUT_MS,
  DEFAULT_CLIENT_EVENT_WAIT_TIMEOUT_MS,
  DEFAULT_CLIENT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_DOWNSTREAM_CLIENT_TIMEOUT_MS,
  DEFAULT_ROUTER_EXECUTION_CONTEXT_TIMEOUT_MS,
  DEFAULT_UPSTREAM_WS_CONNECT_ERROR_SETTLE_TIMEOUT_MS,
  CdpCommandParamsSchema,
  CdpCommandResultSchema,
  CdpEventParamsSchema,
  RuntimeBindingCalledEventSchema,
  TargetAttachedToTargetEventSchema,
  ModCDPRoutesSchema,
  ModCDPRouterConfigSchema,
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
  ModCDPLauncherConfigSchema,
  ModCDPUpstreamConfigSchema,
  ModCDPClientConfigSchema,
  ModCDPDownstreamConfigSchema,
  ModCDPServerConfigSchema,
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
  ModCDPRouterConfig,
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
  ModCDPLauncherConfig,
  ModCDPUpstreamConfig,
  ModCDPClientConfig,
  ModCDPDownstreamConfig,
  ModCDPServerConfig,
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
