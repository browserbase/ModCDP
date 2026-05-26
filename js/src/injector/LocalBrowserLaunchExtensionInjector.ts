import {
  defaultModCDPExtensionPath,
  extensionIdFromManifestKey,
  ExtensionInjector,
  prepareUnpackedExtension,
} from "./ExtensionInjector.js";

export class LocalBrowserLaunchExtensionInjector extends ExtensionInjector {
  private unpacked_extension_path: string | null = null;
  private extension_id: string | null = null;
  private cleanup: (() => Promise<void>) | null = null;

  async prepare() {
    const extension_path = this.injector_extension_path ?? defaultModCDPExtensionPath();
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
    const discovered = await this.discoverReadyServiceWorker({
      matched_only: this.injector_trust_service_worker_target,
    });
    return discovered ? { ...discovered, source: "local_launch" } : null;
  }

  async close() {
    await super.close();
    await this.cleanup?.();
    this.cleanup = null;
  }

  private async resolveExtensionId() {
    if (this.extension_id) return this.extension_id;
    this.extension_id =
      typeof this.injector_extension_id === "string" && this.injector_extension_id.trim()
        ? this.injector_extension_id.trim()
        : null;
    if (!this.extension_id && this.unpacked_extension_path) {
      this.extension_id = await extensionIdFromManifestKey(this.unpacked_extension_path);
    }
    if (this.extension_id) this.injector_extension_id = this.extension_id;
    if (this.unpacked_extension_path) this.extra_args = [`--load-extension=${this.unpacked_extension_path}`];
    return this.extension_id;
  }
}
