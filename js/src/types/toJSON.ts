// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/types/modcdp.py
// - ./go/modcdp/types/types.go
type ModCDPJSONChild = { toJSON(): unknown } | null | undefined;

type ModCDPJSONOptions = {
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

function modCDPToJSON(instance: object & { config?: unknown }, options: ModCDPJSONOptions = {}) {
  const children: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(options.children ?? {})) {
    if (child) children[key] = child.toJSON();
  }
  return {
    type: instance.constructor.name,
    config: options.config ?? instance.config ?? {},
    state: { ...simpleState(instance), ...simpleState(options.state ?? {}) },
    ...(Object.keys(children).length > 0 ? { children } : {}),
  };
}

export { modCDPToJSON };
