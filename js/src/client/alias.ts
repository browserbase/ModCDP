import type { ModCDPClient } from "./ModCDPClient.js";
import type { ModCDPAliasObject as ModCDPAliasObjectRegistration } from "../types/modcdp.js";

type AliasSticky = Record<string, unknown>;
type AliasJSONObject = Record<string, unknown>;

class ModCDPAliasObject<TClient extends ModCDPClient = ModCDPClient> {
  readonly client: TClient;
  readonly sticky: AliasSticky;

  constructor(client: TClient, sticky: AliasSticky | null = null) {
    this.client = client;
    this.sticky = cloneAliasObject(sticky ?? {});
  }
}

function optionalAliasParams<T>(method: string, params: readonly T[]): T {
  if (params.length > 1) throw new Error(`${method} accepts at most one params object`);
  return params.length === 1 ? params[0]! : ({} as T);
}

async function sendAliasCommandWithStickyParams<T>(
  client: ModCDPClient,
  method: string,
  params: unknown,
  sticky: AliasSticky,
  sticky_param: string,
  sticky_params: readonly string[],
  sticky_fields: readonly string[],
  unwrap: string,
): Promise<T> {
  const raw_params = paramsToAliasObject(params);
  mergeAliasStickyParams(raw_params, sticky, sticky_param, sticky_params, sticky_fields);
  return unwrapAliasResult(await client.send(method, raw_params), unwrap) as T;
}

async function sendAliasCommand<T>(
  client: ModCDPClient,
  method: string,
  params: unknown,
  sticky: AliasSticky,
  sticky_param: string,
  sticky_fields: readonly string[],
  unwrap: string,
): Promise<T> {
  return sendAliasCommandWithStickyParams<T>(
    client,
    method,
    params,
    sticky,
    sticky_param,
    sticky_param ? [sticky_param] : [],
    sticky_fields,
    unwrap,
  );
}

function aliasStickyFromResult(result: unknown, unwrap: string, sticky_fields: readonly string[]): AliasSticky {
  const unwrapped = unwrapAliasResult(result, unwrap);
  const source = paramsToAliasObject(unwrapped);
  if (sticky_fields.length === 0) return cloneAliasObject(source);
  const filtered: AliasSticky = {};
  for (const field of sticky_fields) {
    if (field in source) filtered[field] = source[field];
  }
  return filtered;
}

function aliasArrayFromResult(result: unknown, unwrap: string): unknown[] {
  const unwrapped = unwrapAliasResult(result, unwrap);
  if (Array.isArray(unwrapped)) return unwrapped;
  throw new Error(`alias unwrap ${JSON.stringify(unwrap)} expected array`);
}

function unwrapAliasResult(result: unknown, unwrap: string): unknown {
  if (!unwrap) return result;
  let current = result;
  for (const part of unwrap.split(".")) {
    if (!part) continue;
    const object = paramsToAliasObject(current);
    if (!(part in object)) throw new Error(`alias unwrap ${JSON.stringify(unwrap)} missing ${JSON.stringify(part)}`);
    current = object[part];
  }
  return current;
}

function mergeAliasStickyParams(
  params: AliasJSONObject,
  sticky: AliasSticky,
  primary_sticky_param: string,
  sticky_params: readonly string[],
  sticky_fields: readonly string[],
) {
  if (sticky_params.length === 0) {
    mergeAliasSticky(params, sticky, primary_sticky_param, sticky_fields);
    return;
  }
  const seen = new Set<string>();
  for (const sticky_param of sticky_params) {
    if (!sticky_param || seen.has(sticky_param)) continue;
    seen.add(sticky_param);
    if (sticky_param !== primary_sticky_param && !(sticky_param in params)) continue;
    mergeAliasSticky(params, sticky, sticky_param, sticky_fields);
  }
}

function mergeAliasSticky(
  params: AliasJSONObject,
  sticky: AliasSticky,
  sticky_param: string,
  sticky_fields: readonly string[],
) {
  if (Object.keys(sticky).length === 0) return;
  let target = params;
  if (sticky_param) {
    const current = params[sticky_param];
    target = current != null && typeof current === "object" && !Array.isArray(current) ? { ...current } : {};
    params[sticky_param] = target;
  }
  const fields = sticky_fields.length > 0 ? sticky_fields : Object.keys(sticky);
  for (const field of fields) {
    if (field in target) continue;
    if (field in sticky) target[field] = sticky[field];
  }
}

function paramsToAliasObject(params: unknown): AliasJSONObject {
  if (params == null) return {};
  if (typeof params !== "object" || Array.isArray(params)) return {};
  return JSON.parse(JSON.stringify(params)) as AliasJSONObject;
}

function cloneAliasObject(source: AliasSticky): AliasSticky {
  return JSON.parse(JSON.stringify(source)) as AliasSticky;
}

function installAliasMethods(client: ModCDPClient) {
  for (const object of client.types.custom_alias_objects.values()) {
    for (const method of object.methods ?? []) {
      const path = sdkMethodPath(object.name, method);
      if (path.length !== 1) continue;
      Object.defineProperty(client, path[0]!, {
        configurable: true,
        value: (...params: unknown[]) => invokeAliasMethod(client, object.name, {}, method.name, params),
      });
    }
  }
}

function createRuntimeAliasObject<T = unknown>(client: ModCDPClient, object_name: string, sticky: AliasSticky): T {
  const object = aliasObjectRegistration(client, object_name);
  const receiver = new ModCDPAliasObject(client, sticky) as ModCDPAliasObject & AliasJSONObject;
  Object.assign(receiver, sticky);
  for (const method of object.methods ?? []) {
    const path = sdkMethodPath(object.name, method);
    if (path.length !== 2) continue;
    Object.defineProperty(receiver, path[1]!, {
      configurable: true,
      value: (...params: unknown[]) => invokeAliasMethod(client, object.name, receiver.sticky, method.name, params),
    });
  }
  return receiver as T;
}

function invokeAliasMethod(
  client: ModCDPClient,
  object_name: string,
  sticky: AliasSticky,
  method_name: string,
  params: unknown[],
) {
  const object = aliasObjectRegistration(client, object_name);
  const method = (object.methods ?? []).find((candidate) => candidate.name === method_name);
  if (!method) throw new Error(`Unknown alias method ${object_name}.${method_name}`);
  if (params.length > 1) throw new Error(`${object.name}.${method.name} accepts at most one params object`);
  const request = params.length === 1 ? params[0] : {};
  const return_object = method.return?.object;
  if (!method.command) {
    if (!return_object) throw new Error(`${object.name}.${method.name} has no command or return object`);
    return createRuntimeAliasObject(client, return_object, {});
  }
  return invokeCommandAliasMethod(client, object, method, sticky, request, return_object);
}

async function invokeCommandAliasMethod(
  client: ModCDPClient,
  object: ModCDPAliasObjectRegistration,
  method: NonNullable<ModCDPAliasObjectRegistration["methods"]>[number],
  sticky: AliasSticky,
  request: unknown,
  return_object: string | undefined,
) {
  if (return_object) {
    const raw = await sendAliasCommandWithStickyParams<unknown>(
      client,
      method.command,
      request,
      sticky,
      method.sticky_param ?? "",
      method.sticky_params ?? [],
      method.sticky_fields ?? [],
      "",
    );
    if (method.return?.array === true) {
      return aliasArrayFromResult(raw, method.return.unwrap ?? "").map((item) =>
        createRuntimeAliasObject(client, return_object, aliasStickyFromResult(item, "", aliasObjectRegistration(client, return_object).sticky_fields ?? [])),
      );
    }
    const unwrapped = aliasStickyFromResult(raw, method.return?.unwrap ?? "", aliasObjectRegistration(client, return_object).sticky_fields ?? []);
    if (method.return?.nullable === true && Object.keys(unwrapped).length === 0) return null;
    return createRuntimeAliasObject(client, return_object, unwrapped);
  }
  return sendAliasCommandWithStickyParams<unknown>(
    client,
    method.command,
    request,
    sticky,
    method.sticky_param ?? "",
    method.sticky_params ?? [],
    method.sticky_fields ?? [],
    method.return?.unwrap ?? "",
  );
}

function aliasObjectRegistration(client: ModCDPClient, object_name: string): ModCDPAliasObjectRegistration {
  const object = client.types.custom_alias_objects.get(object_name);
  if (!object) throw new Error(`Unknown alias object ${JSON.stringify(object_name)}`);
  return object;
}

function pascal(value: string) {
  return value
    .split(/[^A-Za-z0-9]+/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join("");
}

function sdkMethodPath(object_name: string, method: { sdk_method_name?: string; name: string }) {
  const raw = method.sdk_method_name;
  if (typeof raw === "string" && raw.trim()) return raw.split(".").filter(Boolean);
  return [object_name, method.name];
}

export {
  ModCDPAliasObject,
  installAliasMethods,
  createRuntimeAliasObject,
  optionalAliasParams,
  sendAliasCommand,
  sendAliasCommandWithStickyParams,
  aliasStickyFromResult,
  aliasArrayFromResult,
  unwrapAliasResult,
};
export type { AliasSticky, AliasJSONObject };
