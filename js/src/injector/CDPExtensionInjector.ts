// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/injector/CDPExtensionInjector.py
// - ./go/modcdp/injector/CDPExtensionInjector.go
import { ExtensionInjector, InjectorConfigSchema, type TargetInfo } from "./ExtensionInjector.js";
import type { z } from "zod";
import { defaultModCDPExtensionPath, prepareUnpackedExtension } from "./NodeExtensionFiles.js";
import * as Extensions from "../types/generated/zod/Extensions.js";

class CDPExtensionInjector extends ExtensionInjector {
  private unpacked_extension_path: string | null = null;
  private cleanup: (() => Promise<void>) | null = null;

  constructor(config: z.input<typeof InjectorConfigSchema> = {}) {
    super({ ...config, injector_mode: "cdp" });
  }

  async prepare() {
    const extension_path = this.config.injector_cdp_extension_path ?? defaultModCDPExtensionPath();
    if (this.unpacked_extension_path) {
      await super.prepare();
      return;
    }
    const prepared = await prepareUnpackedExtension(extension_path);
    this.unpacked_extension_path = prepared.unpacked_extension_path;
    this.cleanup = prepared.cleanup;
    await super.prepare();
  }

  async inject() {
    const extension_path = this.unpacked_extension_path;
    if (!extension_path) return null;
    let load_result;
    try {
      load_result = await this.config.send(Extensions.LoadUnpackedCommand, {
        path: extension_path,
      });
    } catch (error) {
      const load_error = error instanceof Error ? error : new Error(String(error));
      if (/Method not available|Method.*not.*found|wasn't found/i.test(load_error.message)) {
        return null;
      }
      throw new Error(
        `Extensions.loadUnpacked failed for ${extension_path}: ${load_error.message}\n` +
          `If the path is correct and the manifest is valid, load the ModCDP extension manually in chrome://extensions and reconnect.`,
      );
    }

    const extension_id = load_result.id;
    if (typeof extension_id !== "string" || !extension_id) {
      throw new Error(`Extensions.loadUnpacked returned no extension id (got ${JSON.stringify(load_result)})`);
    }
    this.extension_id = extension_id;
    this.service_worker_extension_id = extension_id;

    const sw_url_prefix = `chrome-extension://${extension_id}/`;
    const deadline = Date.now() + this.config.injector_service_worker_ready_timeout_ms;
    while (Date.now() < deadline) {
      const target_infos = await this.targetInfos();
      const target = target_infos.find(
        (candidate) => candidate.type === "service_worker" && candidate.url.startsWith(sw_url_prefix),
      ) as TargetInfo | undefined;
      if (target) {
        const probed = await this.probeTarget(target);
        if (probed)
          return {
            ...probed,
            source: "cdp",
            extension_id,
          };
      }
      await new Promise((resolve) => setTimeout(resolve, this.config.injector_service_worker_poll_interval_ms));
    }
    throw new Error(`Timed out waiting for service worker target for extension ${extension_id}.`);
  }

  async close() {
    await super.close();
    await this.cleanup?.();
    this.cleanup = null;
  }
}

export { CDPExtensionInjector };
