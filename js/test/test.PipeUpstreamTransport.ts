// MODCDP_TS_ONLY_TEST: DO NOT TRANSLATE THIS TEST FILE TO OTHER LANGUAGES.
// PipeUpstreamTransport: TS-only pipe upstream transport coverage.
// If a translated sibling is added, all test cases, descriptions, covered edge cases, and setup must be kept perfectly 1:1 in sync.
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { PipeUpstreamTransport } from "../src/transport/PipeUpstreamTransport.js";
import { ModCDPClient } from "../src/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, "..", "..", "dist", "extension");
const LOAD_EXTENSION_TEST_BROWSER_PATH = loadExtensionTestBrowserPath();

test("pipe upstream constructor, update, launcher config, and unconnected errors match the transport surface", async () => {
  const transport = new PipeUpstreamTransport();
  assert.equal(transport.config.upstream_mode, "pipe");
  assert.equal(transport.config.upstream_ws_cdp_url, undefined);
  assert.equal(
    transport.update({
      upstream_ws_cdp_url: "ws://127.0.0.1:9222/devtools/browser/ignored",
    }),
    transport,
  );
  assert.equal(transport.config.upstream_ws_cdp_url, undefined);
  await assert.rejects(() => transport.connect(), /upstream_mode=pipe requires/);
  assert.throws(() => transport.send({ id: 1, method: "Runtime.evaluate" }), /CDP pipe is not connected/);
});

test("pipe upstream resets connection state after pipe end and errors", async () => {
  for (const event_name of ["end", "read_error", "write_error"] as const) {
    const pipe_read = new PassThrough();
    const pipe_write = new PassThrough();
    const transport = new PipeUpstreamTransport({
      upstream_pipe_read: pipe_read,
      upstream_pipe_write: pipe_write,
    });
    const closed: Error[] = [];
    transport.onClose((error) => closed.push(error));

    await transport.connect();
    transport.send({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression: "1" },
    });

    if (event_name === "end") pipe_read.emit("end");
    else if (event_name === "read_error") pipe_read.emit("error", new Error("read failed"));
    else pipe_write.emit("error", new Error("write failed"));

    assert.equal(closed.length, 1);
    assert.throws(
      () =>
        transport.send({
          id: 2,
          method: "Runtime.evaluate",
          params: { expression: "1" },
        }),
      /CDP pipe is not connected/,
    );
    await transport.close();
  }
});

test("pipe upstream launches a real browser without a CDP URL", async () => {
  const cdp = new ModCDPClient({
    launcher: {
      launcher_mode: "local",
      launcher_local_headless: true,
      launcher_local_executable_path: LOAD_EXTENSION_TEST_BROWSER_PATH,
    },
    upstream: { upstream_mode: "pipe" },
    injector: {
      injector_mode: "cli",
      injector_cli_extension_path: EXTENSION_PATH,
      injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
      injector_trust_service_worker_target: true,
    },
    server_config: { router: { router_routes: { "*.*": "chromedebugger" } } },
  });

  try {
    await cdp.connect();
    assert.equal(cdp.upstream?.config.upstream_mode, "pipe");
    assert.equal(cdp.upstream?.config.upstream_ws_cdp_url, undefined);
    await cdp.Mod.addCustomCommand("Custom.runtimeReadyState", {
      expression:
        "async () => await upstream.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true })",
    });
    const runtime = (await cdp.send("Custom.runtimeReadyState")) as {
      result?: { value?: unknown };
    };
    assert.equal(runtime.result?.value, "complete");
  } finally {
    await cdp.close();
  }
}, 60_000);

function loadExtensionTestBrowserPath() {
  const explicit_candidates = [process.env.CHROME_PATH, platform() === "linux" ? "/usr/bin/chromium" : null].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  for (const candidate of explicit_candidates) {
    if (existsSync(candidate)) return candidate;
  }
  const home = homedir();
  const patterns =
    platform() === "darwin"
      ? [
          path.join(
            home,
            "Library/Caches/ms-playwright/chromium-*/chrome-mac*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
          ),
          path.join(home, "Library/Caches/ms-playwright/chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium"),
          path.join(
            home,
            "Library/Caches/puppeteer/chrome/mac*-*/chrome-mac*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
          ),
        ]
      : platform() === "win32"
        ? [
            path.join(
              process.env.LOCALAPPDATA || path.join(home, "AppData/Local"),
              "ms-playwright/chromium-*/chrome-win*/chrome.exe",
            ),
            path.join(home, ".cache/puppeteer/chrome/win*-*/chrome-win*/chrome.exe"),
          ]
        : [
            path.join(home, ".cache/ms-playwright/chromium-*/chrome-linux*/chrome"),
            "/opt/pw-browsers/chromium-*/chrome-linux*/chrome",
            path.join(home, ".cache/puppeteer/chrome/linux-*/chrome-linux*/chrome"),
          ];
  const candidates = newestFirst(patterns.flatMap(expandGlob));
  if (candidates[0]) return candidates[0];
  throw new Error("Pipe CLI extension tests require CHROME_PATH, /usr/bin/chromium, or Chrome for Testing.");
}

function expandGlob(pattern: string) {
  const normalized = path.normalize(pattern);
  const { root } = path.parse(normalized);
  const parts = normalized.slice(root.length).split(path.sep).filter(Boolean);
  let candidates = [root || "."];
  for (const part of parts) {
    const has_wildcard = part.includes("*");
    const matcher = has_wildcard ? wildcardToRegExp(part) : null;
    const next: string[] = [];
    for (const base of candidates) {
      if (!existsSync(base)) continue;
      if (!has_wildcard) {
        const candidate = path.join(base, part);
        if (existsSync(candidate)) next.push(candidate);
        continue;
      }
      for (const child of readdirSync(base)) {
        if (matcher!.test(child)) next.push(path.join(base, child));
      }
    }
    candidates = next;
  }
  return candidates.filter((candidate) => existsSync(candidate));
}

function wildcardToRegExp(value: string) {
  return new RegExp(`^${value.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
}

function newestFirst(candidates: string[]) {
  return [...new Set(candidates)].sort((a, b) => {
    const left = scorePath(a);
    const right = scorePath(b);
    return right.version - left.version || right.mtime - left.mtime || a.localeCompare(b);
  });
}

function scorePath(candidate: string) {
  const numbers = candidate.match(/\d+/g)?.map(Number) ?? [];
  const version = numbers.length > 0 ? Math.max(...numbers) : 0;
  let mtime = 0;
  try {
    mtime = statSync(candidate).mtimeMs;
  } catch {}
  return { version, mtime };
}
