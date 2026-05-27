// MODCDP_TS_ONLY: DO NOT TRANSLATE THIS FILE TO OTHER LANGUAGES.
// Reason: not needed by Stagehand.
import fs from "node:fs";
import path from "node:path";
import * as Runtime from "../types/generated/zod/Runtime.js";
import * as Target from "../types/generated/zod/Target.js";
import { defaultModCDPExtensionPath, prepareUnpackedExtension } from "./NodeExtensionFiles.js";
import {
  ExtensionInjector,
  InjectorConfigSchema,
  type ExtensionInjectionResult,
  type TargetInfo,
} from "./ExtensionInjector.js";
import { z } from "zod";

const EXT_ID_FROM_URL = /^chrome-extension:\/\/([a-z]+)\//;
const MODCDP_READY_EXPRESSION = "Boolean(globalThis.ModCDP?.handleCommand && globalThis.ModCDP?.addCustomEvent)";
const BORROW_BOOTSTRAP_STATUS_EXPRESSION = `
  (() => ({
    ok: Boolean(globalThis.ModCDP?.handleCommand && globalThis.ModCDP?.addCustomEvent),
    extension_id: globalThis.chrome?.runtime?.id ?? null,
    has_tabs: Boolean(globalThis.chrome?.tabs?.query),
    has_debugger: Boolean(globalThis.chrome?.debugger?.sendCommand && globalThis.chrome?.debugger?.getTargets),
  }))()
`;

const BorrowInjectorConfigSchema = InjectorConfigSchema.extend({
  injector_mode: z.literal("borrow").default("borrow"),
  injector_borrow_extension_path: z.string().optional(),
}).strict();
type BorrowInjectorConfig = z.infer<typeof BorrowInjectorConfigSchema>;

class BorrowExtensionInjector extends ExtensionInjector {
  declare config: BorrowInjectorConfig;
  private unpacked_extension_path: string | null = null;
  private cleanup: (() => Promise<void>) | null = null;
  private bootstrap_modcdp_server_expression: string | null = null;

  constructor(config: z.input<typeof BorrowInjectorConfigSchema> = {}) {
    super();
    this.config = BorrowInjectorConfigSchema.parse({ ...config, injector_mode: "borrow" });
  }

  override update(config: Record<string, unknown> = {}) {
    this.config = BorrowInjectorConfigSchema.parse({ ...this.config, ...config, injector_mode: "borrow" });
    return this;
  }

  async prepare() {
    if (this.bootstrap_modcdp_server_expression) {
      await super.prepare();
      return;
    }
    const extension_path = this.config.injector_borrow_extension_path ?? defaultModCDPExtensionPath();
    const prepared = await prepareUnpackedExtension(extension_path);
    this.unpacked_extension_path = prepared.unpacked_extension_path;
    this.cleanup = prepared.cleanup;
    const service_worker_path = path.join(this.unpacked_extension_path, "modcdp", "service_worker.js");
    let service_worker_source: string;
    try {
      service_worker_source = fs.readFileSync(service_worker_path, "utf8");
    } catch (error) {
      await this.cleanup();
      this.cleanup = null;
      this.unpacked_extension_path = null;
      throw error;
    }
    this.bootstrap_modcdp_server_expression = `
      async function() {
        if (!globalThis.ModCDP) {
          ${service_worker_source}
        }
        const ModCDP = globalThis.ModCDP;
        return {
          ok: Boolean(ModCDP?.handleCommand && ModCDP?.addCustomEvent),
          extension_id: globalThis.chrome?.runtime?.id ?? null,
          has_tabs: Boolean(globalThis.chrome?.tabs?.query),
          has_debugger: Boolean(globalThis.chrome?.debugger?.sendCommand && globalThis.chrome?.debugger?.getTargets),
        };
      }
    `;
    await super.prepare();
  }

  async inject() {
    const deadline = Date.now() + this.config.injector_service_worker_ready_timeout_ms;
    do {
      const borrowed = await this.borrowVisibleServiceWorkers();
      if (borrowed) return borrowed;
      await new Promise((resolve) => setTimeout(resolve, this.config.injector_service_worker_poll_interval_ms));
    } while (Date.now() < deadline);
    return null;
  }

  private async borrowVisibleServiceWorkers() {
    const borrowed: Array<{
      result: ExtensionInjectionResult;
      has_tabs: boolean;
      has_debugger: boolean;
    }> = [];
    const visible_service_workers = (await this.targetInfos()).filter((target) => {
      const target_url = target.url ?? "";
      return target.type === "service_worker" && target_url.startsWith("chrome-extension://");
    });
    const has_configured_matcher =
      Boolean(this.config.injector_service_worker_extension_id) ||
      this.config.injector_service_worker_url_includes.length > 0 ||
      this.config.injector_service_worker_url_suffixes.length > 0;
    const candidates = has_configured_matcher
      ? visible_service_workers.filter((target) => this.serviceWorkerTargetMatches(target))
      : visible_service_workers;
    for (const target of candidates) {
      try {
        const bootstrapped = await this.bootstrapTarget(target as TargetInfo);
        if (bootstrapped) borrowed.push(bootstrapped);
      } catch {}
    }
    borrowed.sort((a, b) => Number(b.has_debugger) - Number(a.has_debugger) || Number(b.has_tabs) - Number(a.has_tabs));
    return borrowed[0]?.result ?? null;
  }

  private async bootstrapTarget(target: TargetInfo): Promise<{
    result: ExtensionInjectionResult;
    has_tabs: boolean;
    has_debugger: boolean;
  } | null> {
    const attach_result = await this.config.send(Target.AttachToTargetCommand, {
      targetId: target.targetId,
      flatten: true,
    });
    const session_id = attach_result.sessionId;
    try {
      await this.config.send(Runtime.EnableCommand, {}, session_id).catch(() => {});
      const status = await this.config.send(
        Runtime.EvaluateCommand,
        {
          expression: BORROW_BOOTSTRAP_STATUS_EXPRESSION,
          returnByValue: true,
        },
        session_id,
      );
      let value = status.result?.value || {};
      if (!value.has_tabs || !value.has_debugger) {
        await this.config
          .send(Target.DetachFromTargetCommand, {
            sessionId: session_id,
          })
          .catch(() => {});
        return null;
      }
      if (!value.ok) {
        if (!this.bootstrap_modcdp_server_expression) {
          throw new Error("BorrowExtensionInjector requires prepare before inject.");
        }
        const bootstrap = await this.config.send(
          Runtime.EvaluateCommand,
          {
            expression: `(${this.bootstrap_modcdp_server_expression})()`,
            awaitPromise: true,
            returnByValue: true,
          },
          session_id,
        );
        value = bootstrap.result?.value || {};
      }
      if (!value.has_tabs || !value.has_debugger) {
        await this.config
          .send(Target.DetachFromTargetCommand, {
            sessionId: session_id,
          })
          .catch(() => {});
        return null;
      }
      let ready = Boolean(value.ok);
      if (ready && this.readyExpression() !== MODCDP_READY_EXPRESSION) {
        const probe = await this.config.send(
          Runtime.EvaluateCommand,
          {
            expression: this.readyExpression(),
            returnByValue: true,
          },
          session_id,
        );
        ready = probe.result?.value === true;
      }
      if (!ready) {
        await this.config
          .send(Target.DetachFromTargetCommand, {
            sessionId: session_id,
          })
          .catch(() => {});
        return null;
      }
      return {
        result: {
          source: "borrow",
          extension_id: value.extension_id || target.url?.match(EXT_ID_FROM_URL)?.[1] || null,
          target_id: target.targetId,
          url: target.url,
          session_id,
        },
        has_tabs: Boolean(value.has_tabs),
        has_debugger: Boolean(value.has_debugger),
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

  async close() {
    await super.close();
    await this.cleanup?.();
    this.cleanup = null;
  }
}

export { BorrowExtensionInjector, BorrowInjectorConfigSchema };
export type { BorrowInjectorConfig };
