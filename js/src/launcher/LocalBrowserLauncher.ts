// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/launcher/LocalBrowserLauncher.py
// - ./go/modcdp/launcher/LocalBrowserLauncher.go
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { homedir, platform, tmpdir } from "node:os";
import path from "node:path";
import { BrowserLauncher, type LauncherConfig, type LaunchedBrowser } from "./BrowserLauncher.js";

function wildcardToRegExp(value: string) {
  return new RegExp(`^${value.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
}

function expandGlob(pattern: string) {
  const normalized = path.normalize(pattern);
  const { root } = path.parse(normalized);
  const parts = normalized.slice(root.length).split(path.sep).filter(Boolean);
  let candidates = [root || "."];
  for (const part of parts) {
    const hasWildcard = part.includes("*");
    const matcher = hasWildcard ? wildcardToRegExp(part) : null;
    const next: string[] = [];
    for (const base of candidates) {
      if (!existsSync(base)) continue;
      if (!hasWildcard) {
        const candidate = path.join(base, part);
        if (existsSync(candidate)) next.push(candidate);
        continue;
      }
      try {
        for (const child of readdirSync(base)) {
          if (matcher!.test(child)) next.push(path.join(base, child));
        }
      } catch {}
    }
    candidates = next;
  }
  return candidates.filter((candidate) => existsSync(candidate));
}

function newestFirst(candidates: string[]) {
  const score = (candidate: string) => {
    const numbers = candidate.match(/\d+/g)?.map(Number) ?? [];
    const version = numbers.length > 0 ? Math.max(...numbers) : 0;
    let mtime = 0;
    try {
      mtime = statSync(candidate).mtimeMs;
    } catch {}
    return { version, mtime };
  };
  return [...new Set(candidates)].sort((a, b) => {
    const left = score(a);
    const right = score(b);
    return right.version - left.version || right.mtime - left.mtime || a.localeCompare(b);
  });
}

function chromeForTestingCandidates() {
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
  return newestFirst(patterns.flatMap(expandGlob));
}

function candidatePaths() {
  const home = homedir();
  const programFiles = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"]].filter(Boolean) as string[];
  const canary =
    platform() === "darwin"
      ? ["/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"]
      : platform() === "win32"
        ? [
            path.join(
              process.env.LOCALAPPDATA || path.join(home, "AppData/Local"),
              "Google/Chrome SxS/Application/chrome.exe",
            ),
            ...programFiles.map((base) => path.join(base, "Google/Chrome SxS/Application/chrome.exe")),
          ]
        : ["/usr/bin/google-chrome-canary", "/usr/bin/google-chrome-unstable", "/opt/google/chrome-unstable/chrome"];
  const stock =
    platform() === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : platform() === "win32"
        ? [
            ...programFiles.map((base) => path.join(base, "Google/Chrome/Application/chrome.exe")),
            path.join(
              process.env.LOCALAPPDATA || path.join(home, "AppData/Local"),
              "Google/Chrome/Application/chrome.exe",
            ),
          ]
        : ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/opt/google/chrome/chrome"];
  const chromium = platform() === "linux" ? ["/usr/bin/chromium", "/usr/bin/chromium-browser"] : [];
  return [process.env.CHROME_PATH, ...chromium, ...canary, ...chromeForTestingCandidates(), ...stock].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
}

const DEFAULT_FLAGS = [
  "--enable-unsafe-extension-debugging",
  "--remote-allow-origins=*",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-default-apps",
  "--disable-dev-shm-usage",
  "--disable-background-networking",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  "--disable-sync",
  "--disable-features=DisableLoadExtensionCommandLineSwitch",
  "--password-store=basic",
  "--use-mock-keychain",
];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function terminateProcess(proc: ChildProcess, timeoutMs = 2_000) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const signalProcess = (signal: NodeJS.Signals) => {
    if (process.platform !== "win32" && proc.pid) {
      try {
        process.kill(-proc.pid, signal);
        return;
      } catch {}
    }
    try {
      proc.kill(signal);
    } catch {}
  };
  signalProcess("SIGTERM");
  await Promise.race([once(proc, "exit"), delay(timeoutMs)]);
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  signalProcess("SIGKILL");
  await Promise.race([once(proc, "exit"), delay(timeoutMs)]);
}

async function removeProfileDir(profile_dir: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await rm(profile_dir, { recursive: true, force: true }).catch(() => {});
    if (!existsSync(profile_dir)) return;
    await delay(100 * (attempt + 1));
  }
  try {
    await rm(profile_dir, { recursive: true, force: true });
  } catch {}
}

async function readDevToolsActivePort(profile_dir: string) {
  const activePortPath = path.join(profile_dir, "DevToolsActivePort");
  let body: string;
  try {
    body = await readFile(activePortPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const [rawPort, websocketPath] = body.trim().split(/\r?\n/);
  if (!rawPort || !websocketPath) return null;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid DevToolsActivePort port: ${rawPort}`);
  return { cdp_listen_port: port, cdp_url: `http://127.0.0.1:${port}`, websocketPath };
}

class LocalBrowserLauncher extends BrowserLauncher {
  constructor(config: LauncherConfig = {}) {
    super({ ...config, launcher_mode: "local" });
  }

  static findChromeBinary(explicit?: string | null) {
    const candidates = [explicit, ...candidatePaths()].filter((candidate): candidate is string => Boolean(candidate));
    for (const candidate of candidates) {
      if (candidate && existsSync(candidate)) return candidate;
    }
    throw new Error(
      `No Chrome/Chromium binary found. Tried: ${candidates.join(", ")}. Set CHROME_PATH or pass launcher_local_executable_path.`,
    );
  }

  static async freePort() {
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return port;
  }

  async launch(config: LauncherConfig = {}): Promise<LaunchedBrowser> {
    const launch_config = { ...this.config, ...config };
    const exe = LocalBrowserLauncher.findChromeBinary(launch_config.launcher_local_executable_path);
    const usePort = launch_config.launcher_local_cdp_listen_port ?? 0;
    const profile_dir = launch_config.launcher_local_user_data_dir || (await mkdtemp(path.join(tmpdir(), "modcdp.")));
    const default_headless = process.platform === "linux" && !process.env.DISPLAY;
    const headless = launch_config.launcher_local_headless ?? default_headless;
    const sandbox = launch_config.launcher_local_sandbox ?? !default_headless;
    const flags = [
      ...DEFAULT_FLAGS,
      headless ? "--headless=new" : null,
      "--disable-gpu",
      sandbox === false ? "--no-sandbox" : null,
      `--user-data-dir=${profile_dir}`,
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${usePort}`,
      ...launch_config.launcher_local_args,
      ...launch_config.launcher_local_extra_args,
      "about:blank",
    ].filter(Boolean);

    const proc = spawn(exe, flags, {
      stdio: "ignore",
      detached: process.platform !== "win32",
    });
    let spawnError: Error | null = null;
    proc.once("error", (error) => {
      spawnError = error;
    });
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      await terminateProcess(proc);
      if (!launch_config.launcher_local_user_data_dir || launch_config.launcher_local_cleanup_user_data_dir)
        await removeProfileDir(profile_dir);
    };
    const assertChromeRunning = () => {
      if (spawnError) throw spawnError;
      if (proc.exitCode !== null || proc.signalCode !== null) {
        throw new Error(`Chrome exited before CDP became ready (exit=${proc.exitCode}, signal=${proc.signalCode}).`);
      }
    };

    const deadline = Date.now() + launch_config.launcher_local_chrome_ready_timeout_ms;
    while (Date.now() < deadline) {
      try {
        assertChromeRunning();
      } catch (error) {
        await close();
        throw error;
      }
      const activePort =
        usePort === 0
          ? await readDevToolsActivePort(profile_dir)
          : { cdp_listen_port: usePort as number, cdp_url: `http://127.0.0.1:${usePort}` };
      if (!activePort) {
        await delay(launch_config.launcher_local_chrome_ready_poll_interval_ms);
        continue;
      }
      try {
        const response = await fetch(`${activePort.cdp_url}/json/version`);
        if (response.ok) {
          const version = await response.json();
          // cdp_url is resolved from the HTTP discovery endpoint before returning.
          this.launched = {
            proc,
            cdp_listen_port: activePort.cdp_listen_port,
            cdp_url: version.webSocketDebuggerUrl ?? activePort.cdp_url,
            loopback_cdp_url: version.webSocketDebuggerUrl ?? activePort.cdp_url,
            profile_dir,
            close,
          };
          return this.launched;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, launch_config.launcher_local_chrome_ready_poll_interval_ms));
    }
    await close();
    throw new Error(`Chrome did not become ready within ${launch_config.launcher_local_chrome_ready_timeout_ms}ms`);
  }
}

export { LocalBrowserLauncher };
