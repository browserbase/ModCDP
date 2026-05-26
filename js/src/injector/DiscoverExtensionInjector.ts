import {
  extensionIdFromManifestKey,
  ExtensionInjector,
  prepareUnpackedExtension,
  type InjectorOptions,
  type PreparedExtension,
} from "./ExtensionInjector.js";

export class DiscoverExtensionInjector extends ExtensionInjector {
  private prepared_extension: PreparedExtension | null = null;

  constructor(options: InjectorOptions = {}) {
    super(options);
    this.injector_mode = "discover";
  }

  async prepare() {
    const extension_path = this.injector_discover_extension_path;
    if (!this.injector_service_worker_extension_id && extension_path) {
      this.prepared_extension = extension_path.endsWith(".zip") ? await prepareUnpackedExtension(extension_path) : null;
      this.injector_service_worker_extension_id = await extensionIdFromManifestKey(
        this.prepared_extension?.unpacked_extension_path ?? extension_path,
      );
    }
    await super.prepare();
  }

  async inject() {
    const discovered = await this.discoverReadyServiceWorker();
    if (discovered) return { ...discovered, source: "discover" };
    if (this.injector_trust_service_worker_target) {
      const waited = await this.waitForReadyServiceWorker(
        this.injector_service_worker_probe_timeout_ms ?? 10_000,
        {
          matched_only: true,
        },
      );
      if (waited) return { ...waited, source: "discover" };
    }
    if (!this.injector_require_service_worker_target) return null;
    const waited = await this.waitForReadyServiceWorker(
      this.injector_service_worker_ready_timeout_ms ?? 60_000,
      {
        matched_only: this.injector_trust_service_worker_target,
      },
    );
    if (waited) return { ...waited, source: "discover" };
    throw new Error(
      `Required ModCDP service worker target was not visible ` +
        `(${
          [
            ...(this.injector_service_worker_url_includes ?? []),
            ...(this.injector_service_worker_url_suffixes ?? []),
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
