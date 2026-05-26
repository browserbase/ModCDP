import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProtocolParams, ProtocolResult } from "../types/modcdp.js";
import { commands as RuntimeCommands } from "../types/generated/zod/Runtime.js";
import { commands as TargetCommands } from "../types/generated/zod/Target.js";

const EXT_ID_FROM_URL = /^chrome-extension:\/\/([a-z]+)\//;
export const DEFAULT_MODCDP_EXTENSION_ID = "mdedooklbnfejodmnhmkdpkaedafkehf";
export const DEFAULT_MODCDP_SERVICE_WORKER_URL_SUFFIXES = ["/modcdp/service_worker.js"];
const MODCDP_READY_EXPRESSION =
  "Boolean(globalThis.ModCDP?.__ModCDPServerVersion >= 1 && globalThis.ModCDP?.handleCommand && globalThis.ModCDP?.addCustomEvent)";
export const DEFAULT_CDP_SEND_TIMEOUT_MS = 10_000;
export const DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS = 10_000;
export const DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS = 10_000;
export const DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS = 60_000;
export const DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS = 100;
export const DEFAULT_TARGET_SESSION_POLL_INTERVAL_MS = 20;

export type SendCDP = (method: string, params?: ProtocolParams, session_id?: string | null) => Promise<ProtocolResult>;
export type TargetInfo = { targetId: string; type?: string; url?: string };

export type InjectorMode = "auto" | "discover" | "inject" | "borrow" | "none";
export type InjectorOptions = {
  injector_mode?: InjectorMode;
  injector_extension_path?: string | null;
  injector_extension_id?: string | null;
  injector_service_worker_url_includes?: string[];
  injector_service_worker_url_suffixes?: string[] | null;
  injector_trust_service_worker_target?: boolean;
  injector_require_service_worker_target?: boolean;
  injector_service_worker_ready_expression?: string | null;
  injector_execution_context_timeout_ms?: number;
  injector_service_worker_probe_timeout_ms?: number;
  injector_service_worker_ready_timeout_ms?: number;
  injector_service_worker_poll_interval_ms?: number;
  injector_target_session_poll_interval_ms?: number;
};

export type ExtensionInjectorConfig = {
  injector_mode?: InjectorMode;
  send?: SendCDP | null;
  sessionId_from_targetId?: Map<string, string> | null;
  ensureSessionForTarget?: (
    target_id: string,
    timeout_ms: number,
    allow_attach: boolean,
  ) => Promise<string | null | undefined>;
  waitForExecutionContext?: ((session_id: string, timeout_ms: number) => Promise<number>) | null;
  injector_extension_path?: string | null;
  injector_extension_id?: string | null;
  injector_service_worker_url_includes?: string[];
  injector_service_worker_url_suffixes?: string[];
  injector_trust_service_worker_target?: boolean;
  injector_require_service_worker_target?: boolean;
  injector_service_worker_ready_expression?: string | null;
  injector_cdp_send_timeout_ms?: number;
  injector_execution_context_timeout_ms?: number;
  injector_service_worker_probe_timeout_ms?: number;
  injector_service_worker_ready_timeout_ms?: number;
  injector_service_worker_poll_interval_ms?: number;
  injector_target_session_poll_interval_ms?: number;
  injector_browserbase_api_key?: string | null;
  injector_browserbase_base_url?: string | null;
  upstream_nativemessaging_host_name?: string | null;
  upstream_nats_url?: string | null;
  upstream_nats_subject_prefix?: string | null;
};

export type ExtensionInjectionResult = {
  source: string;
  extension_id?: string | null;
  target_id: string;
  url?: string;
  session_id: string;
  has_tabs?: boolean;
  has_debugger?: boolean;
};

export type PreparedExtension = {
  unpacked_extension_path: string;
  cleanup: () => Promise<void>;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function defaultModCDPExtensionPath() {
  if (typeof process === "object" && process?.versions?.node && import.meta.url.startsWith("file:")) {
    const relative_path = import.meta.url.includes("/dist/js/src/")
      ? "../../../../dist/extension.zip"
      : "../../../dist/extension.zip";
    return decodeURIComponent(new URL(/* @vite-ignore */ relative_path, import.meta.url).pathname);
  }
  return "../../../dist/extension.zip";
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export async function prepareUnpackedExtension(extension_path: string): Promise<PreparedExtension> {
  const unpacked_path = fs.mkdtempSync(path.join(os.tmpdir(), "modcdp-extension-"));
  const cleanup = async () => fs.rmSync(unpacked_path, { recursive: true, force: true });
  try {
    if (extension_path.endsWith(".zip")) {
      await extractZip(extension_path, unpacked_path);
    } else {
      fs.cpSync(extension_path, unpacked_path, { recursive: true });
    }
    return { unpacked_extension_path: extensionRoot(unpacked_path), cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export async function extensionIdFromManifestKey(extension_path: string) {
  const [crypto, fs, path] = await Promise.all([import("node:crypto"), import("node:fs"), import("node:path")]);
  const manifest_path = path.join(extension_path, "manifest.json");
  if (!fs.existsSync(manifest_path)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifest_path, "utf8")) as Record<string, unknown>;
  const key = firstString(manifest.key);
  if (!key) return null;
  const digest = crypto.createHash("sha256").update(Buffer.from(key, "base64")).digest().subarray(0, 16);
  const alphabet = "abcdefghijklmnop";
  return [...digest].map((byte) => alphabet[byte >> 4] + alphabet[byte & 0x0f]).join("");
}

function extensionRoot(unpacked_path: string) {
  if (fs.existsSync(path.join(unpacked_path, "manifest.json"))) return unpacked_path;
  const nested_path = path.join(unpacked_path, "extension");
  if (fs.existsSync(path.join(nested_path, "manifest.json"))) return nested_path;
  return unpacked_path;
}

async function extractZip(zip_path: string, destination: string) {
  const { execFileSync } = await import("node:child_process");
  const listing = execFileSync("unzip", ["-Z1", zip_path], {
    encoding: "utf8",
  });
  for (const raw_name of listing.split(/\r?\n/)) {
    if (!raw_name) continue;
    const name = raw_name.replaceAll("\\", "/");
    const normalized = path.posix.normalize(name);
    if (
      path.posix.isAbsolute(normalized) ||
      normalized === "." ||
      normalized === ".." ||
      normalized.startsWith("../")
    ) {
      throw new Error(`zip entry ${JSON.stringify(raw_name)} escapes extension extraction directory`);
    }
  }
  execFileSync("unzip", ["-q", zip_path, "-d", destination]);
}

export class ExtensionInjector {
  injector_mode: InjectorMode;
  send: SendCDP;
  sessionId_from_targetId: Map<string, string> | null;
  ensureSessionForTarget: (
    target_id: string,
    timeout_ms: number,
    allow_attach: boolean,
  ) => Promise<string | null | undefined>;
  waitForExecutionContext: ((session_id: string, timeout_ms: number) => Promise<number>) | null;
  injector_extension_path: string | null;
  injector_extension_id: string | null;
  injector_service_worker_url_includes: string[];
  injector_service_worker_url_suffixes: string[];
  injector_trust_service_worker_target: boolean;
  injector_require_service_worker_target: boolean;
  injector_service_worker_ready_expression: string | null;
  injector_cdp_send_timeout_ms: number;
  injector_execution_context_timeout_ms: number;
  injector_service_worker_probe_timeout_ms: number;
  injector_service_worker_ready_timeout_ms: number;
  injector_service_worker_poll_interval_ms: number;
  injector_target_session_poll_interval_ms: number;
  injector_browserbase_api_key: string | null;
  injector_browserbase_base_url: string | null;
  upstream_nativemessaging_host_name: string | null;
  upstream_nats_url: string | null;
  upstream_nats_subject_prefix: string | null;
  extra_args: string[];
  protected unusable_target_ids = new Set<string>();
  last_error: Error | null = null;

  constructor(options: ExtensionInjectorConfig = {}) {
    this.injector_mode = options.injector_mode ?? "none";
    this.send =
      options.send ??
      (async () => {
        throw new Error(`${this.constructor.name} requires a CDP send function.`);
      });
    this.sessionId_from_targetId = options.sessionId_from_targetId ?? null;
    this.ensureSessionForTarget = options.ensureSessionForTarget ?? (async () => null);
    this.waitForExecutionContext = options.waitForExecutionContext ?? null;
    this.injector_extension_path = options.injector_extension_path ?? null;
    this.injector_extension_id = options.injector_extension_id ?? null;
    this.injector_service_worker_url_includes = options.injector_service_worker_url_includes ?? [];
    this.injector_service_worker_url_suffixes =
      options.injector_service_worker_url_suffixes ?? DEFAULT_MODCDP_SERVICE_WORKER_URL_SUFFIXES;
    this.injector_trust_service_worker_target = options.injector_trust_service_worker_target ?? false;
    this.injector_require_service_worker_target = options.injector_require_service_worker_target ?? false;
    this.injector_service_worker_ready_expression = options.injector_service_worker_ready_expression ?? null;
    this.injector_cdp_send_timeout_ms = options.injector_cdp_send_timeout_ms ?? DEFAULT_CDP_SEND_TIMEOUT_MS;
    this.injector_execution_context_timeout_ms =
      options.injector_execution_context_timeout_ms ?? DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS;
    this.injector_service_worker_probe_timeout_ms =
      options.injector_service_worker_probe_timeout_ms ?? DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS;
    this.injector_service_worker_ready_timeout_ms =
      options.injector_service_worker_ready_timeout_ms ?? DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS;
    this.injector_service_worker_poll_interval_ms =
      options.injector_service_worker_poll_interval_ms ?? DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS;
    this.injector_target_session_poll_interval_ms =
      options.injector_target_session_poll_interval_ms ?? DEFAULT_TARGET_SESSION_POLL_INTERVAL_MS;
    this.injector_browserbase_api_key = options.injector_browserbase_api_key ?? null;
    this.injector_browserbase_base_url = options.injector_browserbase_base_url ?? null;
    this.upstream_nativemessaging_host_name = options.upstream_nativemessaging_host_name ?? null;
    this.upstream_nats_url = options.upstream_nats_url ?? null;
    this.upstream_nats_subject_prefix = options.upstream_nats_subject_prefix ?? null;
    this.extra_args = [];
  }

  update(config: ExtensionInjectorConfig = {}) {
    this.injector_mode = config.injector_mode ?? this.injector_mode;
    this.send = config.send ?? this.send;
    this.sessionId_from_targetId = config.sessionId_from_targetId ?? this.sessionId_from_targetId;
    this.ensureSessionForTarget = config.ensureSessionForTarget ?? this.ensureSessionForTarget;
    this.waitForExecutionContext = config.waitForExecutionContext ?? this.waitForExecutionContext;
    this.injector_extension_path = config.injector_extension_path ?? this.injector_extension_path;
    this.injector_extension_id = config.injector_extension_id ?? this.injector_extension_id;
    this.injector_service_worker_url_includes =
      config.injector_service_worker_url_includes ?? this.injector_service_worker_url_includes;
    this.injector_service_worker_url_suffixes =
      config.injector_service_worker_url_suffixes ?? this.injector_service_worker_url_suffixes;
    this.injector_trust_service_worker_target =
      config.injector_trust_service_worker_target ?? this.injector_trust_service_worker_target;
    this.injector_require_service_worker_target =
      config.injector_require_service_worker_target ?? this.injector_require_service_worker_target;
    this.injector_service_worker_ready_expression =
      config.injector_service_worker_ready_expression ?? this.injector_service_worker_ready_expression;
    this.injector_cdp_send_timeout_ms =
      config.injector_cdp_send_timeout_ms ?? this.injector_cdp_send_timeout_ms;
    this.injector_execution_context_timeout_ms =
      config.injector_execution_context_timeout_ms ?? this.injector_execution_context_timeout_ms;
    this.injector_service_worker_probe_timeout_ms =
      config.injector_service_worker_probe_timeout_ms ?? this.injector_service_worker_probe_timeout_ms;
    this.injector_service_worker_ready_timeout_ms =
      config.injector_service_worker_ready_timeout_ms ?? this.injector_service_worker_ready_timeout_ms;
    this.injector_service_worker_poll_interval_ms =
      config.injector_service_worker_poll_interval_ms ?? this.injector_service_worker_poll_interval_ms;
    this.injector_target_session_poll_interval_ms =
      config.injector_target_session_poll_interval_ms ?? this.injector_target_session_poll_interval_ms;
    this.injector_browserbase_api_key = config.injector_browserbase_api_key ?? this.injector_browserbase_api_key;
    this.injector_browserbase_base_url = config.injector_browserbase_base_url ?? this.injector_browserbase_base_url;
    this.upstream_nativemessaging_host_name =
      config.upstream_nativemessaging_host_name ?? this.upstream_nativemessaging_host_name;
    this.upstream_nats_url = config.upstream_nats_url ?? this.upstream_nats_url;
    this.upstream_nats_subject_prefix = config.upstream_nats_subject_prefix ?? this.upstream_nats_subject_prefix;
    return this;
  }

  async prepare() {}

  async close() {}

  async inject(): Promise<ExtensionInjectionResult | null> {
    throw new Error(`${this.constructor.name}.inject is not implemented.`);
  }

  protected readyExpression() {
    const expression = this.injector_service_worker_ready_expression;
    return expression == null || expression.length === 0
      ? MODCDP_READY_EXPRESSION
      : `(${MODCDP_READY_EXPRESSION}) && Boolean(${expression})`;
  }

  protected async sendWithTimeout(
    method: string,
    params: ProtocolParams = {},
    session_id: string | null = null,
    timeout_ms = this.injector_cdp_send_timeout_ms ?? DEFAULT_CDP_SEND_TIMEOUT_MS,
  ) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return Promise.race([
      this.send(method, params, session_id),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${method} timed out after ${timeout_ms}ms`)), timeout_ms);
      }),
    ]).finally(() => {
      if (timeout != null) clearTimeout(timeout);
    });
  }

  protected async targetInfos() {
    return TargetCommands["Target.getTargets"].result.parse(await this.send("Target.getTargets")).targetInfos;
  }

  protected async probeTarget(
    target: TargetInfo,
    session_timeout_ms = 0,
    { allow_attach = false }: { allow_attach?: boolean } = {},
  ): Promise<ExtensionInjectionResult | null> {
    if (this.unusable_target_ids.has(target.targetId)) return null;
    const mapped_session_id = this.sessionId_from_targetId?.get(target.targetId);
    const session_id =
      typeof mapped_session_id === "string" && mapped_session_id.length > 0
        ? mapped_session_id
        : ((await this.ensureSessionForTarget(target.targetId, session_timeout_ms, allow_attach)) ?? null);
    if (session_id == null) return null;
    await this.sendWithTimeout("Runtime.enable", {}, session_id);
    const probe = RuntimeCommands["Runtime.evaluate"].result.parse(
      await this.sendWithTimeout(
        "Runtime.evaluate",
        {
          expression: this.readyExpression(),
          returnByValue: true,
        },
        session_id,
      ),
    );
    if (probe.result?.value !== true) return null;
    return {
      source: "discovered",
      extension_id: target.url?.match(EXT_ID_FROM_URL)?.[1],
      target_id: target.targetId,
      url: target.url,
      session_id,
    };
  }

  protected async discoverReadyServiceWorker({ matched_only = false }: { matched_only?: boolean } = {}) {
    const target_infos = await this.targetInfos();
    if (this.injector_trust_service_worker_target) {
      const trusted_target = target_infos.find((candidate) => this.serviceWorkerTargetMatches(candidate)) as
        | TargetInfo
        | undefined;
      if (trusted_target) {
        const probed = await this.probeTarget(trusted_target, this.injector_service_worker_probe_timeout_ms, {
          allow_attach: true,
        });
        if (probed) return { ...probed, source: "trusted" };
      }
    }
    if (this.injector_trust_service_worker_target || matched_only) return null;
    for (const candidate of target_infos) {
      if (candidate.type !== "service_worker") continue;
      if (!candidate.url.startsWith("chrome-extension://")) continue;
      try {
        const probed = await this.probeTarget(
          candidate as TargetInfo,
          this.injector_service_worker_probe_timeout_ms,
        );
        if (probed) return probed;
      } catch {
        continue;
      }
    }
    return null;
  }

  protected async waitForReadyServiceWorker(
    timeout_ms: number,
    { matched_only = false }: { matched_only?: boolean } = {},
  ) {
    const deadline = Date.now() + timeout_ms;
    while (Date.now() < deadline) {
      const discovered = await this.discoverReadyServiceWorker({
        matched_only,
      });
      if (discovered) return discovered;
      await delay(this.injector_service_worker_poll_interval_ms ?? DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS);
    }
    return null;
  }

  protected serviceWorkerTargetMatches(candidate: { type?: string; url?: string }) {
    const url = candidate.url ?? "";
    if (candidate.type !== "service_worker") return false;
    if (!url.startsWith("chrome-extension://")) return false;
    const has_extension_id = Boolean(this.injector_extension_id);
    if (
      this.injector_extension_id &&
      !url.startsWith(`chrome-extension://${this.injector_extension_id}/`)
    )
      return false;
    const includes = this.injector_service_worker_url_includes ?? [];
    const suffixes = this.injector_service_worker_url_suffixes ?? [];
    if (includes.length > 0 && !includes.every((part) => url.includes(part))) return false;
    if (suffixes.length > 0 && !suffixes.some((suffix) => url.endsWith(suffix))) return false;
    return has_extension_id || includes.length > 0 || suffixes.length > 0;
  }
}
