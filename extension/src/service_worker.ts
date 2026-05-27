// Extension service worker entry point.

import { ModCDPServer } from "../../js/src/server/ModCDPServer.js";

const started_at = new Date().toISOString();
const server = await new ModCDPServer().start();

function startConfiguredTransports() {
  void server.ensureOffscreenKeepAlive();
  server.downstream.startDefault();
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
        __ModCDPServerVersion: server.__ModCDPServerVersion,
        router: server.router,
        loopback_cdp_url: server.loopback_cdp_url,
        browser_token: server.browser_token ? "set" : null,
        cdp_send_timeout_ms: server.cdp_send_timeout_ms,
        loopback_execution_context_timeout_ms:
          server.loopback_execution_context_timeout_ms,
        ws_connect_error_settle_timeout_ms:
          server.ws_connect_error_settle_timeout_ms,
        downstream_transports: server.downstream.status(),
      },
    },
  });
  return false;
});

chrome.action?.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});
