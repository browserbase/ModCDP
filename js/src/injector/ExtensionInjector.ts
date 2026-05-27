import type { z } from "zod";
import type { LauncherOptions } from "../launcher/BrowserLauncher.js";
import type { TargetRoute, UpstreamTransportOptions } from "../transport/UpstreamTransport.js";
import type { cdp } from "../types/generated/cdp.js";
import type { CdpCommandSchema } from "../types/generated/zod/helpers.js";
import * as Runtime from "../types/generated/zod/Runtime.js";
import * as Target from "../types/generated/zod/Target.js";
import type { ProtocolParams, ProtocolResult } from "../types/modcdp.js";

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

type InjectorMode =
  | "cli" // launch local chrome with --load-extension=/path/to/extension CLI args
  | "cdp" // connect to existing chrome and inject via Extensions.loadUnpacked(...) CDP API
  | "bb" // use Browserbase extension (via Browserbase SDK extensions upload API)
  | "discover" // auto-discover an existing extension service worker thats already running in the browser
  | "borrow" // hijack *any* extension service worker in the browser that has enough permissions to run our ModCDP server (essentially running as a parasite on some other random extension, not recommended for production)
  | "none"; // no ModCDPServer at all
type InjectorOptions = {
  injector_mode?: InjectorMode;
  send?: SendCDP | null;
  injector_cli_extension_path?: string | null;
  injector_cli_extension_id?: string | null;
  injector_cdp_extension_path?: string | null;
  injector_cdp_extension_id?: string | null;
  injector_bb_extension_path?: string | null;
  injector_bb_extension_id?: string | null;
  injector_discover_extension_path?: string | null;
  injector_borrow_extension_path?: string | null;
  injector_service_worker_extension_id?: string | null;
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
  injector_bb_api_key?: string | null;
  injector_bb_base_url?: string | null;
};

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
  injector_mode: InjectorMode;
  send: SendCDP;
  injector_cli_extension_path: string | null;
  injector_cli_extension_id: string | null;
  injector_cdp_extension_path: string | null;
  injector_cdp_extension_id: string | null;
  injector_bb_extension_path: string | null;
  injector_bb_extension_id: string | null;
  injector_discover_extension_path: string | null;
  injector_borrow_extension_path: string | null;
  injector_service_worker_extension_id: string | null;
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
  injector_bb_api_key: string | null;
  injector_bb_base_url: string | null;
  source: string | null;
  extension_id: string | null;
  target_id: string | null;
  url: string | null;
  session_id: string | null;
  extra_args: string[];
  protected unusable_target_ids = new Set<string>();

  constructor(options: InjectorOptions = {}) {
    this.injector_mode = options.injector_mode ?? "none";
    this.send =
      options.send ??
      (async () => {
        throw new Error(`${this.constructor.name} requires a CDP send function.`);
      });
    this.injector_cli_extension_path = options.injector_cli_extension_path ?? null;
    this.injector_cli_extension_id = options.injector_cli_extension_id ?? null;
    this.injector_cdp_extension_path = options.injector_cdp_extension_path ?? null;
    this.injector_cdp_extension_id = options.injector_cdp_extension_id ?? null;
    this.injector_bb_extension_path = options.injector_bb_extension_path ?? null;
    this.injector_bb_extension_id = options.injector_bb_extension_id ?? null;
    this.injector_discover_extension_path = options.injector_discover_extension_path ?? null;
    this.injector_borrow_extension_path = options.injector_borrow_extension_path ?? null;
    this.injector_service_worker_extension_id = options.injector_service_worker_extension_id ?? null;
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
    this.injector_bb_api_key = options.injector_bb_api_key ?? null;
    this.injector_bb_base_url = options.injector_bb_base_url ?? null;
    this.source = null;
    this.extension_id = null;
    this.target_id = null;
    this.url = null;
    this.session_id = null;
    this.extra_args = [];
  }

  update(config: InjectorOptions = {}) {
    this.injector_mode = config.injector_mode ?? this.injector_mode;
    this.send = config.send ?? this.send;
    this.injector_cli_extension_path = config.injector_cli_extension_path ?? this.injector_cli_extension_path;
    this.injector_cli_extension_id = config.injector_cli_extension_id ?? this.injector_cli_extension_id;
    this.injector_cdp_extension_path = config.injector_cdp_extension_path ?? this.injector_cdp_extension_path;
    this.injector_cdp_extension_id = config.injector_cdp_extension_id ?? this.injector_cdp_extension_id;
    this.injector_bb_extension_path = config.injector_bb_extension_path ?? this.injector_bb_extension_path;
    this.injector_bb_extension_id = config.injector_bb_extension_id ?? this.injector_bb_extension_id;
    this.injector_discover_extension_path =
      config.injector_discover_extension_path ?? this.injector_discover_extension_path;
    this.injector_borrow_extension_path = config.injector_borrow_extension_path ?? this.injector_borrow_extension_path;
    this.injector_service_worker_extension_id =
      config.injector_service_worker_extension_id ?? this.injector_service_worker_extension_id;
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
    this.injector_cdp_send_timeout_ms = config.injector_cdp_send_timeout_ms ?? this.injector_cdp_send_timeout_ms;
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
    this.injector_bb_api_key = config.injector_bb_api_key ?? this.injector_bb_api_key;
    this.injector_bb_base_url = config.injector_bb_base_url ?? this.injector_bb_base_url;
    return this;
  }

  recordInjectionResult(result: ExtensionInjectionResult) {
    this.source = result.source;
    this.extension_id = result.extension_id ?? null;
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

  configForLauncher(): LauncherOptions {
    return {
      launcher_local_extra_args: this.extra_args,
      launcher_bb_extension_id: this.injector_bb_extension_id,
    };
  }

  configForUpstream(): UpstreamTransportOptions {
    return {};
  }

  protected readyExpression() {
    const expression = this.injector_service_worker_ready_expression;
    return expression == null || expression.length === 0
      ? MODCDP_READY_EXPRESSION
      : `(${MODCDP_READY_EXPRESSION}) && Boolean(${expression})`;
  }

  protected async targetInfos() {
    return (await this.send(Target.GetTargetsCommand, {})).targetInfos;
  }

  protected async probeTarget(target: TargetInfo): Promise<ExtensionInjectionResult | null> {
    if (this.unusable_target_ids.has(target.targetId)) return null;
    const attached = await this.send(Target.AttachToTargetCommand, {
      targetId: target.targetId,
      flatten: true,
    });
    const session_id = attached.sessionId;
    try {
      await this.send(Runtime.EnableCommand, {}, session_id);
      const probe = await this.send(
        Runtime.EvaluateCommand,
        {
          expression: this.readyExpression(),
          returnByValue: true,
        },
        session_id,
      );
      if (probe.result?.value !== true) {
        await this.send(Target.DetachFromTargetCommand, {
          sessionId: session_id,
        }).catch(() => {});
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
      await this.send(Target.DetachFromTargetCommand, {
        sessionId: session_id,
      }).catch(() => {});
      throw error;
    }
  }

  protected async discoverReadyServiceWorker({ matched_only = false }: { matched_only?: boolean } = {}) {
    const target_infos = await this.targetInfos();
    if (this.injector_trust_service_worker_target) {
      const trusted_target = target_infos.find((candidate) => this.serviceWorkerTargetMatches(candidate)) as
        | TargetInfo
        | undefined;
      if (trusted_target) {
        const probed = await this.probeTarget(trusted_target);
        if (probed) return { ...probed, source: "trusted" };
      }
    }
    if (this.injector_trust_service_worker_target || matched_only) return null;
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
      await delay(this.injector_service_worker_poll_interval_ms ?? DEFAULT_SERVICE_WORKER_POLL_INTERVAL_MS);
    }
    return null;
  }

  protected serviceWorkerTargetMatches(candidate: { type?: string; url?: string }) {
    const url = candidate.url ?? "";
    if (candidate.type !== "service_worker") return false;
    if (!url.startsWith("chrome-extension://")) return false;
    const has_extension_id = Boolean(this.injector_service_worker_extension_id);
    if (
      this.injector_service_worker_extension_id &&
      !url.startsWith(`chrome-extension://${this.injector_service_worker_extension_id}/`)
    )
      return false;
    const includes = this.injector_service_worker_url_includes ?? [];
    const suffixes = this.injector_service_worker_url_suffixes ?? [];
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
  ExtensionInjector,
};
export type { SendCDP, TargetInfo, InjectorMode, InjectorOptions, ExtensionInjectionResult };
