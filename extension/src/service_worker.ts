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
        router: server.client
          ? { router_routes: server.client.router.router_routes }
          : null,
        loopback_cdp_url:
          server.client?.upstream.upstream_mode === "ws"
            ? (server.client.upstream.upstream_ws_cdp_url ?? null)
            : null,
        browser_token: server.server_browser_token ? "set" : null,
        cdp_send_timeout_ms:
          server.client?.client.client_cdp_send_timeout_ms ?? null,
        loopback_execution_context_timeout_ms:
          server.client?.router.loopback_execution_context_timeout_ms ?? null,
        ws_connect_error_settle_timeout_ms:
          server.client?.upstream.upstream_ws_connect_error_settle_timeout_ms ??
          null,
        downstream_client_timeout_ms:
          server.downstream.downstream_client_timeout_ms,
        close_browser_on_downstream_disconnect:
          server.downstream.close_browser_on_downstream_disconnect,
        downstream_transports: server.downstream.status(),
      },
    },
  });
  return false;
});

chrome.action?.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});
