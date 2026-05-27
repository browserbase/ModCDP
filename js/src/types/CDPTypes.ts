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
import type { CdpCommandSchema } from "./generated/zod/helpers.js";
import {
  type ModCDPAddCustomCommandParams,
  type ModCDPAddCustomEventObjectParams,
  type ModCDPAddMiddlewareParams,
  type ModCDPNamedValue,
  type ModCDPPayloadSchemaSpec,
  type ProtocolParams,
  type ProtocolResult,
  Mod,
  normalizeModCDPName,
  validateZodSchema,
} from "./modcdp.js";

type CDPCommandSpec<TParamsSchema extends z.ZodType = z.ZodType, TResultSchema extends z.ZodType = z.ZodType> =
  CdpCommandSpec<TParamsSchema, TResultSchema>;
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
type CDPTypesOptions<TCommands extends CDPCommandMap = {}, TEvents extends CDPEventMap = {}> = {
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

function hasCommandExpression(
  command: ModCDPAddCustomCommandParams,
): command is ModCDPAddCustomCommandParams & { expression: string } {
  return typeof command.expression === "string" && command.expression.length > 0;
}

function serializablePayloadSchema(schema: ModCDPPayloadSchemaSpec | null | undefined) {
  if (!schema) return null;
  const normalized_schema = validateZodSchema(schema);
  return normalized_schema ? (z.toJSONSchema(normalized_schema) as ModCDPPayloadSchemaSpec) : null;
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
  readonly command_result_unwrap_keys = new Map<string, string>();
  readonly command_result_unwrap_schemas = new Map<string, z.ZodType>();
  private readonly alias_bindings: CDPAliasBinding[] = [];
  private readonly alias_targets = new WeakSet<object>();

  constructor(options: CDPTypesOptions<TCommands, TEvents> = {}) {
    this.custom_commands = new Map();
    this.custom_events = new Map();
    this.custom_middlewares = [];
    this.hydrateBuiltinSchemas();
    this.registerCustomCommands(options.custom_commands ?? []);
    this.registerCustomEvents(options.custom_events ?? []);
    for (const middleware of options.custom_middlewares ?? []) this.addCustomMiddleware(middleware);
  }

  update<TMoreCommands extends CDPCommandMap = {}, TMoreEvents extends CDPEventMap = {}>(
    options: CDPTypesOptions<TMoreCommands, TMoreEvents>,
  ): CDPTypes<TCommands & TMoreCommands, TEvents & TMoreEvents> {
    const updated = new CDPTypes<TCommands & TMoreCommands, TEvents & TMoreEvents>({
      custom_commands: [...this.custom_commands.values(), ...this.customCommandEntries(options.custom_commands ?? [])],
      custom_events: [...this.custom_events.values(), ...this.customEventEntries(options.custom_events ?? [])],
      custom_middlewares: [...this.custom_middlewares, ...(options.custom_middlewares ?? [])],
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
      command_params = this.customCommandWireRegistration(name) ?? {
        ...parsed,
        name,
        params_schema: serializablePayloadSchema(parsed.params_schema),
        result_schema: serializablePayloadSchema(parsed.result_schema),
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
      command_params = this.customEventWireRegistration(name) ?? {
        ...parsed,
        name,
        event_schema: serializablePayloadSchema(parsed.event_schema),
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

  parseCommandResult(method: string, result: unknown) {
    const result_schema = this.command_result_schemas.get(method);
    if (!result_schema) return result;
    const unwrap_key = this.command_result_unwrap_keys.get(method);
    const unwrap_schema = this.command_result_unwrap_schemas.get(method);
    if (unwrap_key && unwrap_schema && (result == null || typeof result !== "object")) return unwrap_schema.parse(result);
    const parsed_result = result_schema.parse(result);
    return unwrap_key && parsed_result && typeof parsed_result === "object"
      ? Reflect.get(parsed_result, unwrap_key)
      : parsed_result;
  }

  parseEventPayload(event_name: string, payload: unknown = {}) {
    return this.event_schemas.get(event_name)?.parse(payload) ?? payload;
  }

  addCustomCommand(registration: ModCDPAddCustomCommandParams) {
    const parsed = Mod.AddCustomCommandParams.parse(registration);
    const name = normalizeModCDPName(parsed.name);
    if (!/^[^.]+\.[^.]+$/.test(name)) throw new Error("name must be in Domain.method form.");
    const params_schema = validateZodSchema(parsed.params_schema);
    const result_schema = validateZodSchema(parsed.result_schema);
    if (params_schema) this.command_params_schemas.set(name, params_schema);
    if (result_schema) {
      this.command_result_schemas.set(name, result_schema);
      this.setResultUnwrapKey(name, result_schema);
    }
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
      .map((command) => ({
        name: normalizeModCDPName(command.name),
        expression: command.expression ?? null,
        params_schema: serializablePayloadSchema(command.params_schema),
        result_schema: serializablePayloadSchema(command.result_schema),
      }));
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
        this.addCustomCommand({
          name,
          params_schema: params_schema ?? null,
          result_schema: result_schema ?? null,
        });
        this.installCustomCommandAlias(target, name, send);
      },
      onCustomEvent: (name, event_schema) => {
        this.addCustomEvent({ name, event_schema: event_schema ?? null });
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
      Reflect.set(target, domain, new Proxy(domain_target, {
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
      }));
      return;
    }
    const existing_domain = Reflect.get(target, domain);
    const domain_target = existing_domain != null && typeof existing_domain === "object" ? existing_domain : {};
    if (existing_domain !== domain_target) Reflect.set(target, domain, domain_target);
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
    this.event_schemas.set("Mod.pong", Mod.PongEvent);
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
    return event
      ? {
          name,
          event_schema: serializablePayloadSchema(event.event_schema),
        }
      : null;
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

  private setResultUnwrapKey(name: string, schema: z.ZodType) {
    const shape = "shape" in schema && schema.shape && typeof schema.shape === "object" ? schema.shape : null;
    const keys = shape ? Object.keys(shape) : [];
    if (keys.length === 1) {
      this.command_result_unwrap_keys.set(name, keys[0]);
      this.command_result_unwrap_schemas.set(name, (shape as Record<string, z.ZodType>)[keys[0]]);
    } else {
      this.command_result_unwrap_keys.delete(name);
      this.command_result_unwrap_schemas.delete(name);
    }
  }
}

export { hasCommandExpression, serializablePayloadSchema, CDPTypes };
export type {
  CDPCommandSpec,
  CDPEventSpec,
  CDPCommandMap,
  CDPEventMap,
  CDPTypesCustomCommands,
  CDPTypesCustomEvents,
  CDPTypesOptions,
  CDPTypesCommandRegistration,
  CDPTypesEventRegistration,
  CDPAliasSend,
  CDPEventNameInput,
  CDPEventPayload,
  CDPCommandAliases,
  CDPEventMapPayloads,
};
