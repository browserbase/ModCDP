// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_CLIExtensionInjector.py
// - ./go/modcdp/injector/CLIExtensionInjector_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { DEFAULT_MODCDP_EXTENSION_ID } from "../src/injector/ExtensionInjector.js";
import { CLIExtensionInjector } from "../src/injector/CLIExtensionInjector.js";
import { LocalBrowserLauncher } from "../src/launcher/LocalBrowserLauncher.js";
import { WSUpstreamTransport } from "../src/transport/WSUpstreamTransport.js";
import { loadExtensionTestBrowserPath } from "./browserPaths.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, "..", "..", "dist", "extension");
const DOES_NOT_EXIST_EXTENSION_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const LOAD_EXTENSION_TEST_BROWSER_PATH = loadExtensionTestBrowserPath();

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZipEntry(name: string, data: Buffer) {
  const name_buffer = Buffer.from(name);
  const checksum = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name_buffer.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name_buffer.length, 28);
  const central_offset = local.length + name_buffer.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name_buffer.length, 12);
  end.writeUInt32LE(central_offset, 16);
  return Buffer.concat([local, name_buffer, data, central, name_buffer, end]);
}

test("CLIExtensionInjector rejects zip entries outside extraction directory", async () => {
  const temp_dir = mkdtempSync(path.join(os.tmpdir(), "modcdp-bad-zip-"));
  const zip_path = path.join(temp_dir, "extension.zip");
  writeFileSync(zip_path, storedZipEntry("../evil.txt", Buffer.from("evil")));
  const injector = new CLIExtensionInjector({
    injector_cli_extension_path: zip_path,
  });

  try {
    await assert.rejects(() => injector.prepare(), /escapes extension extraction directory/);
    assert.equal(existsSync(path.join(temp_dir, "evil.txt")), false);
  } finally {
    await injector.close();
    rmSync(temp_dir, { recursive: true, force: true });
  }
});

test("CLIExtensionInjector prepares an unpacked extension directory for --load-extension", async () => {
  const injector = new CLIExtensionInjector({
    injector_cli_extension_path: EXTENSION_PATH,
  });

  try {
    await injector.prepare();
    const unpacked_extension_path = (injector as unknown as { unpacked_extension_path?: string | null })
      .unpacked_extension_path;
    assert.equal(typeof unpacked_extension_path, "string");
    assert.notEqual(unpacked_extension_path, EXTENSION_PATH);
    assert.equal(existsSync(path.join(unpacked_extension_path!, "manifest.json")), true);
    assert.deepEqual(injector.extra_args, [`--load-extension=${unpacked_extension_path}`]);
    assert.equal(injector.config.injector_service_worker_extension_id, DEFAULT_MODCDP_EXTENSION_ID);
  } finally {
    await injector.close();
  }
});

test("CLIExtensionInjector prepares the default extension zip for --load-extension", async () => {
  const injector = new CLIExtensionInjector();

  try {
    await injector.prepare();
    const unpacked_extension_path = (injector as unknown as { unpacked_extension_path?: string | null })
      .unpacked_extension_path;
    assert.equal(typeof unpacked_extension_path, "string");
    assert.match(unpacked_extension_path!, /modcdp-extension-/);
    assert.equal(existsSync(path.join(unpacked_extension_path!, "manifest.json")), true);
    assert.deepEqual(injector.extra_args, [`--load-extension=${unpacked_extension_path}`]);
    assert.equal(injector.config.injector_service_worker_extension_id, DEFAULT_MODCDP_EXTENSION_ID);
  } finally {
    await injector.close();
  }
});

test("CLIExtensionInjector returns null when a trusted does-not-exist extension id is absent in a real browser", async () => {
  const injector = new CLIExtensionInjector({
    injector_cli_extension_path: EXTENSION_PATH,
    injector_cli_extension_id: DOES_NOT_EXIST_EXTENSION_ID,
    injector_trust_service_worker_target: true,
    injector_service_worker_ready_timeout_ms: 250,
    injector_service_worker_poll_interval_ms: 25,
  });
  const launcher = new LocalBrowserLauncher({
    launcher_local_headless: true,
    launcher_local_executable_path: LOAD_EXTENSION_TEST_BROWSER_PATH,
  });
  const upstream = new WSUpstreamTransport();

  try {
    await injector.prepare();
    launcher.update(injector.configForLauncher());
    await launcher.launch();
    upstream.update(launcher.configForUpstream());
    await upstream.connect();
    injector.update({ send: upstream.send.bind(upstream) });

    const targets = (await upstream.send("Target.getTargets", {})) as {
      targetInfos?: { type?: string; url?: string }[];
    };
    assert.equal(
      targets.targetInfos?.some((target) =>
        target.url?.startsWith(`chrome-extension://${DOES_NOT_EXIST_EXTENSION_ID}/`),
      ),
      false,
    );

    const result = await injector.inject();
    assert.equal(result, null);
  } finally {
    await upstream.close();
    await launcher.close();
    await injector.close();
  }
}, 60_000);
