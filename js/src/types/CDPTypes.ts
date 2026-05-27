// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/client/ModCDPClient.py
// - ./go/modcdp/client/ModCDPClient.go
import { z } from "zod";

import {
  createCdpAliases,
  type CdpCommandAliases,
  type CdpCommandMap,
  type CdpCommandSpec,
  type CdpEventMap,
  type CdpEventPayloads,
  type CdpEventSpec,
} from "./generated/aliases.js";
import {
  commands as nativeCommandSchemas,
  events as nativeEventSchemas,
  types as runtimeTypes,
} from "./generated/zod.js";
import * as Runtime from "./generated/zod/Runtime.js";
import type { CdpCommandSchema } from "./generated/zod/helpers.js";
import {
  type ModCDPAddCustomCommandParams,
  type ModCDPAddCustomEventObjectParams,
  type ModCDPAddMiddlewareParams,
  type ModCDPNamedValue,
  type ModCDPPayloadSchemaSpec,
  type ProtocolEventParams,
  type ProtocolParams,
  type ProtocolResult,
  type TranslatedStep,
  Mod,
  normalizeModCDPName,
  validateZodSchema,
} from "./modcdp.js";
import { modCDPToJSON } from "./toJSON.js";

type CDPCommandSpec<
  TParamsSchema extends z.ZodType = z.ZodType,
  TResultSchema extends z.ZodType = z.ZodType,
> = CdpCommandSpec<TParamsSchema, TResultSchema>;
type CDPEventSpec<TEventSchema extends z.ZodType = z.ZodType> = CdpEventSpec<TEventSchema>;
type CDPCommandMap = CdpCommandMap;
type CDPEventMap = CdpEventMap;
type CDPTypesCustomCommands<TCommands extends CDPCommandMap = {}> =
  | ModCDPAddCustomCommandParams[]
  | {
      [TName in keyof TCommands]: TCommands[TName];
    };
type CDPTypesCustomEvents<TEvents extends CDPEventMap = {}> =
  | ModCDPAddCustomEventObjectParams[]
  | {
      [TName in keyof TEvents]: TEvents[TName];
    };
type CDPTypesConfig<TCommands extends CDPCommandMap = {}, TEvents extends CDPEventMap = {}> = {
  custom_commands?: CDPTypesCustomCommands<TCommands>;
  custom_events?: CDPTypesCustomEvents<TEvents>;
  custom_middlewares?: ModCDPAddMiddlewareParams[];
};
type CDPTypesCommandRegistration = ModCDPAddCustomCommandParams & {
  params_schema?: z.ZodType | null;
  result_schema?: z.ZodType | null;
};
type CDPTypesEventRegistration = ModCDPAddCustomEventObjectParams & {
  event_schema?: z.ZodType | null;
};
type CDPAliasSend = (method: string, params?: unknown) => Promise<unknown>;
type CDPEventNameInput = string | symbol | (z.ZodType & ModCDPNamedValue);
type CDPEventPayload<TEvent extends z.ZodType> = TEvent extends z.ZodType<infer TPayload> ? TPayload : never;
type ProtocolCommandSchema = {
  params: z.ZodType;
  result: z.ZodType;
};
type ProtocolEventSchema = z.ZodType;
type CommandPreparation = {
  params: ProtocolParams;
  local_result: ProtocolResult | null;
  custom_command_name: string | null;
};
type CDPAliasBinding = {
  target: object;
  send: CDPAliasSend;
};
type CDPCommandAliases<TCommands extends CDPCommandMap = {}> = CdpCommandAliases<TCommands>;
type CDPEventMapPayloads<TEvents extends CDPEventMap = {}> = CdpEventPayloads<TEvents>;
type ServiceWorkerExpressionBuilder = (params: ProtocolParams, cdpSessionId: string | null) => string;

const DEFAULT_BUILTIN_COMMANDS: ReadonlyArray<ModCDPAddCustomCommandParams> = [
  {
    name: "Mod.ping",
    params_schema: Mod.PingParams,
    result_schema: Mod.PingResponse,
    expression: `
      async (params) => {
        const received_at = Date.now();
        const message = {
          method: "Mod.pong",
          params: {
            sent_at:
              typeof params.sent_at === "number"
                ? params.sent_at
                : received_at,
            received_at,
            from: "extension-service-worker",
          },
        };
        if (cdpSessionId) message.sessionId = cdpSessionId;
        downstream.sendEvent(message);
        return { ok: true };
      }
      `,
  },
  {
    name: "Mod.configure",
    params_schema: Mod.ConfigureParams,
    result_schema: Mod.ConfigureResponse,
    expression: `async (params) => { await ModCDP.configure(params); return params; }`,
  },
  {
    name: "Mod.evaluate",
    params_schema: Mod.EvaluateParams,
    result_schema: Mod.EvaluateResponse,
    expression: `
      async ({ expression, params = {}, cdpSessionId = null }) =>
        ModCDP.evaluateInServiceWorker({ expression, params, cdpSessionId })
      `,
  },
  {
    name: "Mod.getTopology",
    params_schema: Mod.GetTopologyParams,
    result_schema: Mod.GetTopologyResponse,
    expression: `async (params) => ModCDP.client.router.getTopology(params)`,
  },
  {
    name: "Mod.addCustomCommand",
    params_schema: Mod.AddCustomCommandParams,
    result_schema: Mod.AddCustomCommandResponse,
    expression: `async (params) => ModCDP.addCustomCommand(params)`,
  },
  {
    name: "Mod.addCustomEvent",
    params_schema: Mod.AddCustomEventObjectParams,
    result_schema: Mod.AddCustomEventResponse,
    expression: `async (params) => ModCDP.addCustomEvent(params)`,
  },
  {
    name: "Mod.addMiddleware",
    params_schema: Mod.AddMiddlewareParams,
    result_schema: Mod.AddMiddlewareResponse,
    expression: `async (params) => ModCDP.addMiddleware(params)`,
  },
];

const DEFAULT_BUILTIN_EVENTS: ReadonlyArray<ModCDPAddCustomEventObjectParams> = [
  { name: "Mod.pong", event_schema: Mod.PongEvent },
];

function hasCommandExpression(
  command: ModCDPAddCustomCommandParams,
): command is ModCDPAddCustomCommandParams & { expression: string } {
  return typeof command.expression === "string" && command.expression.length > 0;
}

const wire_omit_schema = Symbol("wire_omit_schema");

function sanitizeSerializableJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeSerializableJsonSchema(item));
  if (value == null || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  if (source.modcdp_wire === "omit") return wire_omit_schema;
  const sanitized: Record<string, unknown> = {};
  const omitted_properties = new Set<string>();
  const properties =
    source.properties != null && typeof source.properties === "object" && !Array.isArray(source.properties)
      ? (source.properties as Record<string, unknown>)
      : null;
  if (properties) {
    const sanitized_properties: Record<string, unknown> = {};
    for (const [property_name, property_schema] of Object.entries(properties)) {
      const sanitized_property_schema = sanitizeSerializableJsonSchema(property_schema);
      if (sanitized_property_schema === wire_omit_schema) {
        omitted_properties.add(property_name);
      } else {
        sanitized_properties[property_name] = sanitized_property_schema;
      }
    }
    sanitized.properties = sanitized_properties;
  }
  for (const [key, child_value] of Object.entries(source)) {
    if (key === "modcdp_wire" || key === "properties") continue;
    if (key === "required" && Array.isArray(child_value)) {
      const required = child_value.filter(
        (property_name): property_name is string =>
          typeof property_name === "string" && !omitted_properties.has(property_name),
      );
      if (required.length > 0) sanitized.required = required;
      continue;
    }
    const sanitized_child_value = sanitizeSerializableJsonSchema(child_value);
    if (sanitized_child_value !== wire_omit_schema) sanitized[key] = sanitized_child_value;
  }
  return sanitized;
}

function serializablePayloadSchema(schema: ModCDPPayloadSchemaSpec | null | undefined) {
  if (!schema) return null;
  const normalized_schema = validateZodSchema(schema);
  if (!normalized_schema) return null;
  const json_schema = z.toJSONSchema(normalized_schema, { unrepresentable: "any" });
  return sanitizeSerializableJsonSchema(json_schema) as ModCDPPayloadSchemaSpec;
}

/**
 * Protocol type registry for native CDP, ModCDP, and user-provided command/event
 * schemas. CDPTypes owns shape metadata, Zod runtime validation, JSON-schema
 * normalization, custom type registration, and optional alias installation over
 * a caller-provided send function. It does not own transport, browser state,
 * routing, command execution, middleware execution, or event delivery.
 */
class CDPTypes<TCommands extends CDPCommandMap = {}, TEvents extends CDPEventMap = {}> {
  readonly types = runtimeTypes;
  readonly commands = nativeCommandSchemas;
  readonly events = nativeEventSchemas;
  readonly custom_commands: Map<string, ModCDPAddCustomCommandParams>;
  readonly custom_events: Map<string, ModCDPAddCustomEventObjectParams>;
  readonly custom_middlewares: ModCDPAddMiddlewareParams[];
  readonly event_schemas = new Map<string, ProtocolEventSchema>();
  readonly command_params_schemas = new Map<string, z.ZodType>();
  readonly command_result_schemas = new Map<string, z.ZodType>();
  readonly service_worker_expression_builders = new Map<string, ServiceWorkerExpressionBuilder>();
  private readonly alias_bindings: CDPAliasBinding[] = [];
  private readonly alias_targets = new WeakSet<object>();

  constructor(config: CDPTypesConfig<TCommands, TEvents> = {}) {
    this.custom_commands = new Map();
    this.custom_events = new Map();
    this.custom_middlewares = [];
    this.hydrateBuiltinSchemas();
    for (const command of DEFAULT_BUILTIN_COMMANDS) this.addCustomCommand(command);
    for (const event of DEFAULT_BUILTIN_EVENTS) this.addCustomEvent(event);
    this.registerCustomCommands(config.custom_commands ?? []);
    this.registerCustomEvents(config.custom_events ?? []);
    for (const middleware of config.custom_middlewares ?? []) this.addCustomMiddleware(middleware);
    this.service_worker_expression_builders.set("Mod.evaluate", (params) => {
      const parsed = Mod.EvaluateParams.parse(params);
      return `
        async ({ params = {}, cdpSessionId = null }) => {
          const value = (${parsed.expression});
          return typeof value === "function" ? await value(params) : value;
        }
      `;
    });
  }

  update<TMoreCommands extends CDPCommandMap = {}, TMoreEvents extends CDPEventMap = {}>(
    config: CDPTypesConfig<TMoreCommands, TMoreEvents>,
  ): CDPTypes<TCommands & TMoreCommands, TEvents & TMoreEvents> {
    const updated = new CDPTypes<TCommands & TMoreCommands, TEvents & TMoreEvents>({
      custom_commands: [...this.custom_commands.values(), ...this.customCommandEntries(config.custom_commands ?? [])],
      custom_events: [...this.custom_events.values(), ...this.customEventEntries(config.custom_events ?? [])],
      custom_middlewares: [...this.custom_middlewares, ...(config.custom_middlewares ?? [])],
    });
    for (const binding of this.alias_bindings) updated.installAliases(binding.target, binding.send);
    return updated;
  }

  nativeCommandSchema(method: string) {
    return (nativeCommandSchemas as Record<string, CdpCommandSchema>)[method] ?? null;
  }

  commandParamsSchema(method: string) {
    return this.command_params_schemas.get(method) ?? null;
  }

  commandResultSchema(method: string) {
    return this.command_result_schemas.get(method) ?? null;
  }

  eventPayloadSchema(event_name: string) {
    return this.event_schemas.get(event_name) ?? null;
  }

  normalizeEventName(event_name: CDPEventNameInput) {
    if (typeof event_name !== "string" && typeof event_name !== "symbol") {
      const name = normalizeModCDPName(event_name);
      this.event_schemas.set(name, event_name);
      return name;
    }
    return typeof event_name === "symbol" ? event_name : normalizeModCDPName(event_name);
  }

  prepareCommand(method: string, params: unknown = {}, can_register_locally = false): CommandPreparation {
    let command_params = this.parseCommandParams(method, params);
    if (method === "Mod.addCustomCommand") {
      const parsed = Mod.AddCustomCommandParams.parse(command_params);
      const name = this.addCustomCommand(parsed);
      if (!parsed.expression && can_register_locally)
        return {
          params: command_params,
          local_result: { name, registered: true },
          custom_command_name: name,
        };
      const params_schema = serializablePayloadSchema(parsed.params_schema);
      const result_schema = serializablePayloadSchema(parsed.result_schema);
      command_params = this.customCommandWireRegistration(name) ?? {
        ...parsed,
        name,
        ...(params_schema == null ? {} : { params_schema }),
        ...(result_schema == null ? {} : { result_schema }),
      };
    } else if (method === "Mod.addCustomEvent") {
      const parsed = Mod.AddCustomEventObjectParams.parse(params ?? {});
      const name = this.addCustomEvent(parsed);
      if (can_register_locally)
        return {
          params: command_params,
          local_result: { name, registered: true },
          custom_command_name: null,
        };
      const event_schema = serializablePayloadSchema(parsed.event_schema);
      command_params = this.customEventWireRegistration(name) ?? {
        ...parsed,
        name,
        ...(event_schema == null ? {} : { event_schema }),
      };
    } else if (method === "Mod.addMiddleware") {
      const parsed = Mod.AddMiddlewareParams.parse(command_params);
      this.addCustomMiddleware(parsed);
      if (can_register_locally)
        return {
          params: command_params,
          local_result: {
            name: parsed.name == null ? "*" : normalizeModCDPName(parsed.name),
            phase: parsed.phase,
            registered: true,
          },
          custom_command_name: null,
        };
    }
    return {
      params: command_params,
      local_result: null,
      custom_command_name:
        method === "Mod.addCustomCommand"
          ? normalizeModCDPName(Mod.AddCustomCommandParams.parse(command_params).name)
          : null,
    };
  }

  parseCommandParams(method: string, params: unknown = {}) {
    return (this.command_params_schemas.get(method)?.parse(params ?? {}) ?? params ?? {}) as ProtocolParams;
  }

  parseCommandResult(method: string, result: unknown): ProtocolResult {
    const result_schema = this.command_result_schemas.get(method);
    return (result_schema ? result_schema.parse(result) : (result ?? {})) as ProtocolResult;
  }

  parseEventPayload(event_name: string, payload: unknown = {}) {
    return (this.event_schemas.get(event_name)?.parse(payload ?? {}) ?? payload ?? {}) as ProtocolEventParams;
  }

  serviceWorkerCommandStep(
    method: string,
    params: ProtocolParams = {},
    cdpSessionId: string | null = null,
    execution_context_id: number | null = null,
  ): TranslatedStep {
    const command = this.custom_commands.get(method);
    if (command && hasCommandExpression(command)) {
      const command_expression =
        this.service_worker_expression_builders.get(method)?.(params, cdpSessionId) ?? command.expression;
      return {
        method: Runtime.EvaluateCommand.id,
        params: {
          expression: this.serviceWorkerRuntimeExpression(method, params, cdpSessionId, command_expression),
          awaitPromise: true,
          returnByValue: true,
          ...(execution_context_id == null ? {} : { contextId: execution_context_id }),
        },
        unwrap: "runtime",
      };
    }
    return {
      method: Runtime.CallFunctionOnCommand.id,
      params: {
        functionDeclaration:
          "async function(method, paramsJson, cdpSessionId) { return JSON.stringify(await globalThis.ModCDP.handleCommand(method, JSON.parse(paramsJson), cdpSessionId)); }",
        arguments: [{ value: method }, { value: JSON.stringify(params) }, { value: cdpSessionId }],
        awaitPromise: true,
        returnByValue: true,
        ...(execution_context_id == null ? {} : { executionContextId: execution_context_id }),
      },
      unwrap: "runtime_json",
    };
  }

  toJSON() {
    return modCDPToJSON(this, {
      config: {
        custom_commands: this.customCommandWireRegistrations().map(
          ({ expression: _expression, ...command }) => command,
        ),
        custom_events: this.customEventWireRegistrations(),
        custom_middlewares: this.customMiddlewareWireRegistrations().map(
          ({ expression: _expression, ...middleware }) => middleware,
        ),
      },
      state: {
        custom_commands: this.custom_commands.size,
        custom_events: this.custom_events.size,
        custom_middlewares: this.custom_middlewares.length,
        command_params_schemas: this.command_params_schemas.size,
        command_result_schemas: this.command_result_schemas.size,
        event_schemas: this.event_schemas.size,
      },
    });
  }

  addCustomCommand(registration: ModCDPAddCustomCommandParams) {
    const parsed = Mod.AddCustomCommandParams.parse(registration);
    const name = normalizeModCDPName(parsed.name);
    if (!/^[^.]+\.[^.]+$/.test(name)) throw new Error("name must be in Domain.method form.");
    const params_schema = validateZodSchema(parsed.params_schema);
    const result_schema = validateZodSchema(parsed.result_schema);
    if (params_schema) this.command_params_schemas.set(name, params_schema);
    if (result_schema) this.command_result_schemas.set(name, result_schema);
    this.upsertCustomCommand({
      ...parsed,
      name,
      params_schema: params_schema ?? null,
      result_schema: result_schema ?? null,
    });
    return name;
  }

  customCommandWireRegistrations({ expression_required = false }: { expression_required?: boolean } = {}) {
    return [...this.custom_commands.values()]
      .filter((command) => !expression_required || hasCommandExpression(command))
      .map((command) => {
        const params_schema = serializablePayloadSchema(command.params_schema);
        const result_schema = serializablePayloadSchema(command.result_schema);
        return {
          name: normalizeModCDPName(command.name),
          expression: command.expression ?? null,
          ...(params_schema == null ? {} : { params_schema }),
          ...(result_schema == null ? {} : { result_schema }),
        };
      });
  }

  customEventWireRegistrations() {
    return [...this.custom_events.values()].map((event) => {
      const event_schema = serializablePayloadSchema(event.event_schema);
      return {
        name: normalizeModCDPName(event.name),
        ...(event_schema == null ? {} : { event_schema }),
      };
    });
  }

  addCustomMiddleware(registration: ModCDPAddMiddlewareParams) {
    const parsed = Mod.AddMiddlewareParams.parse(registration);
    const name = parsed.name == null ? "*" : normalizeModCDPName(parsed.name);
    if (name !== "*" && !name.includes(".")) throw new Error("name must be '*' or Domain.name form.");
    this.custom_middlewares.push({
      ...parsed,
      ...(name === "*" ? {} : { name }),
    });
    return name;
  }

  customMiddlewareWireRegistrations() {
    return this.custom_middlewares.map(({ name, phase, expression }) => ({
      ...(name == null ? {} : { name: normalizeModCDPName(name) }),
      phase,
      expression,
    }));
  }

  customMiddlewareRegistrations(phase: "request" | "response" | "event", name: string) {
    return this.custom_middlewares.filter((middleware) => {
      const middleware_name = middleware.name == null ? "*" : normalizeModCDPName(middleware.name);
      return middleware.phase === phase && (middleware_name === "*" || middleware_name === name);
    });
  }

  addCustomEvent(registration: ModCDPAddCustomEventObjectParams) {
    const parsed = Mod.AddCustomEventObjectParams.parse(registration);
    const name = normalizeModCDPName(parsed.name);
    if (!/^[^.]+\.[^.]+$/.test(name)) throw new Error("name must be in Domain.event form.");
    const event_schema = validateZodSchema(parsed.event_schema);
    if (event_schema) this.event_schemas.set(name, event_schema);
    this.custom_events.set(name, {
      ...parsed,
      name,
      event_schema: event_schema ?? null,
    });
    return name;
  }

  installAliases(target: object, send: CDPAliasSend) {
    if (!this.alias_bindings.some((binding) => binding.target === target)) this.alias_bindings.push({ target, send });
    if (this.alias_targets.has(target)) return;
    const { types: _runtime_types, ...aliases } = createCdpAliases(send, {
      onCustomCommand: (name, params_schema, result_schema) => {
        if (!this.custom_commands.has(name))
          this.addCustomCommand({
            name,
            params_schema: params_schema ?? null,
            result_schema: result_schema ?? null,
          });
        this.installCustomCommandAlias(target, name, send);
      },
      onCustomEvent: (name, event_schema) => {
        if (!this.custom_events.has(name)) this.addCustomEvent({ name, event_schema: event_schema ?? null });
      },
    });
    Object.assign(target, aliases);
    for (const command of this.custom_commands.values())
      this.installCustomCommandAlias(target, normalizeModCDPName(command.name), send);
    this.alias_targets.add(target);
  }

  installCustomCommandAlias(target: object, name: string, send: CDPAliasSend) {
    const parts = name.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1])
      throw new Error(`Custom command must use Domain.method format, got ${name}`);
    const [domain, method] = parts;
    if (method === "*") {
      const existing_domain = Reflect.get(target, domain);
      const domain_target = existing_domain != null && typeof existing_domain === "object" ? existing_domain : {};
      Reflect.set(
        target,
        domain,
        new Proxy(domain_target, {
          get(existing, property, receiver) {
            if (typeof property !== "string") return Reflect.get(existing, property, receiver);
            if (property in existing) return Reflect.get(existing, property, receiver);
            const command_name = `${domain}.${property}`;
            const alias = (params?: unknown) => send(command_name, params ?? {});
            Object.defineProperties(alias, {
              cdp_command_name: {
                value: command_name,
                enumerable: true,
                configurable: true,
              },
              id: { value: command_name, enumerable: true, configurable: true },
              name: { value: command_name, configurable: true },
              kind: { value: "command", enumerable: true, configurable: true },
              meta: {
                value: () => ({
                  cdp_command_name: command_name,
                  id: command_name,
                  name: command_name,
                  kind: "command",
                }),
                configurable: true,
              },
            });
            Reflect.set(existing, property, alias);
            return alias;
          },
        }),
      );
      return;
    }
    const existing_domain = Reflect.get(target, domain);
    const domain_target = existing_domain != null && typeof existing_domain === "object" ? existing_domain : {};
    if (existing_domain !== domain_target) Reflect.set(target, domain, domain_target);
    if (Reflect.has(domain_target, method)) return;
    const alias = (params?: unknown) => send(name, params ?? {});
    Object.defineProperties(alias, {
      cdp_command_name: { value: name, enumerable: true, configurable: true },
      id: { value: name, enumerable: true, configurable: true },
      name: { value: name, configurable: true },
      kind: { value: "command", enumerable: true, configurable: true },
      meta: {
        value: () => ({
          cdp_command_name: name,
          id: name,
          name,
          kind: "command",
        }),
        configurable: true,
      },
    });
    Reflect.set(domain_target, method, alias);
  }

  private hydrateBuiltinSchemas() {
    for (const [method, schema] of Object.entries(nativeCommandSchemas) as [string, ProtocolCommandSchema][]) {
      this.command_params_schemas.set(method, schema.params);
      this.command_result_schemas.set(method, schema.result);
    }
    this.command_params_schemas.set("Mod.evaluate", Mod.EvaluateParams);
    this.command_result_schemas.set("Mod.evaluate", Mod.EvaluateResponse);
    this.command_params_schemas.set("Mod.addCustomCommand", Mod.AddCustomCommandParams);
    this.command_result_schemas.set("Mod.addCustomCommand", Mod.AddCustomCommandResponse);
    this.command_params_schemas.set("Mod.addCustomEvent", Mod.AddCustomEventParams);
    this.command_result_schemas.set("Mod.addCustomEvent", Mod.AddCustomEventResponse);
    this.command_params_schemas.set("Mod.addMiddleware", Mod.AddMiddlewareParams);
    this.command_result_schemas.set("Mod.addMiddleware", Mod.AddMiddlewareResponse);
    this.command_params_schemas.set("Mod.configure", Mod.ConfigureParams);
    this.command_result_schemas.set("Mod.configure", Mod.ConfigureResponse);
    this.command_params_schemas.set("Mod.ping", Mod.PingParams);
    this.command_result_schemas.set("Mod.ping", Mod.PingResponse);
    this.command_params_schemas.set("Mod.getTopology", Mod.GetTopologyParams);
    this.command_result_schemas.set("Mod.getTopology", Mod.GetTopologyResponse);
    for (const [event, schema] of Object.entries(nativeEventSchemas) as [string, ProtocolEventSchema][]) {
      this.event_schemas.set(event, schema);
    }
  }

  private serviceWorkerRuntimeExpression(
    method: string,
    params: ProtocolParams,
    cdpSessionId: string | null,
    command_expression: string,
  ) {
    return `
      (async () => {
        const method = ${JSON.stringify(method)};
        let commandParams = ${JSON.stringify(params ?? {})};
        const cdpSessionId = ${JSON.stringify(cdpSessionId)};
        const upstream = globalThis.ModCDP.client;
        const downstream = globalThis.ModCDP.downstream;
        const ModCDP = globalThis.ModCDP;
        const cdp = {
          upstream,
          client: upstream,
          downstream,
          send: (method, params = {}, targetCdpSessionId = cdpSessionId) =>
            ModCDP.handleCommand(method, params, targetCdpSessionId),
        };
        const chrome = globalThis.chrome;
        const runMiddlewares = async (middlewares, payload, context = {}) => {
          const dispatch = async (index, value) => {
            const middleware = middlewares[index];
            if (!middleware) return value;
            let nextCalled = false;
            const next = async (nextValue = value) => {
              if (nextCalled) throw new Error("Middleware called next() more than once.");
              nextCalled = true;
              return await dispatch(index + 1, nextValue);
            };
            const result = await middleware(value, next, context);
            if (result && result.__ModCDP_middleware_next__ === true) {
              const nextResult = await next(result.value);
              const { __ModCDP_middleware_next__, value: _value, ...overrides } = result;
              if (Object.keys(overrides).length === 0) return nextResult;
              return nextResult && typeof nextResult === "object" && !Array.isArray(nextResult)
                ? { ...nextResult, ...overrides }
                : overrides;
            }
            return result;
          };
          return await dispatch(0, payload);
        };
        const requestMiddlewares = [${this.serviceWorkerMiddlewareExpressions("request", method).join(",")}];
        const responseMiddlewares = [${this.serviceWorkerMiddlewareExpressions("response", method).join(",")}];
        const request = { method, params: commandParams, cdpSessionId };
        commandParams = await runMiddlewares(requestMiddlewares, commandParams, {
          cdpSessionId,
          request,
          name: method,
          phase: "request",
        });
        if (commandParams == null) throw new Error("Request middleware returned no params.");
        commandParams = ModCDP.types.parseCommandParams(method, commandParams);
        const handler = (${command_expression});
        let result = await handler(commandParams || {}, method);
        result = await runMiddlewares(responseMiddlewares, result, {
          cdpSessionId,
          request: { ...request, params: commandParams },
          response: { result },
          name: method,
          phase: "response",
        });
        return ModCDP.types.parseCommandResult(method, result);
      })()
    `;
  }

  private serviceWorkerMiddlewareExpressions(phase: "request" | "response", method: string) {
    return this.customMiddlewareRegistrations(phase, method).map(
      (middleware) => `
        async (payload, next, context = {}) => {
          const middleware = (${middleware.expression});
          return await middleware(payload, next, context);
        }
      `,
    );
  }

  private registerCustomCommands(custom_commands: CDPTypesCustomCommands<TCommands>) {
    for (const command of this.customCommandEntries(custom_commands)) this.addCustomCommand(command);
  }

  private registerCustomEvents(custom_events: CDPTypesCustomEvents<TEvents>) {
    for (const event of this.customEventEntries(custom_events)) this.addCustomEvent(event);
  }

  private customCommandWireRegistration(name: string) {
    return this.customCommandWireRegistrations().find((command) => command.name === name) ?? null;
  }

  private customEventWireRegistration(name: string) {
    const event = this.custom_events.get(name);
    if (!event) return null;
    const event_schema = serializablePayloadSchema(event.event_schema);
    return {
      name,
      ...(event_schema == null ? {} : { event_schema }),
    };
  }

  private customCommandEntries<TInputCommands extends CDPCommandMap>(
    custom_commands: CDPTypesCustomCommands<TInputCommands> | [],
  ): ModCDPAddCustomCommandParams[] {
    if (Array.isArray(custom_commands)) return custom_commands;
    return Object.entries(custom_commands).map(([name, command]) => ({
      name,
      expression: command.expression ?? null,
      params_schema: command.params_schema ?? null,
      result_schema: command.result_schema ?? null,
    }));
  }

  private customEventEntries<TInputEvents extends CDPEventMap>(
    custom_events: CDPTypesCustomEvents<TInputEvents> | [],
  ): ModCDPAddCustomEventObjectParams[] {
    if (Array.isArray(custom_events)) return custom_events;
    return Object.entries(custom_events).map(([name, event]) => ({
      name,
      event_schema: event.event_schema ?? null,
    }));
  }

  private upsertCustomCommand(command: ModCDPAddCustomCommandParams) {
    const name = normalizeModCDPName(command.name);
    this.custom_commands.set(name, { ...command, name });
  }
}

export { DEFAULT_BUILTIN_COMMANDS, DEFAULT_BUILTIN_EVENTS, hasCommandExpression, serializablePayloadSchema, CDPTypes };
export type {
  CDPCommandSpec,
  CDPEventSpec,
  CDPCommandMap,
  CDPEventMap,
  CDPTypesCustomCommands,
  CDPTypesCustomEvents,
  CDPTypesConfig,
  CDPTypesCommandRegistration,
  CDPTypesEventRegistration,
  CDPAliasSend,
  CDPEventNameInput,
  CDPEventPayload,
  CDPCommandAliases,
  CDPEventMapPayloads,
};
