// JS demo for ModCDPClient with --direct / --loopback / --debugger route modes
// and --upstream=ws|pipe|reversews|nativemessaging|nats transport modes.
//
// Modes select where non-ModCDP commands ultimately get serviced:
//   --live        use the running Google Chrome enabled via chrome://inspect.
//   --direct      client sends standard CDP straight to the upstream WS.
//   --loopback    client routes *.* through the extension service worker,
//                 which opens a verified WebSocket back to localhost:9222 and
//                 forwards the command. (*.* -> service_worker on client,
//                 *.* -> loopback_cdp on server. Default mode.)
//   --debugger    client routes *.* through the extension service worker,
//                 which uses chrome.debugger.sendCommand against the active
//                 tab. (*.* -> service_worker on client, *.* -> chromedebugger
//                 on server.)
//
//   --upstream    select the browser/upstream transport. Defaults to ws.
//                 reversews and nativemessaging use the fixed extension
//                 defaults: ws://127.0.0.1:29292 and com.modcdp.bridge.
//
// Valid CI/local demo combinations exercise the same surface: a native Runtime
// command/event pair, Mod.evaluate, Custom.* commands, Custom.* events, and
// response/event middleware.

import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { createInterface } from "node:readline/promises";
import { spawn } from "node:child_process";

import { ModCDPClient } from "../src/index.js";
import { loadExtensionBrowserPath } from "./browserPaths.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH =
  [path.resolve(HERE, "..", "..", "extension"), path.resolve(HERE, "..", "..", "dist", "extension")].find((candidate) =>
    existsSync(path.join(candidate, "modcdp/service_worker.js")),
  ) ?? path.resolve(HERE, "..", "..", "extension");
const DEFAULT_DEMO_EVENT_TIMEOUT_MS = 10_000;
const DEFAULT_DEMO_CDP_SEND_TIMEOUT_MS = 60_000;
const DEFAULT_DEMO_EXECUTION_CONTEXT_TIMEOUT_MS = 60_000;
const DEFAULT_REVERSE_TRANSPORT_WAIT_TIMEOUT_MS = 60_000;
const DEFAULT_LIVE_CDP_POLL_INTERVAL_MS = 250;
const DEFAULT_LIVE_CDP_ACTIVE_PORT_STALE_MS = 1_000;

const UPSTREAM_MODES = new Set(["ws", "pipe", "reversews", "nativemessaging", "nats"]);

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")).map((a) => a.slice(2)));
  const upstream_arg = argv.find((a) => a === "--upstream" || a.startsWith("--upstream="));
  const upstream_value =
    upstream_arg === "--upstream"
      ? argv[argv.indexOf(upstream_arg) + 1]
      : upstream_arg?.startsWith("--upstream=")
        ? upstream_arg.slice("--upstream=".length)
        : [...UPSTREAM_MODES].find((mode) => flags.has(mode));
  const upstream_mode = upstream_value || "ws";
  if (!UPSTREAM_MODES.has(upstream_mode)) {
    throw new Error(`unknown --upstream=${upstream_mode}; expected ${[...UPSTREAM_MODES].join("|")}`);
  }
  const live = flags.has("live");
  const mode = flags.has("debugger")
    ? "debugger"
    : flags.has("direct")
      ? "direct"
      : flags.has("loopback")
        ? "loopback"
        : live
          ? "direct"
          : "loopback";
  if (live && upstream_mode === "pipe") {
    throw new Error(
      "--live cannot be combined with --upstream=pipe because pipe handles only exist for launched browsers.",
    );
  }
  if (
    mode === "direct" &&
    (upstream_mode === "reversews" || upstream_mode === "nativemessaging" || upstream_mode === "nats")
  ) {
    throw new Error(
      `--direct cannot be combined with --upstream=${upstream_mode}; reverse transports terminate at ModCDPServer.`,
    );
  }
  return { mode, live, upstream_mode };
}

function serverRoutesFor(mode, upstream_mode) {
  void upstream_mode;
  return {
    "Mod.*": "service_worker",
    "Custom.*": "service_worker",
    "*.*": mode === "loopback" ? "loopback_cdp" : mode === "debugger" ? "chromedebugger" : "auto",
  };
}

function clientRoutesFor(mode) {
  return {
    "Mod.*": "service_worker",
    "Custom.*": "service_worker",
    "Runtime.*": "service_worker",
    "*.*": mode === "direct" ? "direct_cdp" : "service_worker",
  };
}

function clientConfigFor(mode, upstream_mode, cdp_url, launcher_config = {}) {
  const launcher = cdp_url
    ? ({ launcher_mode: "remote" } as const)
    : ({ launcher_mode: "local", ...launcher_config } as const);
  const upstream = {
    upstream_mode,
    ...(cdp_url ? { upstream_ws_cdp_url: cdp_url } : {}),
    ...(upstream_mode === "reversews"
      ? { upstream_reversews_wait_timeout_ms: DEFAULT_REVERSE_TRANSPORT_WAIT_TIMEOUT_MS }
      : {}),
    ...(upstream_mode === "nats" ? { upstream_nats_wait_timeout_ms: DEFAULT_REVERSE_TRANSPORT_WAIT_TIMEOUT_MS } : {}),
  };
  const injector = {
    injector_mode: cdp_url ? ("discover" as const) : ("cli" as const),
    ...(cdp_url
      ? { injector_discover_extension_path: EXTENSION_PATH }
      : { injector_cli_extension_path: EXTENSION_PATH }),
    injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
    injector_execution_context_timeout_ms: DEFAULT_DEMO_EXECUTION_CONTEXT_TIMEOUT_MS,
  };
  if (mode === "direct") {
    return {
      launcher,
      upstream,
      injector,
      router: {
        router_routes: clientRoutesFor(mode),
      },
      client_config: {
        client_cdp_send_timeout_ms: DEFAULT_DEMO_CDP_SEND_TIMEOUT_MS,
      },
    };
  }
  return {
    launcher,
    upstream,
    injector,
    router: {
      router_routes: clientRoutesFor(mode),
    },
    client_config: {
      client_cdp_send_timeout_ms: DEFAULT_DEMO_CDP_SEND_TIMEOUT_MS,
    },
    server_config: {
      router: {
        router_routes: serverRoutesFor(mode, upstream_mode),
        loopback_execution_context_timeout_ms: DEFAULT_DEMO_EXECUTION_CONTEXT_TIMEOUT_MS,
      },
    },
  };
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} returned non-object value ${JSON.stringify(value)}`);
  }
  return value;
}

async function waitForEvent(cdp, eventName, predicate = (_payload) => true, timeoutMs = DEFAULT_DEMO_EVENT_TIMEOUT_MS) {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cdp.off(eventName, onEvent);
      reject(new Error(`timed out waiting for ${eventName}`));
    }, timeoutMs);
    const onEvent = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      cdp.off(eventName, onEvent);
      resolve(payload);
    };
    cdp.on(eventName, onEvent);
  });
}

function openLiveInspectPage() {
  if (process.platform === "darwin") {
    spawn("open", ["chrome://inspect/#remote-debugging"], {
      detached: true,
      stdio: "ignore",
    }).unref();
  } else {
    spawn("xdg-open", ["chrome://inspect/#remote-debugging"], {
      detached: true,
      stdio: "ignore",
    }).unref();
  }
}

async function waitForLiveCdpUrl() {
  const startedAt = Date.now();
  openLiveInspectPage();
  console.log("opened chrome://inspect/#remote-debugging");
  console.log("waiting for Chrome to expose DevToolsActivePort; click Allow when Chrome asks.");

  const candidates =
    process.platform === "darwin"
      ? [
          path.join(process.env.HOME || "", "Library/Application Support/Google/Chrome/DevToolsActivePort"),
          path.join(process.env.HOME || "", "Library/Application Support/Google/Chrome Beta/DevToolsActivePort"),
        ]
      : [
          path.join(process.env.HOME || "", ".config/google-chrome/DevToolsActivePort"),
          path.join(process.env.HOME || "", ".config/chromium/DevToolsActivePort"),
        ];
  while (true) {
    for (const file of candidates) {
      try {
        const info = await stat(file);
        if (info.mtimeMs < startedAt - DEFAULT_LIVE_CDP_ACTIVE_PORT_STALE_MS) continue;
        const [port, browserPath] = (await readFile(file, "utf8"))
          .trim()
          .split(/\n/)
          .map((line) => line.trim());
        if (port && browserPath) return `ws://127.0.0.1:${port}${browserPath}`;
      } catch {}
    }
    await sleep(DEFAULT_LIVE_CDP_POLL_INTERVAL_MS);
  }
}

async function main() {
  const { mode, live, upstream_mode } = parseArgs(process.argv.slice(2));
  console.log(`== mode: ${live ? "live/" : ""}${mode}; upstream: ${upstream_mode} ==`);
  if (!existsSync(path.join(EXTENSION_PATH, "modcdp/service_worker.js"))) {
    throw new Error(`Built extension not found at ${EXTENSION_PATH}. Run pnpm run build first.`);
  }

  let cdp_url;
  let launcher_config = {};
  if (live) {
    cdp_url = await waitForLiveCdpUrl();
  } else {
    cdp_url = null;
    launcher_config = {
      launcher_local_chrome_ready_timeout_ms: 60_000,
      launcher_local_headless: process.platform === "linux" && !process.env.DISPLAY,
      launcher_local_sandbox: process.platform !== "linux",
      launcher_local_executable_path: loadExtensionBrowserPath(),
    };
  }

  const cdp = new ModCDPClient(clientConfigFor(mode, upstream_mode, cdp_url, launcher_config));

  try {
    await cdp.connect();
    console.log("upstream cdp:", cdp.upstream.config.upstream_ws_cdp_url);
    console.log("connected; ext", cdp.injector?.extension_id, "session", cdp.injector?.session_id);
    console.log("connect timing    ->", cdp.connect_timing);

    const configureResult = assertObject(
      await cdp.Mod.configure({
        router: {
          router_routes: serverRoutesFor(mode, upstream_mode),
          loopback_execution_context_timeout_ms: DEFAULT_DEMO_EXECUTION_CONTEXT_TIMEOUT_MS,
        },
      }),
      "Mod.configure",
    );
    if (configureResult.router?.router_routes?.["*.*"] !== serverRoutesFor(mode, upstream_mode)["*.*"]) {
      throw new Error(`unexpected Mod.configure result ${JSON.stringify(configureResult)}`);
    }
    console.log("Mod.configure    ->", configureResult.router);

    const ping_sent_at = Date.now();
    const pongPromise = waitForEvent(cdp, "Mod.pong", (event) => event?.sent_at === ping_sent_at);
    const ping_result = assertObject(await cdp.Mod.ping({ sent_at: ping_sent_at }), "Mod.ping");
    const pong = assertObject(await pongPromise, "Mod.pong");
    const ping_returned_at = Date.now();
    if (ping_result.ok !== true || pong.received_at == null || pong.from !== "extension-service-worker") {
      throw new Error(`unexpected Mod.ping/Mod.pong result ${JSON.stringify({ ping_result, pong })}`);
    }
    console.log("Mod.ping/pong    ->", { ping_result, pong });
    console.log("ping latency      ->", {
      round_trip_ms: ping_returned_at - ping_sent_at,
      service_worker_ms: typeof pong.received_at === "number" ? pong.received_at - ping_sent_at : null,
      return_path_ms: typeof pong.received_at === "number" ? ping_returned_at - pong.received_at : null,
    });

    const modcdpEval = (await cdp.Mod.evaluate({
      expression: "({ extension_id: chrome.runtime.id })",
    })) as {
      extension_id?: string;
    };
    if (
      typeof modcdpEval.extension_id !== "string" ||
      (cdp.injector?.extension_id && modcdpEval.extension_id !== cdp.injector.extension_id)
    )
      throw new Error(`unexpected Mod.evaluate result ${JSON.stringify(modcdpEval)}`);
    console.log("Mod.evaluate     ->", modcdpEval);

    let topologyChecked = false;
    if (mode !== "direct") {
      const topology = assertObject(await cdp.Mod.getTopology(), "Mod.getTopology");
      if (
        typeof topology.rootFrameId !== "string" ||
        !topology.frames?.[topology.rootFrameId] ||
        !Object.values(topology.roots || {}).some((root: any) => root?.kind === "document") ||
        !Object.values(topology.contexts || {}).some((context: any) => context?.world === "piercer")
      ) {
        throw new Error(`unexpected Mod.getTopology result ${JSON.stringify(topology)}`);
      }
      topologyChecked = true;
      console.log("Mod.getTopology ->", {
        rootFrameId: topology.rootFrameId,
        frames: Object.keys(topology.frames || {}).length,
        roots: Object.keys(topology.roots || {}).length,
        contexts: Object.keys(topology.contexts || {}).length,
      });
    }

    const responseMiddlewareRegistration = assertObject(
      await cdp.Mod.addMiddleware({
        name: "Custom.echo",
        phase: cdp.RESPONSE,
        expression: `async (payload, next) => next({ ...payload, responseMiddleware: "ok" })`,
      }),
      "Mod.addMiddleware response",
    );
    if (responseMiddlewareRegistration.registered !== true || responseMiddlewareRegistration.phase !== cdp.RESPONSE) {
      throw new Error(`unexpected response middleware registration ${JSON.stringify(responseMiddlewareRegistration)}`);
    }

    if (mode !== "direct") {
      const eventMiddlewareRegistration = assertObject(
        await cdp.Mod.addMiddleware({
          name: "Custom.demoEvent",
          phase: cdp.EVENT,
          expression: `async (payload, next) => next({ ...payload, eventMiddleware: "ok" })`,
        }),
        "Mod.addMiddleware event",
      );
      if (eventMiddlewareRegistration.registered !== true || eventMiddlewareRegistration.phase !== cdp.EVENT) {
        throw new Error(`unexpected event middleware registration ${JSON.stringify(eventMiddlewareRegistration)}`);
      }
    }

    const echoRegistration = assertObject(
      await cdp.Mod.addCustomCommand({
        name: "Custom.echo",
        expression: `async (params, method) => ({ echoed: params.value, method })`,
      }),
      "Mod.addCustomCommand Custom.echo",
    );
    if (echoRegistration.registered !== true || echoRegistration.name !== "Custom.echo") {
      throw new Error(`unexpected Custom.echo registration ${JSON.stringify(echoRegistration)}`);
    }
    const echoResult = assertObject(await cdp.send("Custom.echo", { value: "custom-command-ok" }), "Custom.echo");
    if (
      echoResult.echoed !== "custom-command-ok" ||
      echoResult.method !== "Custom.echo" ||
      echoResult.responseMiddleware !== "ok"
    ) {
      throw new Error(`unexpected Custom.echo result ${JSON.stringify(echoResult)}`);
    }
    console.log("Custom.echo      ->", echoResult);

    const demoEventRegistration = assertObject(
      await cdp.Mod.addCustomEvent({ name: "Custom.demoEvent" }),
      "Mod.addCustomEvent Custom.demoEvent",
    );
    if (demoEventRegistration.registered !== true || demoEventRegistration.name !== "Custom.demoEvent") {
      throw new Error(`unexpected Custom.demoEvent registration ${JSON.stringify(demoEventRegistration)}`);
    }
    const demoEventPromise = waitForEvent(
      cdp,
      "Custom.demoEvent",
      (event) => event?.value === "custom-event-ok" && (mode === "direct" || event?.eventMiddleware === "ok"),
    );
    const emitResult = assertObject(
      await cdp.Mod.evaluate({
        expression:
          mode === "direct"
            ? `async () => {
                await globalThis.__ModCDP_custom_event__(JSON.stringify({
                  event: "Custom.demoEvent",
                  data: { value: "custom-event-ok" },
                  cdpSessionId: null,
                }));
                return { emitted: true };
              }`
            : `async () => {
                const params = await ModCDP.runMiddleware("event", "Custom.demoEvent", { value: "custom-event-ok" }, {
                  cdpSessionId,
                  event: {
                    method: "Custom.demoEvent",
                    params: { value: "custom-event-ok" },
                  },
                });
                const sent = downstream.sendEvent({
                  method: "Custom.demoEvent",
                  params,
                });
                return { emitted: sent > 0 };
              }`,
      }),
      "Custom.demoEvent emit",
    );
    if (emitResult.emitted !== true)
      throw new Error(`unexpected Custom.demoEvent emit result ${JSON.stringify(emitResult)}`);
    const demoEvent = assertObject(await demoEventPromise, "Custom.demoEvent");
    console.log("Custom.demoEvent ->", demoEvent);

    const runtimeEval = assertObject(
      await cdp.Runtime.evaluate({
        expression: "(() => 42)()",
        returnByValue: true,
      }),
      "Runtime.evaluate",
    );
    if (runtimeEval.result?.value !== 42) {
      throw new Error(`unexpected Runtime.evaluate result ${JSON.stringify(runtimeEval)}`);
    }
    console.log("Runtime.evaluate ->", runtimeEval);

    console.log(
      `\nSUCCESS (${mode}/${upstream_mode}): native command, ${topologyChecked ? "topology, " : ""}custom commands, custom event, and middleware all passed`,
    );

    // Drop into an interactive prompt when stdin is a TTY. Lets you poke at
    // the live browser using the same JSON command syntax as the Python and Go
    // demos. Skip the prompt when run non-interactively (CI, piped stdin) so
    // the demo exits cleanly after assertions.
    if (process.stdin.isTTY) {
      cdp.on("Mod.pong", (e) => console.log("\n[event] Mod.pong", e));
      await runRepl(cdp, mode);
    }
  } finally {
    await cdp.close();
  }
}

async function runRepl(cdp, mode) {
  console.log(`\nBrowser remains running. Mode: ${mode}.`);
  console.log("Enter commands as Domain.method({...JSON params...}). Examples:");
  console.log("  Browser.getVersion({})");
  console.log('  Mod.evaluate({"expression": "chrome.tabs.query({active: true})"})');
  console.log('  Runtime.evaluate({"expression": "document.title", "returnByValue": true})');
  console.log("Type exit or quit to disconnect (browser keeps running).");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      let line;
      try {
        line = (await rl.question("ModCDP> ")).trim();
      } catch {
        break;
      }
      if (!line) continue;
      if (line === "exit" || line === "quit") break;
      try {
        const match = line.match(/^([A-Za-z_][\w]*\.[A-Za-z_][\w]*)(?:\(([\s\S]*)\))?$/);
        if (!match) throw new Error("format: Domain.method({...})");
        const [, method, raw = ""] = match;
        const params = raw.trim() ? JSON.parse(raw) : {};
        const [domain, command] = method.split(".");
        const result = cdp[domain]?.[command] ? await cdp[domain][command](params) : await cdp.send(method, params);
        console.log(JSON.stringify(result, null, 2));
      } catch (e) {
        console.error("error:", e?.message || e);
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error("DEMO FAILED:", e);
  process.exitCode = 1;
});
