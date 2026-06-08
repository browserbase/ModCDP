import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { generateClientWithAliasesForGo } from "./codegen_go.ts";
import { generateClientWithAliasesForPython } from "./codegen_python.ts";
import { generateClientWithAliasesForTs } from "./codegen_ts.ts";

type GenerateClientWithAliasesLanguage = "ts" | "python" | "go";

type GenerateClientWithAliasesOptions = {
  language: GenerateClientWithAliasesLanguage;
  name: string;
  custom_commands?: unknown[];
  custom_alias_objects?: unknown[];
  default_config?: unknown;
  output?: string;
};

export type { GenerateClientWithAliasesLanguage, GenerateClientWithAliasesOptions };
export { generateClientWithAliases };

function generateClientWithAliases(options: GenerateClientWithAliasesOptions): string {
  const objects = (options.custom_alias_objects ?? []) as any[];
  const commands = (options.custom_commands ?? []) as any[];
  let generated: string;
  if (options.language === "ts") generated = generateClientWithAliasesForTs(options, objects, commands);
  else if (options.language === "python") generated = generateClientWithAliasesForPython(options, objects, commands);
  else generated = generateClientWithAliasesForGo(options, objects, commands);
  if (options.output) {
    mkdirSync(dirname(options.output), { recursive: true });
    writeFileSync(options.output, generated);
  }
  return generated;
}
