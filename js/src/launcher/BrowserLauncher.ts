export type LauncherMode = "local" | "remote" | "bb" | "none";
export type LauncherOptions = {
  launcher_mode?: LauncherMode;
  launcher_executable_path?: string | null;
  launcher_user_data_dir?: string | null;
  remote_cdp_url?: string | null;
  launcher_options?: Record<string, unknown>;
  executable_path?: string | null;
  port?: number | null;
  user_data_dir?: string | null;
  headless?: boolean;
  sandbox?: boolean;
  args?: string[];
  extra_args?: string[];
  remote_debugging?: "port" | "pipe";
  loopback_cdp?: boolean;
  cleanup_user_data_dir?: boolean;
  chrome_ready_timeout_ms?: number;
  chrome_ready_poll_interval_ms?: number;
  cdp_url?: string | null;
  browserbase_api_key?: string | null;
  browserbase_base_url?: string | null;
  browserbase_session_id?: string | null;
  browserbase_keep_alive?: boolean;
  browserbase_close_session_on_close?: boolean;
  region?: string | null;
  timeout?: number | null;
  injector_extension_id?: string | null;
  browserbase_browser_settings?: Record<string, unknown> | null;
  browserbase_user_metadata?: Record<string, unknown> | null;
  browserbase_session_create_params?: Record<string, unknown> | null;
};

export type LaunchedBrowser = {
  proc?: unknown;
  port?: number;
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

export const DEFAULT_CHROME_READY_TIMEOUT_MS = 45_000;
export const DEFAULT_CHROME_READY_POLL_INTERVAL_MS = 100;

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

export class BrowserLauncher {
  // setup options
  launcher_mode: LauncherMode;
  launcher_executable_path: string | null;
  launcher_user_data_dir: string | null;
  remote_cdp_url: string | null;
  executable_path: string | null;
  port: number | null;
  user_data_dir: string | null;
  headless?: boolean;
  sandbox?: boolean;
  args?: string[];
  extra_args?: string[];
  remote_debugging?: "port" | "pipe";
  loopback_cdp?: boolean;
  cleanup_user_data_dir?: boolean;
  chrome_ready_timeout_ms: number;
  chrome_ready_poll_interval_ms: number;
  cdp_url: string | null;
  browserbase_api_key: string | null;
  browserbase_base_url: string | null;
  browserbase_session_id: string | null;
  browserbase_keep_alive?: boolean;
  browserbase_close_session_on_close?: boolean;
  region: string | null;
  timeout: number | null;
  injector_extension_id: string | null;
  browserbase_browser_settings: Record<string, unknown> | null;
  browserbase_user_metadata: Record<string, unknown> | null;
  browserbase_session_create_params: Record<string, unknown> | null;

  // runtime state
  launched: LaunchedBrowser | null = null;

  constructor(options: LauncherOptions = {}) {
    this.launcher_mode = options.launcher_mode ?? "none";
    this.launcher_executable_path = options.launcher_executable_path ?? null;
    this.launcher_user_data_dir = options.launcher_user_data_dir ?? null;
    this.remote_cdp_url = options.remote_cdp_url ?? null;
    this.executable_path = options.executable_path ?? options.launcher_executable_path ?? null;
    this.port = options.port ?? null;
    this.user_data_dir = options.user_data_dir ?? options.launcher_user_data_dir ?? null;
    this.headless = options.headless;
    this.sandbox = options.sandbox;
    this.args = options.args;
    this.extra_args = options.extra_args;
    this.remote_debugging = options.remote_debugging;
    this.loopback_cdp = options.loopback_cdp;
    this.cleanup_user_data_dir = options.cleanup_user_data_dir;
    this.chrome_ready_timeout_ms = options.chrome_ready_timeout_ms ?? DEFAULT_CHROME_READY_TIMEOUT_MS;
    this.chrome_ready_poll_interval_ms = options.chrome_ready_poll_interval_ms ?? DEFAULT_CHROME_READY_POLL_INTERVAL_MS;
    this.cdp_url = options.cdp_url ?? null;
    this.browserbase_api_key = options.browserbase_api_key ?? null;
    this.browserbase_base_url = options.browserbase_base_url ?? null;
    this.browserbase_session_id = options.browserbase_session_id ?? null;
    this.browserbase_keep_alive = options.browserbase_keep_alive;
    this.browserbase_close_session_on_close = options.browserbase_close_session_on_close;
    this.region = options.region ?? null;
    this.timeout = options.timeout ?? null;
    this.injector_extension_id = options.injector_extension_id ?? null;
    this.browserbase_browser_settings = options.browserbase_browser_settings ?? null;
    this.browserbase_user_metadata = options.browserbase_user_metadata ?? null;
    this.browserbase_session_create_params = options.browserbase_session_create_params ?? null;
  }

  update(config: LauncherOptions = {}) {
    this.executable_path = config.executable_path ?? this.executable_path;
    this.port = config.port ?? this.port;
    this.user_data_dir = config.user_data_dir ?? this.user_data_dir;
    this.headless = config.headless ?? this.headless;
    this.sandbox = config.sandbox ?? this.sandbox;
    this.args = mergeChromeArgs(this.args, config.args ?? []);
    this.extra_args = mergeChromeArgs(this.extra_args, config.extra_args ?? []);
    this.remote_debugging = config.remote_debugging ?? this.remote_debugging;
    this.loopback_cdp = config.loopback_cdp ?? this.loopback_cdp;
    this.cleanup_user_data_dir = config.cleanup_user_data_dir ?? this.cleanup_user_data_dir;
    this.chrome_ready_timeout_ms = config.chrome_ready_timeout_ms ?? this.chrome_ready_timeout_ms;
    this.chrome_ready_poll_interval_ms = config.chrome_ready_poll_interval_ms ?? this.chrome_ready_poll_interval_ms;
    this.cdp_url = config.cdp_url ?? this.cdp_url;
    this.browserbase_api_key = config.browserbase_api_key ?? this.browserbase_api_key;
    this.browserbase_base_url = config.browserbase_base_url ?? this.browserbase_base_url;
    this.browserbase_session_id = config.browserbase_session_id ?? this.browserbase_session_id;
    this.browserbase_keep_alive = config.browserbase_keep_alive ?? this.browserbase_keep_alive;
    this.browserbase_close_session_on_close =
      config.browserbase_close_session_on_close ?? this.browserbase_close_session_on_close;
    this.region = config.region ?? this.region;
    this.timeout = config.timeout ?? this.timeout;
    this.injector_extension_id = config.injector_extension_id ?? this.injector_extension_id;
    this.browserbase_browser_settings = config.browserbase_browser_settings ?? this.browserbase_browser_settings;
    this.browserbase_user_metadata = config.browserbase_user_metadata ?? this.browserbase_user_metadata;
    this.browserbase_session_create_params =
      config.browserbase_session_create_params ?? this.browserbase_session_create_params;
    return this;
  }

  async launch(_options: LauncherOptions = {}): Promise<LaunchedBrowser> {
    throw new Error(`${this.constructor.name}.launch is not implemented.`);
  }
}

export async function resolveCdpWebSocketUrl(endpoint: string, name = "cdp_url") {
  if (/^wss?:\/\//i.test(endpoint)) return endpoint;
  const httpEndpoint = /^[a-z][a-z\d+\-.]*:\/\//i.test(endpoint) ? endpoint : `http://${endpoint}`;
  const response = await fetch(`${httpEndpoint.replace(/\/$/, "")}/json/version`);
  if (!response.ok) throw new Error(`GET ${httpEndpoint}/json/version -> ${response.status}`);
  const version = await response.json();
  if (!version.webSocketDebuggerUrl) throw new Error(`${name} HTTP discovery returned no webSocketDebuggerUrl`);
  return version.webSocketDebuggerUrl as string;
}
