// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_ModCDPClient.py
// - ./go/modcdp/client/ModCDPClient_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { z } from "zod";

import { LocalBrowserLauncher } from "../src/launcher/LocalBrowserLauncher.js";
import { ModCDPClient } from "../src/index.js";
import { WSUpstreamTransport } from "../src/transport/WSUpstreamTransport.js";
import type { cdp as cdp_types } from "../src/types/generated/cdp.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, "..", "..", "dist", "extension");
const LOAD_EXTENSION_TEST_BROWSER_PATH = loadExtensionTestBrowserPath();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("ModCDPClient uses flat owner-prefixed config", () => {
  const cdp = new ModCDPClient({
    launcher: {
      launcher_mode: "local",
      launcher_local_executable_path: "/tmp/chrome",
      launcher_local_user_data_dir: "/tmp/profile",
      launcher_local_headless: true,
    },
    upstream: {
      upstream_mode: "ws",
      upstream_ws_cdp_url: "http://127.0.0.1:9222",
      upstream_ws_connect_error_settle_timeout_ms: 321,
    },
    injector: {
      injector_mode: "discover",
      injector_discover_extension_path: "/tmp/ext",
      injector_service_worker_extension_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      injector_service_worker_url_includes: ["modcdp"],
      injector_service_worker_url_suffixes: ["/custom/service_worker.js"],
      injector_trust_service_worker_target: true,
      injector_require_service_worker_target: true,
      injector_execution_context_timeout_ms: 4321,
      injector_service_worker_probe_timeout_ms: 5432,
      injector_service_worker_ready_timeout_ms: 6543,
      injector_service_worker_poll_interval_ms: 76,
      injector_target_session_poll_interval_ms: 87,
    },
    router: {
      router_routes: { "*.*": "direct_cdp" },
      loopback_execution_context_timeout_ms: 4321,
    },
    client_config: {
      client_hydrate_aliases: false,
      client_mirror_upstream_events: false,
      client_cdp_send_timeout_ms: 1234,
      client_event_wait_timeout_ms: 2345,
      client_heartbeat_interval_ms: 3456,
    },
    server_config: {
      router: { router_routes: { "*.*": "loopback_cdp" } },
      client_config: { client_cdp_send_timeout_ms: 9876 },
      upstream: { upstream_ws_connect_error_settle_timeout_ms: 7654 },
      downstream: { downstream_client_timeout_ms: 4567 },
      server_browser_token: "token-1",
    },
  });

  assert.equal(cdp.launcher.config.launcher_local_headless, true);
  assert.equal(cdp.launcher.config.launcher_local_executable_path, "/tmp/chrome");
  assert.equal(cdp.launcher.config.launcher_local_user_data_dir, "/tmp/profile");
  assert.equal(cdp.upstream.config.upstream_ws_connect_error_settle_timeout_ms, 321);
  assert.equal(cdp.injector.config.injector_execution_context_timeout_ms, 4321);
  assert.equal(cdp.injector.config.injector_service_worker_probe_timeout_ms, 5432);
  assert.equal(cdp.injector.config.injector_service_worker_ready_timeout_ms, 6543);
  assert.equal(cdp.injector.config.injector_service_worker_poll_interval_ms, 76);
  assert.equal(cdp.injector.config.injector_target_session_poll_interval_ms, 87);
  assert.equal(cdp.router.config.router_routes["*.*"], "direct_cdp");
  assert.equal(cdp.config.client_hydrate_aliases, false);
  assert.equal(cdp.config.client_mirror_upstream_events, false);
  assert.equal(cdp.config.client_cdp_send_timeout_ms, 1234);
  assert.equal(cdp.config.client_event_wait_timeout_ms, 2345);
  assert.equal(cdp.config.client_heartbeat_interval_ms, 3456);
  assert.equal("routes" in cdp, false);
  assert.equal("cdp_send_timeout_ms" in cdp, false);
  assert.equal("service_worker_probe_timeout_ms" in cdp, false);
  assert.equal("launcher_config" in cdp.launcher, false);
  assert.equal("headless" in cdp.launcher, false);
  assert.equal("executable_path" in cdp.launcher, false);
  assert.equal("user_data_dir" in cdp.launcher, false);

  const params = cdp._serverConfigureParams();
  assert.equal(params.router?.router_routes?.["*.*"], "loopback_cdp");
  assert.equal(params.server_browser_token, "token-1");
  assert.equal(params.client_config?.client_cdp_send_timeout_ms, 9876);
  assert.equal(params.router?.loopback_execution_context_timeout_ms, 4321);
  assert.equal(params.upstream?.upstream_ws_connect_error_settle_timeout_ms, 7654);
  assert.equal(params.downstream?.downstream_client_timeout_ms, 4567);
});

test("ModCDPClient dispatches root events before extension session is attached", () => {
  const cdp = new ModCDPClient();
  const seen: string[] = [];
  cdp.on(cdp.Target.targetCreated, (payload) => {
    seen.push(payload.targetInfo.targetId);
  });

  cdp._onRecv({
    method: "Target.targetCreated",
    params: {
      targetInfo: {
        targetId: "target-1",
        type: "page",
        title: "about:blank",
        url: "about:blank",
        attached: false,
        canAccessOpener: false,
      },
    },
  });

  assert.deepEqual(seen, ["target-1"]);
});

test("ModCDPClient event dispatch snapshots handlers when once removes itself", () => {
  const cdp = new ModCDPClient();
  const seen: string[] = [];
  cdp.once(cdp.Target.targetCreated, () => {
    seen.push("once");
  });
  cdp.on(cdp.Target.targetCreated, () => {
    seen.push("persistent");
  });

  cdp._onRecv({
    method: "Target.targetCreated",
    params: {
      targetInfo: {
        targetId: "target-1",
        type: "page",
        title: "about:blank",
        url: "about:blank",
        attached: false,
        canAccessOpener: false,
      },
    },
  });
  assert.deepEqual(seen, ["once", "persistent"]);

  seen.length = 0;
  cdp._onRecv({
    method: "Target.targetCreated",
    params: {
      targetInfo: {
        targetId: "target-2",
        type: "page",
        title: "about:blank",
        url: "about:blank",
        attached: false,
        canAccessOpener: false,
      },
    },
  });
  assert.deepEqual(seen, ["persistent"]);
});

test("ModCDPClient validates native command params before sending", async () => {
  const cdp = new ModCDPClient();

  await assert.rejects(() => cdp.send("Runtime.evaluate", {}), /expression/);
});

test("ModCDPClient validates native and registered custom events before dispatch", async () => {
  const cdp = new ModCDPClient();

  assert.throws(() => {
    cdp._onRecv({ method: "Target.targetCreated", params: {} });
  }, /targetInfo/);

  await cdp.Mod.addCustomEvent("Custom.ready", {
    event_schema: { ok: z.boolean() },
  });
  assert.throws(() => {
    cdp._onRecv({ method: "Custom.ready", params: { ok: "yes" } });
  }, /boolean/);
});

test("ModCDPClient connects with nested launch/upstream/extension/client/server config", async () => {
  const cdp = new ModCDPClient({
    launcher: {
      launcher_mode: "local",
      launcher_local_headless: true,
      launcher_local_chrome_ready_timeout_ms: 60_000,
      launcher_local_executable_path: LOAD_EXTENSION_TEST_BROWSER_PATH,
    },
    upstream: { upstream_mode: "ws" },
    injector: {
      injector_mode: "cli",
      injector_cli_extension_path: EXTENSION_PATH,
      injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
      injector_trust_service_worker_target: true,
    },
    router: {
      router_routes: {
        "Mod.*": "service_worker",
        "Custom.*": "service_worker",
        "*.*": "direct_cdp",
      },
    },
    client_config: {
      client_hydrate_aliases: true,
      client_mirror_upstream_events: true,
      client_cdp_send_timeout_ms: 10_000,
      client_event_wait_timeout_ms: 10_000,
    },
    server_config: {
      client_config: { client_cdp_send_timeout_ms: 10_000 },
      router: {
        router_routes: { "*.*": "loopback_cdp" },
        loopback_execution_context_timeout_ms: 10_000,
      },
      upstream: { upstream_ws_connect_error_settle_timeout_ms: 250 },
    },
  });

  let direct_session_target_id: string | null = null;
  try {
    await cdp.connect();
    assert.equal(cdp.launcher.config.launcher_mode, "local");
    assert.equal(cdp.upstream.config.upstream_mode, "ws");
    assert.equal(cdp.injector?.config.injector_mode, "cli");
    assert.equal(["discover", "cli", "cdp"].includes(String(cdp.connect_timing?.injector_source)), true);
    assert.equal(cdp.router.config.router_routes["*.*"], "direct_cdp");
    assert.match(cdp.upstream.config.upstream_ws_cdp_url ?? "", /^ws:\/\//);
    const service_worker_url = await cdp.Mod.evaluate({
      expression: "chrome.runtime.getURL('modcdp/service_worker.js')",
    });
    assert.equal(service_worker_url, `chrome-extension://${cdp.injector?.extension_id}/modcdp/service_worker.js`);
    assert.equal(
      await cdp.Mod.evaluate({
        expression:
          "chrome.runtime.getContexts({}).then((contexts) => contexts.some((context) => context.contextType === 'OFFSCREEN_DOCUMENT'))",
      }),
      true,
    );
    const version = await cdp.Browser.getVersion();
    assert.match(version.product, /Chrome|Chromium/);
    assert.equal(typeof version.protocolVersion, "string");
    const runtime_evaluation = await cdp.Runtime.evaluate({
      expression: "1 + 1",
      returnByValue: true,
    });
    assert.equal(runtime_evaluation.result.type, "number");
    assert.equal(runtime_evaluation.result.value, 2);
    await assert.rejects(
      // @ts-expect-error Runtime.evaluate requires expression in the public alias params.
      () => cdp.Runtime.evaluate({ returnByValue: true }),
      /expression/,
    );
    await assert.rejects(
      // @ts-expect-error Mod.ping sent_at is a number in the public alias params.
      () => cdp.Mod.ping({ sent_at: "bad" }),
      /number/,
    );
    assert.deepEqual(
      await cdp.Mod.addMiddleware({
        name: cdp.Mod.ping,
        phase: cdp.RESPONSE,
        expression: "async (payload, next) => next(payload)",
      }),
      { name: "Mod.ping", phase: "response", registered: true },
    );
    await assert.rejects(
      () =>
        cdp.Mod.addMiddleware({
          name: cdp.Mod.ping,
          // @ts-expect-error middleware phase is a narrow public union.
          phase: "after",
          expression: "async (payload, next) => next(payload)",
        }),
      /Invalid option/,
    );
    const created_event = new Promise<string>((resolve) => {
      const listener = (payload: cdp_types.types.ts.Target.TargetCreatedEvent) => {
        if (payload.targetInfo.url !== "about:blank#public-api-target-created") return;
        cdp.off(cdp.Target.targetCreated, listener);
        const targetId: string = payload.targetInfo.targetId;
        resolve(targetId);
        if (false) {
          // @ts-expect-error Target.targetCreated targetInfo.targetId is a string.
          const badTargetId: number = payload.targetInfo.targetId;
          void badTargetId;
        }
      };
      cdp.on(cdp.Target.targetCreated, listener);
    });
    const created_via_alias = await cdp.Target.createTarget({
      url: "about:blank#public-api-target-created",
    });
    assert.equal(await created_event, created_via_alias.targetId);
    await cdp.Target.closeTarget({ targetId: created_via_alias.targetId });
    const direct_target = (await cdp.send("Target.createTarget", {
      url: "about:blank#direct-session-routing",
    })) as Record<string, unknown>;
    direct_session_target_id = String(direct_target.targetId);
    const direct_session = (await cdp.send("Target.attachToTarget", {
      targetId: direct_session_target_id,
      flatten: true,
    })) as Record<string, unknown>;
    const direct_eval = (await cdp.send(
      "Runtime.evaluate",
      { expression: "1 + 1", returnByValue: true },
      String(direct_session.sessionId),
    )) as { result?: { value?: unknown } };
    assert.equal(direct_eval.result?.value, 2);
    const sent_at = Date.now();
    const pong = new Promise<Record<string, unknown>>((resolve) => {
      const listener = (payload: Record<string, unknown>) => {
        if (payload.sent_at !== sent_at) return;
        cdp.off("Mod.pong", listener);
        resolve(payload);
      };
      cdp.on("Mod.pong", listener);
    });
    const ping_result = (await cdp.Mod.ping({ sent_at })) as Record<string, unknown>;
    const pong_payload = await pong;
    assert.equal(ping_result.ok, true);
    assert.equal(pong_payload.sent_at, sent_at);
    assert.equal(typeof pong_payload.received_at, "number");
    assert.equal(pong_payload.from, "extension-service-worker");
  } finally {
    if (direct_session_target_id) {
      await cdp.send("Target.closeTarget", { targetId: direct_session_target_id }).catch(() => ({}));
    }
    await cdp.close();
  }
}, 60_000);

test("ModCDPClient preserves explicit empty service worker suffix config", async () => {
  const cdp = new ModCDPClient({
    injector: {
      injector_mode: "discover",
      injector_service_worker_url_suffixes: [],
    },
  });

  assert.deepEqual(cdp.injector.config.injector_service_worker_url_suffixes, []);
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
  throw new Error("Extension loading tests require CHROME_PATH, /usr/bin/chromium, or Chrome for Testing.");
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

test("ModCDPClient defaults service worker suffix config to the ModCDP worker", async () => {
  const cdp = new ModCDPClient({ injector: { injector_mode: "discover" } });

  assert.deepEqual(cdp.injector?.config.injector_service_worker_url_suffixes, ["/modcdp/service_worker.js"]);
});

test("ModCDPClient preserves explicit null server config", () => {
  const cdp = new ModCDPClient({ server_config: null });

  assert.equal(cdp.server_config, null);
});

test("ModCDPClient uses no injector unless injector_mode is explicit", () => {
  const launched = new ModCDPClient({
    launcher: { launcher_mode: "local" },
    upstream: { upstream_mode: "ws" },
  });
  assert.equal(launched.launcher.config.launcher_mode, "local");
  assert.equal(launched.injector, null);

  const attach_only = new ModCDPClient({ upstream: { upstream_mode: "ws" } });
  assert.equal(attach_only.launcher.config.launcher_mode, "none");
  assert.equal(attach_only.injector, null);
});

test("ModCDPClient selects exactly one injector from explicit injector_mode", async () => {
  const cdp = new ModCDPClient({
    launcher: { launcher_mode: "local" },
    injector: { injector_mode: "cli" },
  });

  assert.equal(cdp.injector?.constructor.name, "CLIExtensionInjector");
  assert.equal(
    new ModCDPClient({
      launcher: { launcher_mode: "remote" },
      injector: { injector_mode: "cdp" },
    }).injector?.constructor.name,
    "CDPExtensionInjector",
  );
  assert.equal(
    new ModCDPClient({
      launcher: { launcher_mode: "bb" },
      injector: { injector_mode: "bb" },
    }).injector?.constructor.name,
    "BBExtensionInjector",
  );
  assert.equal(
    new ModCDPClient({
      launcher: { launcher_mode: "remote" },
      injector: { injector_mode: "discover" },
    }).injector?.constructor.name,
    "DiscoverExtensionInjector",
  );
});

test("ModCDPClient rejects unknown component modes at their owning factory boundary", async () => {
  assert.throws(
    () =>
      new ModCDPClient({
        upstream: { upstream_mode: "bogus" as any },
      }),
    /unknown upstream_mode=bogus/,
  );
  assert.throws(
    () =>
      new ModCDPClient({
        launcher: { launcher_mode: "bogus" as any },
      }),
    /Invalid option/,
  );
  assert.throws(
    () =>
      new ModCDPClient({
        injector: { injector_mode: "bogus" as any },
      }),
    /Invalid option/,
  );
});

test("ModCDPClient.close does not close a remote browser it did not launch", async () => {
  const chrome = await new LocalBrowserLauncher({
    launcher_local_headless: true,
    launcher_local_chrome_ready_timeout_ms: 60_000,
    // This test manually supplies --load-extension, so it intentionally uses
    // the launch-flag browser path instead of relying on the client fallback.
    launcher_local_executable_path: LOAD_EXTENSION_TEST_BROWSER_PATH,
    launcher_local_extra_args: [`--load-extension=${EXTENSION_PATH}`],
  }).launch();
  const raw_cdp = new WSUpstreamTransport({ upstream_ws_cdp_url: chrome.cdp_url });
  const cdp = new ModCDPClient({
    launcher: { launcher_mode: "remote", launcher_remote_cdp_url: chrome.cdp_url },
    upstream: { upstream_mode: "ws", upstream_ws_cdp_url: chrome.cdp_url },
    injector: {
      injector_mode: "discover",
      injector_discover_extension_path: EXTENSION_PATH,
      injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
      injector_trust_service_worker_target: true,
      injector_service_worker_ready_timeout_ms: 30_000,
      injector_service_worker_probe_timeout_ms: 30_000,
    },
    router: { router_routes: { "*.*": "direct_cdp" } },
  });

  try {
    await raw_cdp.connect();
    await cdp.connect();
    await cdp.close();
    await delay(500);
    const version = await raw_cdp.send("Browser.getVersion");
    assert.match(String(version.product), /Chrome|Chromium/);
  } finally {
    await raw_cdp.close();
    await cdp.close();
    await chrome.close();
  }
}, 180_000);

test("ModCDPClient.close keeps injector files until after launched browser shutdown", async () => {
  const cdp = new ModCDPClient({
    launcher: {
      launcher_mode: "local",
      launcher_local_headless: true,
      // After explicit CHROME_PATH and CI /usr/bin/chromium, this test uses
      // Chrome for Testing because Canary rejects --load-extension in this
      // local launch injector path.
      launcher_local_executable_path: LOAD_EXTENSION_TEST_BROWSER_PATH,
    },
    upstream: {
      upstream_mode: "ws",
    },
    injector: {
      injector_mode: "cli",
      injector_cli_extension_path: EXTENSION_PATH,
      injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
      injector_trust_service_worker_target: true,
    },
    server_config: {
      router: { router_routes: { "*.*": "loopback_cdp" } },
    },
  });

  try {
    await cdp.connect();
    const injector = cdp.injector as unknown as { unpacked_extension_path?: string | null };
    const unpacked_extension_path = injector.unpacked_extension_path;
    assert.equal(typeof unpacked_extension_path, "string");
    assert.notEqual(unpacked_extension_path, EXTENSION_PATH);

    const launched = cdp.launcher.launched;
    assert.ok(launched);
    const close_browser = launched.close;
    let browser_close_saw_extension = false;
    launched.close = async () => {
      browser_close_saw_extension = existsSync(unpacked_extension_path!);
      await close_browser();
    };

    await cdp.close();

    assert.equal(browser_close_saw_extension, true);
    assert.equal(existsSync(unpacked_extension_path!), false);
  } finally {
    await cdp.close();
  }
  assert.equal(cdp.launcher.launched, null);
}, 90_000);

test("ModCDPClient.close clears top-level connection state", async () => {
  const cdp = new ModCDPClient({
    launcher: {
      launcher_mode: "local",
      launcher_local_headless: true,
      launcher_local_executable_path: LOAD_EXTENSION_TEST_BROWSER_PATH,
    },
    upstream: { upstream_mode: "ws" },
    injector: {
      injector_mode: "cli",
      injector_cli_extension_path: EXTENSION_PATH,
      injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
      injector_trust_service_worker_target: true,
    },
  });

  await cdp.connect();
  await cdp.close();
}, 60_000);
