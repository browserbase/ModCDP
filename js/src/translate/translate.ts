// @ts-nocheck
// Pure stateless translation between ModCDP and raw CDP messages.
// No I/O, no maps, no classes. Trivial to port to any language.
// Used on both the Node side (proxy + client) and the extension service worker
// side, so the binding payload format only has one definition.

import type {
  ModCDPAddCustomCommandParams,
  ModCDPAddMiddlewareParams,
  ModCDPBindingPayload,
  ModCDPCustomPayload,
  ModCDPEvaluateParams,
  ModCDPRoutes,
  ProtocolParams,
  ProtocolResult,
  RuntimeBindingCalledEvent,
  TranslatedCommand,
  UnwrappedModCDPEvent,
} from "../types/modcdp.js";
import type { cdp } from "../types/generated/cdp.js";

const UPSTREAM_EVENT_BINDING_NAME = "__ModCDP_event_from_upstream__";
const CUSTOM_EVENT_BINDING_NAME = "__ModCDP_custom_event__";

const DEFAULT_CLIENT_ROUTES = {
  "Mod.*": "service_worker",
  "Custom.*": "service_worker",
  "*.*": "service_worker",
} satisfies ModCDPRoutes;

type TranslateOptions = { routes?: ModCDPRoutes; cdpSessionId?: string | null };

function normalizeModCDPName(
  value:
    | {
        cdp_command_name?: string;
        cdp_event_name?: string;
        id?: string;
        name?: string;
        meta?: () => {
          cdp_command_name?: unknown;
          cdp_event_name?: unknown;
          id?: unknown;
          name?: unknown;
        };
      }
    | string,
) {
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
  if (typeof name !== "string" || !name) throw new Error("Expected a CDP name string or a named CDP schema/alias.");
  return name;
}

function routeFor(method: string, routes: ModCDPRoutes = {}) {
  if (Object.prototype.hasOwnProperty.call(routes, method)) return routes[method];
  let bestPrefixLen = -1;
  let bestRoute: string | null = null;
  for (const [pattern, route] of Object.entries(routes)) {
    if (pattern === "*.*" || !pattern.endsWith(".*")) continue;
    const prefix = pattern.slice(0, -1);
    if (method.startsWith(prefix) && prefix.length > bestPrefixLen) {
      bestPrefixLen = prefix.length;
      bestRoute = route;
    }
  }
  if (bestRoute !== null) return bestRoute;
  if (Object.prototype.hasOwnProperty.call(routes, "*.*")) return routes["*.*"];
  return "direct_cdp";
}

// --- outbound: ModCDP method -> Runtime.* params on the extension session --

function wrapModCDPEvaluate({
  expression,
  params = {},
  cdpSessionId = null,
}: ModCDPEvaluateParams): cdp.types.ts.Runtime.EvaluateParams {
  return {
    functionDeclaration: `
      async function() {
        const params = ${JSON.stringify(params)};
        const cdpSessionId = ${JSON.stringify(cdpSessionId)};
        const upstream = globalThis.ModCDP.client;
        const downstream = globalThis.ModCDP.downstream;
        const ModCDP = globalThis.ModCDP;
        const chrome = globalThis.chrome;
        const value = (${expression});
        return typeof value === "function" ? await value(params) : value;
      }
    `,
    awaitPromise: true,
    returnByValue: true,
  };
}

function wrapModCDPAddCustomCommand({
  name,
  expression,
}: ModCDPAddCustomCommandParams): cdp.types.ts.Runtime.EvaluateParams {
  const commandName = normalizeModCDPName(name);
  return {
    functionDeclaration: `
      function() {
        return globalThis.ModCDP.addCustomCommand({
          name: ${JSON.stringify(commandName)},
          params_schema: null,
          result_schema: null,
          expression: ${JSON.stringify(expression)},
          handler: async (params, cdpSessionId, method) => {
            const upstream = globalThis.ModCDP.client;
            const downstream = globalThis.ModCDP.downstream;
            const ModCDP = globalThis.ModCDP;
            const chrome = globalThis.chrome;
            const handler = (${expression});
            return await handler(params || {}, method);
          },
        });
      }
    `,
    awaitPromise: true,
    returnByValue: true,
  };
}

function wrapModCDPAddCustomEvent({ name }: { name: string }): cdp.types.ts.Runtime.EvaluateParams {
  const eventName = normalizeModCDPName(name);
  return {
    functionDeclaration: `
      function() {
        return globalThis.ModCDP.addCustomEvent({
        name: ${JSON.stringify(eventName)},
        event_schema: null,
        });
      }
    `,
    awaitPromise: true,
    returnByValue: true,
  };
}

function wrapModCDPAddMiddleware({
  name = "*",
  phase,
  expression,
}: ModCDPAddMiddlewareParams): cdp.types.ts.Runtime.EvaluateParams {
  const middlewareName = normalizeModCDPName(name);
  return {
    functionDeclaration: `
      function() {
        return globalThis.ModCDP.addMiddleware({
          name: ${JSON.stringify(middlewareName)},
          phase: ${JSON.stringify(phase)},
          expression: ${JSON.stringify(expression)},
          handler: async (payload, next, context = {}) => {
            const cdpSessionId = context.cdpSessionId ?? null;
            const upstream = globalThis.ModCDP.client;
            const downstream = globalThis.ModCDP.downstream;
            const ModCDP = globalThis.ModCDP;
            const chrome = globalThis.chrome;
            const middleware = (${expression});
            return await middleware(payload, next, context);
          },
        });
      }
    `,
    awaitPromise: true,
    returnByValue: true,
  };
}

function wrapCustomCommand(
  method: string,
  params: ProtocolParams = {},
  cdpSessionId: string | null = null,
): cdp.types.ts.Runtime.CallFunctionOnParams {
  return {
    functionDeclaration:
      "async function(method, paramsJson, cdpSessionId) { return JSON.stringify(await globalThis.ModCDP.handleCommand(method, JSON.parse(paramsJson), cdpSessionId)); }",
    arguments: [{ value: method }, { value: JSON.stringify(params) }, { value: cdpSessionId }],
    awaitPromise: true,
    returnByValue: true,
  };
}

function wrapServiceWorkerCommand(method: string, params: ProtocolParams = {}, cdpSessionId: string | null = null) {
  if (method === "Mod.addCustomEvent") {
    const eventParams = params as { name: any };
    const eventName = normalizeModCDPName(eventParams.name);
    return [
      {
        method: "Runtime.callFunctionOn",
        params: wrapModCDPAddCustomEvent({ name: eventName }),
        unwrap: "runtime" as const,
      },
    ];
  }

  let runtimeParams;
  let unwrap: "runtime" | "runtime_json" = "runtime";
  if (method === "Mod.evaluate") {
    const evaluateParams = params as ModCDPEvaluateParams;
    runtimeParams = wrapModCDPEvaluate({
      ...evaluateParams,
      cdpSessionId: evaluateParams.cdpSessionId ?? cdpSessionId,
    });
  } else if (method === "Mod.addCustomCommand") {
    runtimeParams = wrapModCDPAddCustomCommand(params as ModCDPAddCustomCommandParams);
  } else if (method === "Mod.addMiddleware") {
    runtimeParams = wrapModCDPAddMiddleware(params as ModCDPAddMiddlewareParams);
  } else {
    runtimeParams = wrapCustomCommand(
      method,
      params,
      ((params as ModCDPCustomPayload).cdpSessionId as string) ?? cdpSessionId,
    );
    unwrap = "runtime_json";
  }

  return [
    {
      method: "Runtime.callFunctionOn",
      params: runtimeParams,
      unwrap,
    },
  ];
}

function wrapCommandIfNeeded(
  method: string,
  params: ProtocolParams = {},
  { routes = DEFAULT_CLIENT_ROUTES, cdpSessionId = null }: TranslateOptions = {},
): TranslatedCommand {
  params = params ?? {};
  const route = routeFor(method, routes);
  if (route === "direct_cdp") {
    return {
      route,
      target: "direct_cdp",
      steps: [
        {
          method,
          params,
          ...(cdpSessionId ? { sessionId: cdpSessionId } : {}),
        },
      ],
    };
  }
  if (route === "service_worker") {
    return {
      route,
      target: "service_worker",
      steps: wrapServiceWorkerCommand(method, params, cdpSessionId),
    };
  }
  throw new Error(`Unsupported client route "${route}" for ${method}`);
}

// --- inbound: Runtime.* result/event -> ModCDP value/event ----------------

function unwrapRuntimeResponse(result: cdp.types.ts.Runtime.EvaluateResult) {
  if (result?.exceptionDetails) {
    const ex = result.exceptionDetails;
    throw new Error(ex.exception?.description || ex.text || "Runtime call failed");
  }
  return result?.result?.value;
}

function unwrapRuntimeJsonResponse(result: cdp.types.ts.Runtime.EvaluateResult) {
  const value = unwrapRuntimeResponse(result);
  return typeof value === "string" ? JSON.parse(value) : value;
}

function unwrapResponseIfNeeded(
  result: ProtocolResult | cdp.types.ts.Runtime.EvaluateResult,
  unwrap: string | null = null,
) {
  if (unwrap === "runtime_json") return unwrapRuntimeJsonResponse(result as cdp.types.ts.Runtime.EvaluateResult);
  return unwrap === "runtime" ? unwrapRuntimeResponse(result as cdp.types.ts.Runtime.EvaluateResult) : (result ?? {});
}

// Returns { event, data } or null when the binding is not a ModCDP event,
// when a custom binding payload is scoped to a different cdpSessionId than
// ourSessionId, or when the payload string is not valid JSON.
function unwrapEventIfNeeded(
  method: string,
  params: RuntimeBindingCalledEvent,
  sessionId: string | null = null,
  ourSessionId: string | null = null,
): UnwrappedModCDPEvent | null {
  if (method !== "Runtime.bindingCalled") return null;
  let payload: ModCDPBindingPayload;
  try {
    payload = JSON.parse(params.payload || "{}");
  } catch {
    return null;
  }
  if (payload == null || typeof payload !== "object") return null;
  const bindingName = params?.name || "";
  const isUpstreamEventBinding = bindingName === UPSTREAM_EVENT_BINDING_NAME;
  const isCustomEventBinding = bindingName === CUSTOM_EVENT_BINDING_NAME;
  if (!isUpstreamEventBinding && !isCustomEventBinding) return null;
  const payloadEvent = typeof payload.event === "string" && payload.event.length > 0 ? payload.event : null;
  if (payloadEvent == null) return null;
  if (payloadEvent === UPSTREAM_EVENT_BINDING_NAME || payloadEvent === CUSTOM_EVENT_BINDING_NAME) return null;
  const data = Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
  const sourceSessionId = typeof payload.cdpSessionId === "string" ? payload.cdpSessionId : sessionId;
  return { event: payloadEvent, data, sessionId: sourceSessionId };
}

// --- shared encoder used by the extension service worker --------------------

function encodeBindingPayload({ event, data, cdpSessionId = null }: ModCDPBindingPayload) {
  return JSON.stringify({ event, data, cdpSessionId });
}

export {
  UPSTREAM_EVENT_BINDING_NAME,
  CUSTOM_EVENT_BINDING_NAME,
  DEFAULT_CLIENT_ROUTES,
  routeFor,
  wrapModCDPEvaluate,
  wrapModCDPAddCustomCommand,
  wrapModCDPAddCustomEvent,
  wrapModCDPAddMiddleware,
  wrapCustomCommand,
  wrapCommandIfNeeded,
  unwrapResponseIfNeeded,
  unwrapEventIfNeeded,
  encodeBindingPayload,
};
