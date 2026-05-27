// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/launcher/BrowserLauncher.py
// - ./go/modcdp/launcher/BrowserLauncher.go
import type { UpstreamTransport, UpstreamTransportConfig } from "../transport/UpstreamTransport.js";
import { ModCDPLauncherConfigSchema, ModCDPServerConfigSchema, type ModCDPLauncherConfig } from "../types/modcdp.js";
import { modCDPToJSON } from "../types/toJSON.js";
import type { z } from "zod";

type LauncherConfig = z.input<typeof ModCDPLauncherConfigSchema>;
type LauncherMode = ReturnType<typeof ModCDPLauncherConfigSchema.parse>["launcher_mode"];
type LauncherUpstreamConfig = UpstreamTransportConfig & {
  upstream_pipe_read?: NodeJS.ReadableStream;
  upstream_pipe_write?: NodeJS.WritableStream;
};

type LaunchedBrowser = {
  proc?: unknown;
  cdp_listen_port?: number;
  // Browser websocket CDP endpoint when one exists. Pipe transports expose pipe handles instead.
  cdp_url: string | null;
  // Extension-dialable loopback CDP endpoint when it differs from cdp_url (usually they are the same unless public-facing cdp url differs from intranet/localhost equivalent).
  loopback_cdp_url?: string | null;
  pipe_read?: NodeJS.ReadableStream | null;
  pipe_write?: NodeJS.WritableStream | null;
  profile_dir?: string | null;
  browserbase_session_id?: string | null;
  browserbase_session_url?: string | null;
  browserbase_debug_url?: string | null;
  close: () => Promise<void> | void;
};

const DEFAULT_CHROME_READY_TIMEOUT_MS = 45_000;
const DEFAULT_CHROME_READY_POLL_INTERVAL_MS = 100;

function mergeChromeArgs(existing: string[] = [], incoming: string[] = []) {
  const args = [...existing, ...incoming];
  const load_extension_paths: string[] = [];
  const merged: string[] = [];
  for (const arg of args) {
    if (!arg.startsWith("--load-extension=")) {
      merged.push(arg);
      continue;
    }
    for (const extension_path of arg.slice("--load-extension=".length).split(",")) {
      if (extension_path && !load_extension_paths.includes(extension_path)) load_extension_paths.push(extension_path);
    }
  }
  if (load_extension_paths.length > 0) {
    const first_url_index = merged.findIndex((arg) => !arg.startsWith("-"));
    const load_extension_arg = `--load-extension=${load_extension_paths.join(",")}`;
    if (first_url_index === -1) merged.push(load_extension_arg);
    else merged.splice(first_url_index, 0, load_extension_arg);
  }
  return merged;
}

class BrowserLauncher {
  config: ModCDPLauncherConfig;

  // runtime state
  launched: LaunchedBrowser | null = null;

  constructor(config: LauncherConfig = {}) {
    this.config = ModCDPLauncherConfigSchema.parse(config);
  }

  update(config: LauncherConfig = {}) {
    const next_config = ModCDPLauncherConfigSchema.parse({ ...this.config, ...config });
    if (config.launcher_local_args) {
      next_config.launcher_local_args = mergeChromeArgs(this.config.launcher_local_args, config.launcher_local_args);
    }
    if (config.launcher_local_extra_args) {
      next_config.launcher_local_extra_args = mergeChromeArgs(
        this.config.launcher_local_extra_args,
        config.launcher_local_extra_args,
      );
    }
    this.config = next_config;
    return this;
  }

  async launch(_config: LauncherConfig = {}): Promise<LaunchedBrowser> {
    throw new Error(`${this.constructor.name}.launch is not implemented.`);
  }

  configForUpstream(): UpstreamTransportConfig {
    const config: LauncherUpstreamConfig = {};
    const upstream_ws_cdp_url = this.launched?.cdp_url ?? this.config.launcher_remote_cdp_url;
    if (upstream_ws_cdp_url) config.upstream_ws_cdp_url = upstream_ws_cdp_url;
    if (this.launched?.pipe_read) config.upstream_pipe_read = this.launched.pipe_read;
    if (this.launched?.pipe_write) config.upstream_pipe_write = this.launched.pipe_write;
    return config;
  }

  configForServer(upstream: UpstreamTransport): z.input<typeof ModCDPServerConfigSchema> {
    const launcher_local_loopback_cdp_url =
      this.launched?.loopback_cdp_url ??
      (upstream.config.upstream_mode === "ws" && upstream.config.upstream_ws_cdp_url
        ? upstream.config.upstream_ws_cdp_url
        : upstream.config.upstream_mode !== "ws" && upstream.config.upstream_mode !== "pipe" && this.launched?.cdp_url
          ? this.launched.cdp_url
          : null);
    return launcher_local_loopback_cdp_url
      ? { upstream: { upstream_mode: "ws", upstream_ws_cdp_url: launcher_local_loopback_cdp_url } }
      : {};
  }

  async close() {
    const launched = this.launched;
    this.launched = null;
    await launched?.close();
  }

  toJSON() {
    return modCDPToJSON(this, {
      state: {
        launched: this.launched != null,
        cdp_url: this.launched?.cdp_url ?? null,
        loopback_cdp_url: this.launched?.loopback_cdp_url ?? null,
        cdp_listen_port: this.launched?.cdp_listen_port ?? null,
        profile_dir: this.launched?.profile_dir ?? null,
        browserbase_session_id: this.launched?.browserbase_session_id ?? null,
        browserbase_session_url: this.launched?.browserbase_session_url ?? null,
        browserbase_debug_url: this.launched?.browserbase_debug_url ?? null,
      },
    });
  }
}

async function resolveCdpWebSocketUrl(endpoint: string, name = "cdp_url") {
  if (/^wss?:\/\//i.test(endpoint)) return endpoint;
  const httpEndpoint = /^[a-z][a-z\d+\-.]*:\/\//i.test(endpoint) ? endpoint : `http://${endpoint}`;
  const response = await fetch(`${httpEndpoint.replace(/\/$/, "")}/json/version`);
  if (!response.ok) throw new Error(`GET ${httpEndpoint}/json/version -> ${response.status}`);
  const version = await response.json();
  if (!version.webSocketDebuggerUrl) throw new Error(`${name} HTTP discovery returned no webSocketDebuggerUrl`);
  return version.webSocketDebuggerUrl as string;
}

export {
  DEFAULT_CHROME_READY_TIMEOUT_MS,
  DEFAULT_CHROME_READY_POLL_INTERVAL_MS,
  BrowserLauncher,
  resolveCdpWebSocketUrl,
};
export type { LauncherMode, LauncherConfig, LaunchedBrowser };
