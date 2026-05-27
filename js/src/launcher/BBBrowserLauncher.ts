// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/launcher/BBBrowserLauncher.py
// - ./go/modcdp/launcher/BBBrowserLauncher.go
import { BrowserLauncher, type LauncherConfig, type LaunchedBrowser } from "./BrowserLauncher.js";
import { ModCDPLauncherConfigSchema } from "../types/modcdp.js";

type BrowserbaseSession = {
  id?: string;
  connectUrl?: string;
  debuggerUrl?: string;
  debuggerFullscreenUrl?: string;
  status?: string;
};

function browserbaseUrl(base_url: string, pathname: string) {
  return new URL(pathname, `${base_url.replace(/\/$/, "")}/`).toString();
}

async function browserbaseRequest<T>({
  base_url,
  browserbase_api_key,
  method,
  pathname,
  body,
}: {
  base_url: string;
  browserbase_api_key: string;
  method: "GET" | "POST";
  pathname: string;
  body?: Record<string, unknown>;
}) {
  const response = await fetch(browserbaseUrl(base_url, pathname), {
    method,
    headers: {
      "content-type": "application/json",
      "x-bb-api-key": browserbase_api_key,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Browserbase ${method} ${pathname} -> ${response.status}${text ? `: ${text}` : ""}`);
  }
  return (await response.json()) as T;
}

async function closeBrowserCDP(cdp_url: string | undefined) {
  if (!cdp_url || !/^wss?:\/\//i.test(cdp_url) || typeof WebSocket !== "function") return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const ws = new WebSocket(cdp_url);
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {}
      resolve();
    };
    const timeout = setTimeout(finish, 2_000);
    ws.addEventListener("open", () => {
      try {
        ws.send(JSON.stringify({ id: 1, method: "Browser.close", params: {} }));
      } catch {
        finish();
      }
    });
    ws.addEventListener("message", finish, { once: true });
    ws.addEventListener("close", finish, { once: true });
    ws.addEventListener("error", finish, { once: true });
  });
}

class BBBrowserLauncher extends BrowserLauncher {
  constructor(config: LauncherConfig = {}) {
    super({ ...config, launcher_mode: "bb" });
  }

  async launch(config: LauncherConfig = {}): Promise<LaunchedBrowser> {
    const launch_config = ModCDPLauncherConfigSchema.parse({ ...this.config, ...config });
    const browserbase_api_key = launch_config.launcher_bb_api_key ?? process.env.BROWSERBASE_API_KEY;
    if (!browserbase_api_key) {
      throw new Error("launcher_mode=bb requires BROWSERBASE_API_KEY or launcher.launcher_bb_api_key.");
    }

    const base_url = launch_config.launcher_bb_base_url;
    const resume_session_id = launch_config.launcher_bb_session_id;
    const keep_alive = launch_config.launcher_bb_keep_alive;
    const close_session_on_close = launch_config.launcher_bb_close_session_on_close ?? !keep_alive;

    let created_session = false;
    let session: BrowserbaseSession;
    if (resume_session_id) {
      session = await browserbaseRequest<BrowserbaseSession>({
        base_url,
        browserbase_api_key,
        method: "GET",
        pathname: `/v1/sessions/${resume_session_id}`,
      });
    } else {
      const session_create_params = launch_config.launcher_bb_session_create_params;
      const browser_settings = {
        ...(session_create_params.browserSettings ?? {}),
        ...launch_config.launcher_bb_browser_settings,
      };
      const user_metadata = {
        ...session_create_params.userMetadata,
        ...launch_config.launcher_bb_user_metadata,
      };
      const extension_id =
        launch_config.launcher_bb_extension_id ??
        session_create_params.extensionId ??
        session_create_params.browserSettings?.extensionId;
      const region = launch_config.launcher_bb_region ?? session_create_params.region;
      const body = {
        ...session_create_params,
        ...(keep_alive ? { keepAlive: true } : {}),
        ...(region ? { region } : {}),
        ...(typeof launch_config.launcher_bb_timeout === "number"
          ? { timeout: launch_config.launcher_bb_timeout }
          : {}),
        ...(extension_id ? { extensionId: extension_id } : {}),
        browserSettings: {
          ...browser_settings,
          ...(extension_id ? { extensionId: extension_id } : {}),
          viewport: browser_settings.viewport,
        },
        userMetadata: {
          ...user_metadata,
          modcdp: "true",
        },
      };
      session = await browserbaseRequest<BrowserbaseSession>({
        base_url,
        browserbase_api_key,
        method: "POST",
        pathname: "/v1/sessions",
        body,
      });
      created_session = true;
    }

    if (!session.id || !session.connectUrl) {
      throw new Error("Browserbase session creation returned an unexpected shape.");
    }

    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      if (!created_session || !close_session_on_close) return;
      await closeBrowserCDP(session.connectUrl).catch(() => {});
      await browserbaseRequest({
        base_url,
        browserbase_api_key,
        method: "POST",
        pathname: `/v1/sessions/${session.id}`,
        body: { status: "REQUEST_RELEASE" },
      }).catch(() => {});
    };

    this.launched = {
      // Browserbase connectUrl is already a WebSocket CDP endpoint.
      cdp_url: session.connectUrl,
      browserbase_session_id: session.id,
      browserbase_session_url: `https://www.browserbase.com/sessions/${session.id}`,
      browserbase_debug_url: session.debuggerUrl ?? session.debuggerFullscreenUrl ?? null,
      close,
    };
    return this.launched;
  }
}

export { BBBrowserLauncher };
