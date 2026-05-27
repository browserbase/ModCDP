// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/injector/CLIExtensionInjector.py
// - ./go/modcdp/injector/CLIExtensionInjector.go
import { ExtensionInjector, InjectorConfigSchema } from "./ExtensionInjector.js";
import type { z } from "zod";
import {
  defaultModCDPExtensionPath,
  extensionIdFromManifestKey,
  prepareUnpackedExtension,
} from "./NodeExtensionFiles.js";

class CLIExtensionInjector extends ExtensionInjector {
  private unpacked_extension_path: string | null = null;
  private cleanup: (() => Promise<void>) | null = null;

  constructor(config: z.input<typeof InjectorConfigSchema> = {}) {
    super({ ...config, injector_mode: "cli" });
  }

  async prepare() {
    const extension_path = this.config.injector_cli_extension_path ?? defaultModCDPExtensionPath();
    if (this.unpacked_extension_path) {
      await super.prepare();
      return;
    }
    const prepared = await prepareUnpackedExtension(extension_path);
    this.unpacked_extension_path = prepared.unpacked_extension_path;
    this.cleanup = prepared.cleanup;
    await this.resolveExtensionId();
    await super.prepare();
  }

  async inject() {
    const discovered = await this.waitForReadyServiceWorker(this.config.injector_service_worker_ready_timeout_ms, {
      matched_only: this.config.injector_trust_service_worker_target,
    });
    return discovered ? { ...discovered, source: "cli" } : null;
  }

  async close() {
    await super.close();
    await this.cleanup?.();
    this.cleanup = null;
  }

  private async resolveExtensionId() {
    if (this.extension_id) return this.extension_id;
    this.extension_id =
      typeof this.config.injector_cli_extension_id === "string" && this.config.injector_cli_extension_id.trim()
        ? this.config.injector_cli_extension_id.trim()
        : null;
    if (!this.extension_id && this.unpacked_extension_path) {
      this.extension_id = await extensionIdFromManifestKey(this.unpacked_extension_path);
    }
    if (this.extension_id) {
      this.service_worker_extension_id = this.extension_id;
      this.update({ injector_service_worker_extension_id: this.extension_id });
    }
    if (this.unpacked_extension_path) this.extra_args = [`--load-extension=${this.unpacked_extension_path}`];
    return this.extension_id;
  }
}

export { CLIExtensionInjector };
