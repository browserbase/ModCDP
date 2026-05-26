import { resolveCdpWebSocketUrl } from "../launcher/BrowserLauncher.js";
import { UpstreamTransport, type UpstreamTransportConfig } from "./UpstreamTransport.js";

export class WebSocketUpstreamTransport extends UpstreamTransport {
  readonly upstream_mode = "ws" as const;
  readonly endpoint_kind = "raw_cdp" as const;
  ws: WebSocket | null = null;

  constructor({ cdp_url = null }: { cdp_url?: string | null } = {}) {
    super();
    this.upstream_cdp_url = cdp_url ?? "";
    this.send_command = (message) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("CDP websocket is not connected.");
      this.ws.send(JSON.stringify(message));
    };
  }

  update(config: UpstreamTransportConfig = {}) {
    if (config.cdp_url) this.upstream_cdp_url = config.cdp_url;
    if (typeof config.cdp_send_timeout_ms === "number") this.cdp_send_timeout_ms = config.cdp_send_timeout_ms;
    return this;
  }

  getServerConfig() {
    return this.upstream_cdp_url ? { server_loopback_cdp_url: this.upstream_cdp_url } : {};
  }

  async connect() {
    if (!this.upstream_cdp_url)
      throw new Error("upstream.upstream_mode=ws requires upstream_cdp_url or launcher-provided cdp_url.");
    // cdp_url may start as an HTTP discovery endpoint; from here on it is the resolved WebSocket CDP endpoint.
    this.upstream_cdp_url = await resolveCdpWebSocketUrl(this.upstream_cdp_url, "upstream_cdp_url");
    const ws = new WebSocket(this.upstream_cdp_url);
    this.ws = ws;
    ws.addEventListener("message", (event) => this.parseAndEmitRecv(event.data));
    ws.addEventListener("close", () => this.emitClose(new Error("CDP websocket closed")));
    ws.addEventListener("error", () => this.emitClose(new Error("CDP websocket error")));
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
      };
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("CDP websocket error"));
      };
      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onError);
    });
  }

  async close() {
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }
}
