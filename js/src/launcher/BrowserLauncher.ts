import type { UpstreamTransport, UpstreamTransportOptions } from "../transport/UpstreamTransport.js";
import type { ModCDPServerOptions } from "../types/modcdp.js";

type LauncherMode = "local" | "remote" | "bb" | "none";
type LauncherOptions = {
  launcher_mode?: LauncherMode;
  launcher_local_executable_path?: string | null;
  launcher_local_user_data_dir?: string | null;
  launcher_remote_cdp_url?: string | null;
  launcher_local_cdp_listen_port?: number | null;
  launcher_local_headless?: boolean;
  launcher_local_sandbox?: boolean;
  launcher_local_args?: string[];
  launcher_local_extra_args?: string[];
  launcher_local_cdp_transport?: "port" | "pipe";
  launcher_local_loopback_cdp?: boolean;
  launcher_local_cleanup_user_data_dir?: boolean;
  launcher_local_chrome_ready_timeout_ms?: number;
  launcher_local_chrome_ready_poll_interval_ms?: number;
  launcher_bb_api_key?: string | null;
  launcher_bb_base_url?: string | null;
  launcher_bb_session_id?: string | null;
  launcher_bb_keep_alive?: boolean;
  launcher_bb_close_session_on_close?: boolean;
  launcher_bb_region?: string | null;
  launcher_bb_timeout?: number | null;
  launcher_bb_extension_id?: string | null;
  launcher_bb_browser_settings?: Record<string, unknown> | null;
  launcher_bb_user_metadata?: Record<string, unknown> | null;
  launcher_bb_session_create_params?: Record<string, unknown> | null;
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
  // setup options
  launcher_mode: LauncherMode;
  launcher_local_executable_path: string | null;
  launcher_local_user_data_dir: string | null;
  launcher_remote_cdp_url: string | null;
  launcher_local_cdp_listen_port: number | null;
  launcher_local_headless?: boolean;
  launcher_local_sandbox?: boolean;
  launcher_local_args?: string[];
  launcher_local_extra_args?: string[];
  launcher_local_cdp_transport?: "port" | "pipe";
  launcher_local_loopback_cdp?: boolean;
  launcher_local_cleanup_user_data_dir?: boolean;
  launcher_local_chrome_ready_timeout_ms: number;
  launcher_local_chrome_ready_poll_interval_ms: number;
  launcher_bb_api_key: string | null;
  launcher_bb_base_url: string | null;
  launcher_bb_session_id: string | null;
  launcher_bb_keep_alive?: boolean;
  launcher_bb_close_session_on_close?: boolean;
  launcher_bb_region: string | null;
  launcher_bb_timeout: number | null;
  launcher_bb_extension_id: string | null;
  launcher_bb_browser_settings: Record<string, unknown> | null;
  launcher_bb_user_metadata: Record<string, unknown> | null;
  launcher_bb_session_create_params: Record<string, unknown> | null;

  // runtime state
  launched: LaunchedBrowser | null = null;

  constructor(options: LauncherOptions = {}) {
    this.launcher_mode = options.launcher_mode ?? "none";
    this.launcher_local_executable_path = options.launcher_local_executable_path ?? null;
    this.launcher_local_user_data_dir = options.launcher_local_user_data_dir ?? null;
    this.launcher_remote_cdp_url = options.launcher_remote_cdp_url ?? null;
    this.launcher_local_cdp_listen_port = options.launcher_local_cdp_listen_port ?? null;
    this.launcher_local_headless = options.launcher_local_headless;
    this.launcher_local_sandbox = options.launcher_local_sandbox;
    this.launcher_local_args = options.launcher_local_args;
    this.launcher_local_extra_args = options.launcher_local_extra_args;
    this.launcher_local_cdp_transport = options.launcher_local_cdp_transport;
    this.launcher_local_loopback_cdp = options.launcher_local_loopback_cdp;
    this.launcher_local_cleanup_user_data_dir = options.launcher_local_cleanup_user_data_dir;
    this.launcher_local_chrome_ready_timeout_ms =
      options.launcher_local_chrome_ready_timeout_ms ?? DEFAULT_CHROME_READY_TIMEOUT_MS;
    this.launcher_local_chrome_ready_poll_interval_ms =
      options.launcher_local_chrome_ready_poll_interval_ms ?? DEFAULT_CHROME_READY_POLL_INTERVAL_MS;
    this.launcher_bb_api_key = options.launcher_bb_api_key ?? null;
    this.launcher_bb_base_url = options.launcher_bb_base_url ?? null;
    this.launcher_bb_session_id = options.launcher_bb_session_id ?? null;
    this.launcher_bb_keep_alive = options.launcher_bb_keep_alive;
    this.launcher_bb_close_session_on_close = options.launcher_bb_close_session_on_close;
    this.launcher_bb_region = options.launcher_bb_region ?? null;
    this.launcher_bb_timeout = options.launcher_bb_timeout ?? null;
    this.launcher_bb_extension_id = options.launcher_bb_extension_id ?? null;
    this.launcher_bb_browser_settings = options.launcher_bb_browser_settings ?? null;
    this.launcher_bb_user_metadata = options.launcher_bb_user_metadata ?? null;
    this.launcher_bb_session_create_params = options.launcher_bb_session_create_params ?? null;
  }

  update(config: LauncherOptions = {}) {
    this.launcher_mode = config.launcher_mode ?? this.launcher_mode;
    this.launcher_local_executable_path = config.launcher_local_executable_path ?? this.launcher_local_executable_path;
    this.launcher_local_user_data_dir = config.launcher_local_user_data_dir ?? this.launcher_local_user_data_dir;
    this.launcher_remote_cdp_url = config.launcher_remote_cdp_url ?? this.launcher_remote_cdp_url;
    this.launcher_local_cdp_listen_port = config.launcher_local_cdp_listen_port ?? this.launcher_local_cdp_listen_port;
    this.launcher_local_headless = config.launcher_local_headless ?? this.launcher_local_headless;
    this.launcher_local_sandbox = config.launcher_local_sandbox ?? this.launcher_local_sandbox;
    if (config.launcher_local_args)
      this.launcher_local_args = mergeChromeArgs(this.launcher_local_args, config.launcher_local_args);
    if (config.launcher_local_extra_args)
      this.launcher_local_extra_args = mergeChromeArgs(
        this.launcher_local_extra_args,
        config.launcher_local_extra_args,
      );
    this.launcher_local_cdp_transport = config.launcher_local_cdp_transport ?? this.launcher_local_cdp_transport;
    this.launcher_local_loopback_cdp = config.launcher_local_loopback_cdp ?? this.launcher_local_loopback_cdp;
    this.launcher_local_cleanup_user_data_dir =
      config.launcher_local_cleanup_user_data_dir ?? this.launcher_local_cleanup_user_data_dir;
    this.launcher_local_chrome_ready_timeout_ms =
      config.launcher_local_chrome_ready_timeout_ms ?? this.launcher_local_chrome_ready_timeout_ms;
    this.launcher_local_chrome_ready_poll_interval_ms =
      config.launcher_local_chrome_ready_poll_interval_ms ?? this.launcher_local_chrome_ready_poll_interval_ms;
    this.launcher_bb_api_key = config.launcher_bb_api_key ?? this.launcher_bb_api_key;
    this.launcher_bb_base_url = config.launcher_bb_base_url ?? this.launcher_bb_base_url;
    this.launcher_bb_session_id = config.launcher_bb_session_id ?? this.launcher_bb_session_id;
    this.launcher_bb_keep_alive = config.launcher_bb_keep_alive ?? this.launcher_bb_keep_alive;
    this.launcher_bb_close_session_on_close =
      config.launcher_bb_close_session_on_close ?? this.launcher_bb_close_session_on_close;
    this.launcher_bb_region = config.launcher_bb_region ?? this.launcher_bb_region;
    this.launcher_bb_timeout = config.launcher_bb_timeout ?? this.launcher_bb_timeout;
    this.launcher_bb_extension_id = config.launcher_bb_extension_id ?? this.launcher_bb_extension_id;
    this.launcher_bb_browser_settings = config.launcher_bb_browser_settings ?? this.launcher_bb_browser_settings;
    this.launcher_bb_user_metadata = config.launcher_bb_user_metadata ?? this.launcher_bb_user_metadata;
    this.launcher_bb_session_create_params =
      config.launcher_bb_session_create_params ?? this.launcher_bb_session_create_params;
    return this;
  }

  async launch(_options: LauncherOptions = {}): Promise<LaunchedBrowser> {
    throw new Error(`${this.constructor.name}.launch is not implemented.`);
  }

  configForUpstream(): UpstreamTransportOptions {
    return {
      upstream_ws_cdp_url: this.launched?.cdp_url ?? this.launcher_remote_cdp_url,
      upstream_pipe_read: this.launched?.pipe_read,
      upstream_pipe_write: this.launched?.pipe_write,
    };
  }

  configForServer(upstream: UpstreamTransport): ModCDPServerOptions {
    const launcher_local_loopback_cdp_url =
      this.launched?.loopback_cdp_url ??
      (upstream.upstream_mode === "ws" && upstream.upstream_ws_cdp_url
        ? upstream.upstream_ws_cdp_url
        : upstream.upstream_mode !== "ws" && upstream.upstream_mode !== "pipe" && this.launched?.cdp_url
          ? this.launched.cdp_url
          : null);
    return launcher_local_loopback_cdp_url
      ? { upstream: { upstream_ws_cdp_url: launcher_local_loopback_cdp_url } }
      : {};
  }

  async close() {
    const launched = this.launched;
    this.launched = null;
    await launched?.close();
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
export type { LauncherMode, LauncherOptions, LaunchedBrowser };
