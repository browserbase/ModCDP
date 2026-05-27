// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/injector/NodeExtensionFiles.py
// - ./go/modcdp/injector/NodeExtensionFiles.go
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

type PreparedExtension = {
  unpacked_extension_path: string;
  cleanup: () => Promise<void>;
};

function defaultModCDPExtensionPath() {
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

async function prepareUnpackedExtension(extension_path: string): Promise<PreparedExtension> {
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

async function extensionIdFromManifestKey(extension_path: string) {
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

export { defaultModCDPExtensionPath, prepareUnpackedExtension, extensionIdFromManifestKey };
export type { PreparedExtension };
