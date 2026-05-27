# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.ModCDPClientRoutedDefaultOverrides.ts
# - ./go/modcdp/client/ModCDPClientRoutedDefaultOverrides_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import glob
import os
import re
import sys
from pathlib import Path
from queue import Empty, Queue
from typing import Any
import unittest

from modcdp import ModCDPClient


# MODCDP_TEST_SUPPORT: LANGUAGE-SPECIFIC TEST SUPPORT ONLY.
# Keep setup semantics 1:1 with TS; this only selects a real browser for real --load-extension runs.
def load_extension_test_browser_path() -> str:
    for candidate in (os.environ.get("CHROME_PATH"), "/usr/bin/chromium" if sys.platform.startswith("linux") else None):
        if candidate and Path(candidate).exists():
            return candidate
    home = Path.home()
    if sys.platform == "darwin":
        patterns = [
            str(home / "Library/Caches/ms-playwright/chromium-*/chrome-mac*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
            str(home / "Library/Caches/ms-playwright/chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium"),
            str(home / "Library/Caches/puppeteer/chrome/mac*-*/chrome-mac*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
        ]
    elif sys.platform.startswith("win"):
        local_app_data = Path(os.environ.get("LOCALAPPDATA") or home / "AppData/Local")
        patterns = [
            str(local_app_data / "ms-playwright/chromium-*/chrome-win*/chrome.exe"),
            str(home / ".cache/puppeteer/chrome/win*-*/chrome.exe"),
        ]
    else:
        patterns = [
            str(home / ".cache/ms-playwright/chromium-*/chrome-linux*/chrome"),
            "/opt/pw-browsers/chromium-*/chrome-linux*/chrome",
            str(home / ".cache/puppeteer/chrome/linux-*/chrome-linux*/chrome"),
        ]
    candidates = sorted(
        dict.fromkeys(match for pattern in patterns for match in glob.glob(pattern)),
        key=lambda path: (-max([int(part) for part in re.findall(r"\d+", path)] or [0]), -Path(path).stat().st_mtime, path),
    )
    if candidates:
        return candidates[0]
    raise RuntimeError("No browser found for --load-extension tests. Install Chrome for Testing or set CHROME_PATH.")


HERE = Path(__file__).resolve().parent
EXTENSION_PATH = HERE.parents[1] / "dist" / "extension"
LOAD_EXTENSION_TEST_BROWSER_PATH = load_extension_test_browser_path()

GET_TARGETS_OVERRIDE = r"""
async (params) => {
  const [upstream, tabs] = await Promise.all([
    cdp.upstream.send("Target.getTargets", params),
    chrome.tabs.query({}),
  ]);

  const tabIdByUrl = new Map();
  for (const tab of tabs) {
    for (const url of [tab.url, tab.pendingUrl].filter(Boolean)) {
      if (!tabIdByUrl.has(url)) tabIdByUrl.set(url, tab.id);
    }
  }

  return {
    ...upstream,
    targetInfos: (upstream.targetInfos || []).map(targetInfo => ({
      ...targetInfo,
      tabId: tabIdByUrl.get(targetInfo.url) ?? null,
    })),
  };
}
"""

TAB_ID_FROM_TARGET_ID_COMMAND = r"""
async ({ targetId }) => {
  const { targetInfos = [] } = await cdp.upstream.send("Target.getTargets", {});
  const target = targetInfos.find(target => target.targetId === targetId);
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find(tab => target?.url && (tab.url === target.url || tab.pendingUrl === target.url));
  return { tabId: tab?.id ?? null };
}
"""

ADD_TAB_ID_MIDDLEWARE = r"""
async (payload, next) => {
  const seen = new WeakSet();
  const visit = async value => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (!Array.isArray(value) && typeof value.targetId === "string" && typeof value.type === "string" && value.tabId == null) {
      const { tabId } = await cdp.send("Custom.tabIdFromTargetId", { targetId: value.targetId });
      if (tabId != null) value.tabId = tabId;
    }
    for (const child of Array.isArray(value) ? value : Object.values(value)) await visit(child);
  };
  await visit(payload);
  return next(payload);
}
"""


def target_infos_from_result(result: Any) -> list[dict[str, Any]]:
    if not isinstance(result, dict):
        raise AssertionError(f"result = {result!r}")
    target_infos = result.get("targetInfos")
    if not isinstance(target_infos, list):
        raise AssertionError(f"targetInfos = {target_infos!r}")
    for target_info in target_infos:
        if not isinstance(target_info, dict):
            raise AssertionError(f"targetInfo = {target_info!r}")
    return target_infos


class ModCDPClientRoutedDefaultOverridesTests(unittest.TestCase):
    def test_service_worker_routed_standard_cdp_commands_and_events_can_be_transformed(self) -> None:
        owner = ModCDPClient(
            launcher={
                "launcher_mode": "local",
                "launcher_local_headless": True,
                "launcher_local_executable_path": LOAD_EXTENSION_TEST_BROWSER_PATH,
            },
            upstream={"upstream_mode": "ws"},
            injector={
                "injector_mode": "cli",
                "injector_cli_extension_path": str(EXTENSION_PATH),
                "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                "injector_trust_service_worker_target": True,
            },
        )
        owner.connect()
        cdp = ModCDPClient(
            launcher={"launcher_mode": "remote", "launcher_remote_cdp_url": owner.cdp_url},
            upstream={"upstream_mode": "ws", "upstream_ws_cdp_url": owner.cdp_url},
            injector={
                "injector_mode": "discover",
                "injector_service_worker_url_suffixes": ["/modcdp/service_worker.js"],
                "injector_trust_service_worker_target": True,
            },
            router={"router_routes": {
                    "Target.getTargets": "service_worker",
                    "Target.createTarget": "service_worker",
                    "Target.setDiscoverTargets": "service_worker",
                }
            },
            server_config={"upstream": {"upstream_ws_cdp_url": owner.cdp_url}, "router": {"router_routes": {"*.*": "loopback_cdp"}}},
        )

        try:
            cdp.connect()
            self.assertEqual(cdp.cdp_url, owner.cdp_url)
            self.assertIsNotNone(cdp.server_config)
            server_config = cdp.server_config
            if server_config is None or server_config.upstream is None:
                self.fail(f"server_config = {server_config!r}")
            self.assertEqual(server_config.upstream.upstream_ws_cdp_url, owner.cdp_url)

            raw_targets = cdp.send("Target.getTargets")
            raw_target_infos = target_infos_from_result(raw_targets)
            self.assertTrue(raw_target_infos)
            self.assertFalse(any("tabId" in target_info for target_info in raw_target_infos))

            cdp.Mod.addCustomCommand(
                {
                    "name": "Custom.tabIdFromTargetId",
                    "expression": TAB_ID_FROM_TARGET_ID_COMMAND,
                }
            )
            cdp.Mod.addMiddleware(
                {
                    "name": "*",
                    "phase": "response",
                    "expression": ADD_TAB_ID_MIDDLEWARE,
                }
            )
            middleware_targets = cdp.send("Target.getTargets")
            self.assertTrue(
                any(
                    target_info.get("type") == "page" and isinstance(target_info.get("tabId"), int)
                    for target_info in target_infos_from_result(middleware_targets)
                )
            )

            cdp.Mod.addMiddleware(
                {
                    "name": "*",
                    "phase": "event",
                    "expression": ADD_TAB_ID_MIDDLEWARE,
                }
            )
            cdp.Mod.addCustomCommand(
                {
                    "name": "Target.getTargets",
                    "expression": GET_TARGETS_OVERRIDE,
                }
            )

            enriched_targets = cdp.send("Target.getTargets")
            enriched_target_infos = target_infos_from_result(enriched_targets)
            self.assertTrue(enriched_target_infos)
            self.assertTrue(all("tabId" in target_info for target_info in enriched_target_infos))
            self.assertTrue(
                any(
                    target_info.get("type") == "page" and isinstance(target_info.get("tabId"), int)
                    for target_info in enriched_target_infos
                )
            )

            topology = cdp.Mod.getTopology()
            if not isinstance(topology, dict):
                self.fail(f"topology = {topology!r}")
            root_frame_id = topology.get("rootFrameId")
            frames = topology.get("frames")
            roots = topology.get("roots")
            contexts = topology.get("contexts")
            if not isinstance(frames, dict):
                self.fail(f"frames = {frames!r}")
            if not isinstance(roots, dict):
                self.fail(f"roots = {roots!r}")
            if not isinstance(contexts, dict):
                self.fail(f"contexts = {contexts!r}")
            self.assertIsInstance(root_frame_id, str)
            self.assertIn(root_frame_id, frames)
            self.assertTrue(any(root.get("kind") == "document" for root in roots.values()))
            self.assertTrue(any(context.get("world") == "piercer" for context in contexts.values()))

            cdp.Mod.addCustomEvent({"name": "Target.targetCreated"})
            transformed_events: Queue[dict] = Queue()

            def on_target_created(params):
                target_info = params.get("targetInfo") if isinstance(params, dict) else None
                if isinstance(target_info, dict) and "tabId" in target_info:
                    transformed_events.put(params)

            cdp.on("Target.targetCreated", on_target_created)
            cdp.Target.setDiscoverTargets(discover=False)
            cdp.Target.setDiscoverTargets(discover=True)
            cdp.Target.getTargets()

            try:
                event = transformed_events.get(timeout=2)
            except Empty:
                created_target = cdp.Target.createTarget(url="about:blank#modcdp-target-created")
                cdp.Target.getTargets()
                event = transformed_events.get(timeout=5)
                self.assertEqual(event["targetInfo"]["targetId"], created_target.targetId)
            self.assertIn("tabId", event["targetInfo"])
        finally:
            try:
                cdp.Target.setDiscoverTargets(discover=False)
            except Exception:
                pass
            cdp.close()
            owner.close()


if __name__ == "__main__":
    unittest.main()
