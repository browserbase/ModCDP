// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/injector/DiscoverExtensionInjector.py
// - ./go/modcdp/injector/DiscoverExtensionInjector.go
import { ExtensionInjector, InjectorConfigSchema } from "./ExtensionInjector.js";
import type { z } from "zod";
import { extensionIdFromManifestKey, prepareUnpackedExtension, type PreparedExtension } from "./NodeExtensionFiles.js";

class DiscoverExtensionInjector extends ExtensionInjector {
  private prepared_extension: PreparedExtension | null = null;

  constructor(config: z.input<typeof InjectorConfigSchema> = {}) {
    super({ ...config, injector_mode: "discover" });
  }

  async prepare() {
    const extension_path = this.config.injector_discover_extension_path;
    if (!this.config.injector_service_worker_extension_id && extension_path) {
      this.prepared_extension = extension_path.endsWith(".zip") ? await prepareUnpackedExtension(extension_path) : null;
      this.service_worker_extension_id = await extensionIdFromManifestKey(
        this.prepared_extension?.unpacked_extension_path ?? extension_path,
      );
    }
    await super.prepare();
  }

  async inject() {
    const discovered = await this.discoverReadyServiceWorker();
    if (discovered) return { ...discovered, source: "discover" };
    if (this.config.injector_trust_service_worker_target) {
      const waited = await this.waitForReadyServiceWorker(this.config.injector_service_worker_probe_timeout_ms, {
        matched_only: true,
      });
      if (waited) return { ...waited, source: "discover" };
    }
    if (!this.config.injector_require_service_worker_target) return null;
    const waited = await this.waitForReadyServiceWorker(this.config.injector_service_worker_ready_timeout_ms, {
      matched_only: this.config.injector_trust_service_worker_target,
    });
    if (waited) return { ...waited, source: "discover" };
    throw new Error(
      `Required ModCDP service worker target was not visible ` +
        `(${
          [
            ...this.config.injector_service_worker_url_includes,
            ...this.config.injector_service_worker_url_suffixes,
          ].join(", ") || "no matcher"
        }).`,
    );
  }

  async close() {
    await super.close();
    await this.prepared_extension?.cleanup();
    this.prepared_extension = null;
  }
}

export { DiscoverExtensionInjector };
