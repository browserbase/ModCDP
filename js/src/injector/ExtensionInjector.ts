// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/injector/ExtensionInjector.py
// - ./go/modcdp/injector/ExtensionInjector.go
import { z } from "zod";
import type { LauncherConfig } from "../launcher/BrowserLauncher.js";
import type { TargetRoute, UpstreamTransportConfig } from "../transport/UpstreamTransport.js";
import type { cdp } from "../types/generated/cdp.js";
import type { CdpCommandSchema } from "../types/generated/zod/helpers.js";
import * as Runtime from "../types/generated/zod/Runtime.js";
import * as Target from "../types/generated/zod/Target.js";
import type { ProtocolParams, ProtocolResult } from "../types/modcdp.js";
import { modCDPToJSON } from "../types/toJSON.js";

const EXT_ID_FROM_URL = /^chrome-extension:\/\/([a-z]+)\//;
const DEFAULT_MODCDP_EXTENSION_ID = "mdedooklbnfejodmnhmkdpkaedafkehf";
const DEFAULT_MODCDP_SERVICE_WORKER_URL_SUFFIXES = ["/modcdp/service_worker.js"];
const MODCDP_READY_EXPRESSION = "Boolean(globalThis.ModCDP?.handleCommand && globalThis.ModCDP?.addCustomEvent)";
const DEFAULT_CDP_SEND_TIMEOUT_MS = 10_000;
const DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS = 10_000;
const DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS = 10_000;
const DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS = 60_000;
const DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS = 100;
const DEFAULT_TARGET_SESSION_POLL_INTERVAL_MS = 20;
const DEFAULT_BROWSERBASE_BASE_URL = "https://api.browserbase.com";

interface SendCDP {
  (method: string, params?: ProtocolParams, session_id?: string | null): Promise<ProtocolResult>;
  <
    Params extends z.ZodType<Record<string, unknown>>,
    Result extends z.ZodType<Record<string, unknown>>,
    Name extends string,
  >(
    command: CdpCommandSchema<Params, Result, Name>,
    params?: z.input<Params>,
    route?: TargetRoute | cdp.types.ts.Target.SessionID | null,
  ): Promise<z.output<Result>>;
}
type TargetInfo = { targetId: string; type?: string; url?: string };

const InjectorModeSchema = z.enum(["cli", "cdp", "bb", "discover", "none"]);
type InjectorMode = z.infer<typeof InjectorModeSchema>;

const DefaultSendCDP: SendCDP = async () => {
  throw new Error("ExtensionInjector requires a CDP send function.");
};

const InjectorConfigSchema = z
  .object({
    injector_mode: InjectorModeSchema.default("none"),
    send: z.custom<SendCDP>((value) => typeof value === "function").default(() => DefaultSendCDP),
    injector_cli_extension_path: z.string().optional(),
    injector_cli_extension_id: z.string().optional(),
    injector_cdp_extension_path: z.string().optional(),
    injector_cdp_extension_id: z.string().optional(),
    injector_bb_extension_path: z.string().optional(),
    injector_bb_extension_id: z.string().optional(),
    injector_discover_extension_path: z.string().optional(),
    injector_service_worker_extension_id: z.string().nullable().optional(),
    injector_service_worker_url_includes: z.array(z.string()).default([]),
    injector_service_worker_url_suffixes: z.array(z.string()).default(DEFAULT_MODCDP_SERVICE_WORKER_URL_SUFFIXES),
    injector_trust_service_worker_target: z.boolean().default(false),
    injector_require_service_worker_target: z.boolean().default(false),
    injector_service_worker_ready_expression: z.string().default(MODCDP_READY_EXPRESSION),
    injector_cdp_send_timeout_ms: z.number().positive().default(DEFAULT_CDP_SEND_TIMEOUT_MS),
    injector_execution_context_timeout_ms: z.number().positive().default(DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS),
    injector_service_worker_probe_timeout_ms: z.number().positive().default(DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS),
    injector_service_worker_ready_timeout_ms: z.number().positive().default(DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS),
    injector_service_worker_poll_interval_ms: z.number().positive().default(DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS),
    injector_target_session_poll_interval_ms: z.number().positive().default(DEFAULT_TARGET_SESSION_POLL_INTERVAL_MS),
    injector_bb_api_key: z.string().optional(),
    injector_bb_base_url: z.string().default(DEFAULT_BROWSERBASE_BASE_URL),
  })
  .strict();
type InjectorConfig = z.infer<typeof InjectorConfigSchema>;
type InjectorBaseConfig = Omit<InjectorConfig, "injector_mode"> & { injector_mode: string };

type ExtensionInjectionResult = {
  source: string;
  extension_id?: string | null;
  target_id: string;
  url?: string;
  session_id: string;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ExtensionInjector {
  config: InjectorBaseConfig;
  source: string | null;
  extension_id: string | null;
  service_worker_extension_id: string | null;
  target_id: string | null;
  url: string | null;
  session_id: string | null;
  extra_args: string[];
  protected unusable_target_ids = new Set<string>();

  constructor(config: z.input<typeof InjectorConfigSchema> = {}) {
    this.config = InjectorConfigSchema.parse(config);
    this.source = null;
    this.extension_id = null;
    this.service_worker_extension_id = null;
    this.target_id = null;
    this.url = null;
    this.session_id = null;
    this.extra_args = [];
  }

  update(config: z.input<typeof InjectorConfigSchema> | Record<string, unknown> = {}) {
    this.config = InjectorConfigSchema.parse({ ...this.config, ...config });
    return this;
  }

  recordInjectionResult(result: ExtensionInjectionResult) {
    this.source = result.source;
    this.extension_id = result.extension_id ?? null;
    this.service_worker_extension_id = result.extension_id ?? this.service_worker_extension_id;
    this.target_id = result.target_id;
    this.url = result.url ?? null;
    this.session_id = result.session_id;
    return this;
  }

  async prepare() {}

  async close() {}

  async inject(): Promise<ExtensionInjectionResult | null> {
    throw new Error(`${this.constructor.name}.inject is not implemented.`);
  }

  configForLauncher(): LauncherConfig {
    return {
      launcher_local_extra_args: this.extra_args,
      launcher_bb_extension_id: this.config.injector_bb_extension_id,
    };
  }

  configForUpstream(): UpstreamTransportConfig {
    return {};
  }

  toJSON() {
    return modCDPToJSON(this, {
      config: { ...this.config, send: undefined },
    });
  }

  protected readyExpression() {
    const expression = this.config.injector_service_worker_ready_expression;
    return expression === MODCDP_READY_EXPRESSION
      ? expression
      : `(${MODCDP_READY_EXPRESSION}) && Boolean(${expression})`;
  }

  protected async targetInfos() {
    return (await this.config.send(Target.GetTargetsCommand, {})).targetInfos;
  }

  protected async probeTarget(target: TargetInfo): Promise<ExtensionInjectionResult | null> {
    if (this.unusable_target_ids.has(target.targetId)) return null;
    const attached = await this.config.send(Target.AttachToTargetCommand, {
      targetId: target.targetId,
      flatten: true,
    });
    const session_id = attached.sessionId;
    try {
      await this.config.send(Runtime.EnableCommand, {}, session_id);
      const probe = await this.config.send(
        Runtime.EvaluateCommand,
        {
          expression: this.readyExpression(),
          returnByValue: true,
        },
        session_id,
      );
      if (probe.result?.value !== true) {
        await this.config
          .send(Target.DetachFromTargetCommand, {
            sessionId: session_id,
          })
          .catch(() => {});
        return null;
      }
      return {
        source: "discover",
        extension_id: target.url?.match(EXT_ID_FROM_URL)?.[1],
        target_id: target.targetId,
        url: target.url,
        session_id,
      };
    } catch (error) {
      await this.config
        .send(Target.DetachFromTargetCommand, {
          sessionId: session_id,
        })
        .catch(() => {});
      throw error;
    }
  }

  protected async discoverReadyServiceWorker({ matched_only = false }: { matched_only?: boolean } = {}) {
    const target_infos = await this.targetInfos();
    if (this.config.injector_trust_service_worker_target) {
      const trusted_target = target_infos.find((candidate) => this.serviceWorkerTargetMatches(candidate)) as
        | TargetInfo
        | undefined;
      if (trusted_target) {
        const probed = await this.probeTarget(trusted_target);
        if (probed) return { ...probed, source: "trusted" };
      }
    }
    if (this.config.injector_trust_service_worker_target || matched_only) return null;
    for (const candidate of target_infos) {
      if (candidate.type !== "service_worker") continue;
      if (!candidate.url.startsWith("chrome-extension://")) continue;
      try {
        const probed = await this.probeTarget(candidate as TargetInfo);
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
      await delay(this.config.injector_service_worker_poll_interval_ms);
    }
    return null;
  }

  protected serviceWorkerTargetMatches(candidate: { type?: string; url?: string }) {
    const url = candidate.url ?? "";
    if (candidate.type !== "service_worker") return false;
    if (!url.startsWith("chrome-extension://")) return false;
    const service_worker_extension_id =
      this.config.injector_service_worker_extension_id ?? this.service_worker_extension_id;
    const has_extension_id = Boolean(service_worker_extension_id);
    if (service_worker_extension_id && !url.startsWith(`chrome-extension://${service_worker_extension_id}/`))
      return false;
    const includes = this.config.injector_service_worker_url_includes;
    const suffixes = this.config.injector_service_worker_url_suffixes;
    if (includes.length > 0 && !includes.every((part) => url.includes(part))) return false;
    if (suffixes.length > 0 && !suffixes.some((suffix) => url.endsWith(suffix))) return false;
    return has_extension_id || includes.length > 0 || suffixes.length > 0;
  }
}

export {
  DEFAULT_MODCDP_EXTENSION_ID,
  DEFAULT_MODCDP_SERVICE_WORKER_URL_SUFFIXES,
  DEFAULT_CDP_SEND_TIMEOUT_MS,
  DEFAULT_EXECUTION_CONTEXT_TIMEOUT_MS,
  DEFAULT_SERVICE_WORKER_PROBE_TIMEOUT_MS,
  DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS,
  DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS,
  DEFAULT_TARGET_SESSION_POLL_INTERVAL_MS,
  DEFAULT_BROWSERBASE_BASE_URL,
  ExtensionInjector,
};
export { InjectorModeSchema, InjectorConfigSchema };
export type { SendCDP, TargetInfo, InjectorMode, InjectorBaseConfig, InjectorConfig, ExtensionInjectionResult };
