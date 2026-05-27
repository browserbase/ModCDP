// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/injector/BBExtensionInjector.py
// - ./go/modcdp/injector/BBExtensionInjector.go
import { ExtensionInjector, InjectorConfigSchema } from "./ExtensionInjector.js";
import type { z } from "zod";
import type { LauncherConfig } from "../launcher/BrowserLauncher.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

class BBExtensionInjector extends ExtensionInjector {
  private zip_path: string | null = null;
  private cleanup: (() => Promise<void>) | null = null;

  constructor(config: z.input<typeof InjectorConfigSchema> = {}) {
    super({ ...config, injector_mode: "bb" });
  }

  async prepare() {
    if (this.config.injector_bb_extension_id) {
      this.extension_id = this.config.injector_bb_extension_id;
      return;
    }
    if (this.extension_id) return;
    const extension_path = this.config.injector_bb_extension_path;
    if (!extension_path) return;
    this.zip_path = extension_path.endsWith(".zip") ? extension_path : await this.zipExtensionDir(extension_path);
    try {
      this.extension_id = await this.uploadExtension(this.zip_path);
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async inject() {
    const discovered = await this.waitForReadyServiceWorker(this.config.injector_service_worker_ready_timeout_ms, {
      matched_only: this.config.injector_trust_service_worker_target,
    });
    return discovered ? { ...discovered, source: "bb" } : null;
  }

  override configForLauncher(): LauncherConfig {
    return {
      ...super.configForLauncher(),
      launcher_bb_extension_id: this.extension_id ?? this.config.injector_bb_extension_id,
    };
  }

  async close() {
    await this.cleanup?.();
    this.cleanup = null;
  }

  private async zipExtensionDir(extension_path: string) {
    const zip_path = path.join(mkdtempSync(path.join(tmpdir(), "modcdp-bb-extension-")), "extension.zip");
    execFileSync("zip", ["-X", "-qr", zip_path, "."], { cwd: extension_path });
    this.cleanup = async () => rmSync(path.dirname(zip_path), { recursive: true, force: true });
    return zip_path;
  }

  private async uploadExtension(zip_path: string) {
    const browserbase_api_key = this.config.injector_bb_api_key ?? process.env.BROWSERBASE_API_KEY;
    if (!browserbase_api_key) {
      throw new Error("BBExtensionInjector requires BROWSERBASE_API_KEY or injector.injector_bb_api_key.");
    }
    const base_url = this.config.injector_bb_base_url;
    const form = new FormData();
    const zip_bytes = readFileSync(zip_path);
    const zip_array_buffer = zip_bytes.buffer.slice(
      zip_bytes.byteOffset,
      zip_bytes.byteOffset + zip_bytes.byteLength,
    ) as ArrayBuffer;
    form.append("file", new Blob([zip_array_buffer]), path.basename(zip_path));
    const response = await fetch(new URL("/v1/extensions", `${base_url.replace(/\/$/, "")}/`), {
      method: "POST",
      headers: { "X-BB-API-Key": browserbase_api_key },
      body: form,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Browserbase POST /v1/extensions -> ${response.status}${text ? `: ${text}` : ""}`);
    }
    const extension = (await response.json()) as Record<string, unknown>;
    if (typeof extension.id !== "string" || !extension.id) {
      throw new Error(`Browserbase extension upload returned no id (got ${JSON.stringify(extension)})`);
    }
    return extension.id;
  }
}

export { BBExtensionInjector };
