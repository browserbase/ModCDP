// Extension service worker entry point.

import { ModCDPServer } from "../../js/src/server/ModCDPServer.js";

const started_at = new Date().toISOString();

function startConfiguredTransports() {
  void ModCDPServer.ensureOffscreenKeepAlive();
  ModCDPServer.downstream.startDefault();
}

startConfiguredTransports();
chrome.runtime.onInstalled.addListener(startConfiguredTransports);
chrome.runtime.onStartup.addListener(startConfiguredTransports);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "modcdp.options.status") return false;
  sendResponse({
    now: new Date().toISOString(),
    self: {
      id: "self",
      runtime: {
        extension_id: chrome.runtime.id,
        service_worker_url: chrome.runtime.getURL("modcdp/service_worker.js"),
        options_url: chrome.runtime.getURL("options.html"),
        started_at,
      },
      server: {
        __ModCDPServerVersion: ModCDPServer.__ModCDPServerVersion,
        router: ModCDPServer.router,
        loopback_cdp_url: ModCDPServer.loopback_cdp_url,
        browser_token: ModCDPServer.browser_token ? "set" : null,
        cdp_send_timeout_ms: ModCDPServer.cdp_send_timeout_ms,
        loopback_execution_context_timeout_ms: ModCDPServer.loopback_execution_context_timeout_ms,
        ws_connect_error_settle_timeout_ms: ModCDPServer.ws_connect_error_settle_timeout_ms,
        downstream_transports: ModCDPServer.downstream.status(),
      },
    },
  });
  return false;
});

chrome.action?.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});
