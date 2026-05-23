// Extension service worker entry point.

import { ModCDPServer } from "../../js/src/server/ModCDPServer.js";

type ServiceWorkerModCDPServer = {
  __ModCDPServerVersion?: number;
  routes: unknown;
  loopback_cdp_url: string | null;
  browser_token: string | null;
  cdp_send_timeout_ms: number;
  loopback_execution_context_timeout_ms: number;
  ws_connect_error_settle_timeout_ms: number;
  ensureOffscreenKeepAlive(): unknown;
  startDownstreamTransports(): unknown;
  downstreamTransports(): unknown;
};

const server = ModCDPServer as unknown as ServiceWorkerModCDPServer;
const started_at = new Date().toISOString();

function startConfiguredTransports() {
  void server.ensureOffscreenKeepAlive();
  server.startDownstreamTransports();
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
        routes: server.routes,
        loopback_cdp_url: server.loopback_cdp_url,
        browser_token: server.browser_token ? "set" : null,
        cdp_send_timeout_ms: server.cdp_send_timeout_ms,
        loopback_execution_context_timeout_ms: server.loopback_execution_context_timeout_ms,
        ws_connect_error_settle_timeout_ms: server.ws_connect_error_settle_timeout_ms,
        downstream_transports: server.downstreamTransports(),
      },
    },
  });
  return false;
});

chrome.action?.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});
