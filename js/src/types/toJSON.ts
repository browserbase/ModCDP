// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/types/modcdp.py
// - ./go/modcdp/types/types.go
type ModCDPJSONChild = { toJSON(): unknown } | null | undefined;

type ModCDPJSONConfig = {
  config?: unknown;
  state?: object;
  children?: Record<string, ModCDPJSONChild>;
};

function simpleState(input: object) {
  const state: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "config" || key.includes("token") || key.includes("secret") || key.includes("api_key")) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") state[key] = value;
  }
  return state;
}

function modCDPToJSON(instance: object & { config?: unknown }, config: ModCDPJSONConfig = {}) {
  const children: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(config.children ?? {})) {
    if (child) children[key] = child.toJSON();
  }
  return {
    type: instance.constructor.name,
    config: config.config ?? instance.config ?? {},
    state: { ...simpleState(instance), ...simpleState(config.state ?? {}) },
    ...(Object.keys(children).length > 0 ? { children } : {}),
  };
}

export { modCDPToJSON };
