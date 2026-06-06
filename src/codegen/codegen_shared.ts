function collectDefinitions(objects) {
  const defs = new Map();
  for (const object of objects) {
    collectSchemaDefinitions(object.sticky_schema, defs);
    for (const method of object.methods ?? []) {
      collectSchemaDefinitions(method.params_schema, defs);
      collectSchemaDefinitions(method.result_schema, defs);
    }
  }
  return defs;
}

function collectSchemaDefinitions(schema, defs) {
  if (!schema || typeof schema !== "object") return;
  for (const [name, definition] of Object.entries(schema.$defs ?? {})) {
    const typeName = safeTypeName(name);
    if (!defs.has(typeName)) defs.set(typeName, definition);
    collectSchemaDefinitions(definition, defs);
  }
  for (const property of Object.values(schema.properties ?? {})) collectSchemaDefinitions(property, defs);
  for (const item of [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]) collectSchemaDefinitions(item, defs);
  if (schema.items) collectSchemaDefinitions(schema.items, defs);
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") collectSchemaDefinitions(schema.additionalProperties, defs);
}

function receiverStickyParamFields(object, method) {
  const fields = new Set();
  const properties = schemaProperties(method.params_schema);
  if (!aliasObjectCanPopulateStickyParam(object, method)) return fields;
  for (const stickyParam of [method.sticky_param, ...(method.sticky_params ?? [])]) {
    if (stickyParam && properties.has(stickyParam)) fields.add(stickyParam);
  }
  return fields;
}

function aliasObjectCanPopulateStickyParam(object, method) {
  const objectFields = object.sticky_fields ?? [];
  const methodFields = method.sticky_fields ?? [];
  if (objectFields.length === 0) return schemaProperties(object.sticky_schema).size > 0 && methodFields.length === 0;
  if (methodFields.length === 0) return true;
  return objectFields.some((field) => methodFields.includes(field));
}

function paramsCanBeOmitted(schema, optionalFields) {
  const required = requiredSet(schema);
  for (const field of optionalFields) required.delete(field);
  return required.size === 0;
}

function schemaProperties(schema) {
  return new Set(Object.keys(schemaPropertiesObject(schema)));
}

function schemaPropertiesObject(schema) {
  return schema?.properties && typeof schema.properties === "object" ? schema.properties : {};
}

function requiredSet(schema) {
  return new Set(Array.isArray(schema?.required) ? schema.required : []);
}

function unionSchemas(schema) {
  return Array.isArray(schema?.anyOf) ? schema.anyOf : Array.isArray(schema?.oneOf) ? schema.oneOf : null;
}

function sortedEntries(object) {
  if (object instanceof Map) return [...object.entries()].sort(([left], [right]) => left.localeCompare(right));
  return Object.entries(object).sort(([left], [right]) => left.localeCompare(right));
}

function refName(ref) {
  return safeTypeName(String(ref).replace("#/$defs/", ""));
}

function safeTypeName(value) {
  const raw = String(value);
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) return raw;
  return pascal(raw.replace(/[^A-Za-z0-9_]+/g, "_"));
}

function lowerFirst(value) {
  return String(value).slice(0, 1).toLowerCase() + String(value).slice(1);
}

function pascal(value) {
  return String(value)
    .split(/[_\-.]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join("");
}

function sdkPath(object, method = null) {
  const raw = method?.sdk_method_name;
  if (typeof raw === "string" && raw.includes(".")) return raw.split(".");
  return [object.name, method?.name].filter(Boolean);
}

function sdkMethodName(object, method) {
  return sdkPath(object, method)[1] || method.name;
}

function statelessAliasObjects(objects) {
  const stateless = new Set();
  for (const object of objects) {
    if ((object.sticky_fields ?? []).length === 0 && schemaProperties(object.sticky_schema).size === 0) stateless.add(object.name);
  }
  return stateless;
}

function sanitizeRegistry(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeRegistry(item));
  if (value == null || typeof value !== "object") return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "description" || key === "$schema" || key === "event_type" || key === "root") continue;
    output[key] = sanitizeRegistry(child);
  }
  return output;
}

function sanitizeCommandRegistry(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeCommandRegistry(item));
  if (value == null || typeof value !== "object") return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "description" || key === "$schema" || key === "event_type" || key === "sdk_method_name" || key === "root") continue;
    output[key] = sanitizeCommandRegistry(child);
  }
  return output;
}


export {
  aliasObjectCanPopulateStickyParam,
  collectDefinitions,
  collectSchemaDefinitions,
  lowerFirst,
  paramsCanBeOmitted,
  pascal,
  receiverStickyParamFields,
  refName,
  requiredSet,
  safeTypeName,
  sanitizeCommandRegistry,
  sanitizeRegistry,
  schemaProperties,
  schemaPropertiesObject,
  sdkMethodName,
  sdkPath,
  sortedEntries,
  statelessAliasObjects,
  unionSchemas,
};
