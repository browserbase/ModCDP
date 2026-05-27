// MODCDP_TS_ONLY: DO NOT TRANSLATE THIS FILE TO OTHER LANGUAGES.
// Reason: only runs in Node.
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RawData, WebSocket } from "ws";

import {
  browser_launcher_constructors,
  extension_injector_constructors,
  ModCDPClient,
  upstream_transport_constructors,
} from "../client/ModCDPClient.js";
import { BBExtensionInjector } from "../injector/BBExtensionInjector.js";
import { BorrowExtensionInjector } from "../injector/BorrowExtensionInjector.js";
import { CDPExtensionInjector } from "../injector/CDPExtensionInjector.js";
import { CLIExtensionInjector } from "../injector/CLIExtensionInjector.js";
import { DiscoverExtensionInjector } from "../injector/DiscoverExtensionInjector.js";
import { InjectorConfigSchema } from "../injector/ExtensionInjector.js";
import { BBBrowserLauncher } from "../launcher/BBBrowserLauncher.js";
import { LocalBrowserLauncher } from "../launcher/LocalBrowserLauncher.js";
import type { LauncherConfig } from "../launcher/BrowserLauncher.js";
import { RemoteBrowserLauncher } from "../launcher/RemoteBrowserLauncher.js";
import { NATSUpstreamTransport } from "../transport/NATSUpstreamTransport.js";
import { NativeMessagingUpstreamTransport } from "../transport/NativeMessagingUpstreamTransport.js";
import { PipeUpstreamTransport } from "../transport/PipeUpstreamTransport.js";
import { ReverseWSUpstreamTransport } from "../transport/ReverseWSUpstreamTransport.js";
import { parseHostPort, type UpstreamTransportConfig } from "../transport/UpstreamTransport.js";
import { CdpCommandMessageSchema } from "../types/modcdp.js";
import type { ModCDPClientConfig } from "../client/ModCDPClient.js";

browser_launcher_constructors.set("local", LocalBrowserLauncher);
browser_launcher_constructors.set("remote", RemoteBrowserLauncher);
browser_launcher_constructors.set("bb", BBBrowserLauncher);
extension_injector_constructors.set("cli", CLIExtensionInjector);
extension_injector_constructors.set("cdp", CDPExtensionInjector);
extension_injector_constructors.set("bb", BBExtensionInjector);
extension_injector_constructors.set("discover", DiscoverExtensionInjector);
extension_injector_constructors.set("borrow", BorrowExtensionInjector);
upstream_transport_constructors.set("pipe", PipeUpstreamTransport);
upstream_transport_constructors.set("reversews", ReverseWSUpstreamTransport);
upstream_transport_constructors.set("nativemessaging", NativeMessagingUpstreamTransport);
upstream_transport_constructors.set("nats", NATSUpstreamTransport);

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9223;
const DEFAULT_UPSTREAM = "http://127.0.0.1:9222";
const DEFAULT_UPSTREAM_MONITOR_INTERVAL_MS = 1_000;
const DEFAULT_REVERSE_WAIT_TIMEOUT_MS = 2_000;
const DEFAULT_PROXY_ROUTER_ROUTES = {
  "Mod.*": "service_worker",
  "Custom.*": "service_worker",
  "*.*": "direct_cdp",
} as const;

type StartProxyConfig = {
  proxy_listen_host?: string;
  proxy_listen_port?: number;
  launcher?: LauncherConfig;
  upstream?: UpstreamTransportConfig;
  injector?: ModCDPClientConfig["injector"];
  router?: ModCDPClientConfig["router"];
  client_config?: ModCDPClientConfig["client_config"];
  server_config?: ModCDPClientConfig["server_config"];
  forward_mirrored_upstream_events?: boolean;
  upstream_monitor_interval_ms?: number;
};

async function startProxy({
  proxy_listen_host = DEFAULT_HOST,
  proxy_listen_port = DEFAULT_PORT,
  launcher = { launcher_mode: "remote" },
  upstream = { upstream_mode: "ws", upstream_ws_cdp_url: DEFAULT_UPSTREAM },
  injector = { injector_mode: "none" },
  router = {},
  client_config = {},
  server_config = {},
}: StartProxyConfig = {}) {
  const { WebSocketServer } = await loadWsForProxy();
  const active_clients = new Set<ModCDPClient>();
  const http_server = http.createServer((req, res) => {
    const request_url = req.url === "/json/version/" ? "/json/version" : req.url;
    if (request_url === "/json/version") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ webSocketDebuggerUrl: `ws://${req.headers.host}/devtools/browser/proxy` }));
      return;
    }
    if (request_url === "/json" || request_url === "/json/list" || request_url === "/json/list/") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify([
          {
            id: "proxy",
            type: "browser",
            title: "ModCDP Proxy",
            webSocketDebuggerUrl: `ws://${req.headers.host}/devtools/browser/proxy`,
          },
        ]),
      );
      return;
    }
    res.writeHead(404);
    res.end("Not found.");
  });
  const wss = new WebSocketServer({ noServer: true });
  http_server.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });
  wss.on("connection", (socket) => {
    void connectDownstream(
      socket,
      {
        launcher,
        upstream,
        injector,
        router: {
          ...router,
          router_routes: {
            ...DEFAULT_PROXY_ROUTER_ROUTES,
            ...(router.router_routes ?? {}),
          },
        },
        client_config,
        server_config,
      },
      active_clients,
    );
  });
  await new Promise<void>((resolve) => http_server.listen(proxy_listen_port, proxy_listen_host, () => resolve()));
  const close = async () => {
    for (const client of active_clients) await client.close().catch(() => {});
    active_clients.clear();
    for (const socket of wss.clients) socket.close();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => http_server.close(() => resolve()));
  };
  console.log(`listening on ws://${proxy_listen_host}:${proxy_listen_port}/`);
  return {
    url: `http://${proxy_listen_host}:${proxy_listen_port}`,
    cdp_url: `ws://${proxy_listen_host}:${proxy_listen_port}`,
    close,
  };
}

async function connectDownstream(socket: WebSocket, config: ModCDPClientConfig, active_clients: Set<ModCDPClient>) {
  const queued_raw_messages: RawData[] = [];
  let connected = false;
  const cdp = new ModCDPClient({
    ...config,
    client_config: { client_hydrate_aliases: false, ...(config.client_config ?? {}) },
  });
  active_clients.add(cdp);
  socket.on("message", (raw) => {
    if (!connected) {
      queued_raw_messages.push(raw);
      return;
    }
    void handleDownstreamMessage(socket, cdp, raw);
  });
  socket.on("close", () => {
    active_clients.delete(cdp);
    void cdp.close().catch(() => {});
  });
  try {
    await cdp.connect();
  } catch (error) {
    console.error(`[ModCDP proxy] upstream connect failed: ${errorMessage(error)}`);
    active_clients.delete(cdp);
    await cdp.close().catch(() => {});
    socket.close(1011, errorMessage(error).slice(0, 120));
    return;
  }
  cdp.on("*", (event_name, payload, session_id) => {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(
      JSON.stringify({
        method: String(event_name),
        params: payload ?? {},
        ...(session_id ? { sessionId: session_id } : {}),
      }),
    );
  });
  connected = true;
  for (const raw of queued_raw_messages.splice(0)) void handleDownstreamMessage(socket, cdp, raw);
}

async function handleDownstreamMessage(socket: WebSocket, cdp: ModCDPClient, raw: RawData) {
  const message = CdpCommandMessageSchema.parse(JSON.parse(String(raw)));
  try {
    const result = await cdp.send(message.method, message.params ?? {}, message.sessionId ?? null);
    socket.send(
      JSON.stringify({
        id: message.id,
        result: result ?? {},
        ...(message.sessionId ? { sessionId: message.sessionId } : {}),
      }),
    );
  } catch (error) {
    socket.send(
      JSON.stringify({
        id: message.id,
        error: { code: -32000, message: errorMessage(error) },
        ...(message.sessionId ? { sessionId: message.sessionId } : {}),
      }),
    );
  }
}

function runProxyCli(args = process.argv.slice(2)) {
  const argv = parseProxyArgs(args);
  const bind = typeof argv.bind === "string" ? parseHostPort(argv.bind, DEFAULT_HOST, DEFAULT_PORT) : null;
  const proxy_promise = startProxy({
    proxy_listen_host: (argv.proxy_listen_host as string | undefined) ?? bind?.host ?? DEFAULT_HOST,
    proxy_listen_port:
      (argv.proxy_listen_port as number | undefined) ?? (argv.port as number | undefined) ?? bind?.port ?? DEFAULT_PORT,
    launcher: configGroup(argv, "launcher"),
    upstream: configGroup(argv, "upstream"),
    injector: configGroup(argv, "injector"),
    router: configGroup(argv, "router"),
    client_config: configGroup(argv, "client_config", "client"),
    server_config: configGroup(argv, "server_config", "server"),
  });
  const shutdown = async () => {
    try {
      const proxy = await proxy_promise;
      await proxy.close();
    } finally {
      process.exit(0);
    }
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  proxy_promise.catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function loadWsForProxy() {
  try {
    return await import("ws");
  } catch (error) {
    throw new Error(`The ModCDP proxy requires the optional "ws" package: ${errorMessage(error)}`);
  }
}

function parseProxyArgs(args: string[]) {
  const result: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const raw = arg.slice(2);
    const equals = raw.indexOf("=");
    if (equals >= 0) result[raw.slice(0, equals).replaceAll("-", "_")] = parseCliValue(raw.slice(equals + 1));
    else {
      const next = args[i + 1];
      result[raw.replaceAll("-", "_")] = next && !next.startsWith("--") ? parseCliValue(next) : true;
      if (next && !next.startsWith("--")) i += 1;
    }
  }
  return result;
}

function configGroup(argv: Record<string, unknown>, group: string, field_prefix = group) {
  const config =
    typeof argv[group] === "object" && argv[group] !== null && !Array.isArray(argv[group]) ? argv[group] : {};
  const prefix = `${field_prefix}_`;
  const entries = Object.entries(argv)
    .filter(([key]) => key !== group && key.startsWith(prefix))
    .map(([key, value]) => [key, value]);
  return { ...config, ...Object.fromEntries(entries) };
}

function parseCliValue(value: string) {
  const trimmed = value.trim();
  if (
    trimmed === "true" ||
    trimmed === "false" ||
    trimmed === "null" ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    /^-?\d+(\.\d+)?$/.test(trimmed)
  ) {
    return JSON.parse(trimmed);
  }
  return value;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runProxyCli();

export { DEFAULT_UPSTREAM_MONITOR_INTERVAL_MS, DEFAULT_REVERSE_WAIT_TIMEOUT_MS, startProxy, runProxyCli };
