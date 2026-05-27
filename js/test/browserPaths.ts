import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";

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

function loadExtensionTestBrowserPath() {
  const explicit_candidates = [process.env.CHROME_PATH, platform() === "linux" ? "/usr/bin/chromium" : null].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  for (const candidate of explicit_candidates) {
    if (existsSync(candidate)) return candidate;
  }
  const [chrome_for_testing] = chromeForTestingCandidates();
  if (chrome_for_testing) return chrome_for_testing;
  throw new Error("No browser found for --load-extension tests. Install Chrome for Testing or set CHROME_PATH.");
}

export { loadExtensionTestBrowserPath };
