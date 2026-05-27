// MODCDP_TS_ONLY: DO NOT TRANSLATE THIS FILE TO OTHER LANGUAGES.
// Reason: not needed by Stagehand (exotic transport).
import {
  CdpCommandMessageSchema,
  type CdpCommandMessage,
  type CdpEventMessage,
  type CdpResponseMessage,
} from "../types/modcdp.js";
import { DownstreamTransport } from "./DownstreamTransport.js";
import { z } from "zod";

const DEFAULT_NATIVEMESSAGING_BRIDGE_HOST_NAME = "com.modcdp.bridge";
const DEFAULT_NATIVEMESSAGING_BRIDGE_RECONNECT_INTERVAL_MS = 2_000;

const NativeMessagingDownstreamTransportConfigSchema = z
  .object({
    upstream_nativemessaging_host_name: z.string().default(DEFAULT_NATIVEMESSAGING_BRIDGE_HOST_NAME),
    reconnect_interval_ms: z.number().positive().default(DEFAULT_NATIVEMESSAGING_BRIDGE_RECONNECT_INTERVAL_MS),
  })
  .strict();

/**
 * Owns the native messaging downstream connection from the extension service
 * worker to a native ModCDP host.
 *
 * This class owns only nativemessaging lifecycle: chrome.runtime.connectNative,
 * reconnect scheduling, port status, hello messages, command-message decoding,
 * CDP response posting, and event-message forwarding. It does not own ModCDP
 * command registration, routing, middleware, upstream target/session state,
 * reversews, or NATS protocol handling.
 *
 * Lifecycle:
 * 1. `start()` records the desired native host/reconnect interval and opens one
 *    native port if no port is currently connected.
 * 2. Successful connection posts the native hello and marks the transport
 *    connected.
 * 3. `onMessage` parses client CDP commands and delegates execution through
 *    the injected `handleCommand` callback.
 * 4. `onDisconnect` clears the active port, stores the browser-provided error,
 *    and schedules reconnect while a host is still configured.
 */
class NativeMessagingDownstreamTransport extends DownstreamTransport {
  readonly name = "nativemessaging" as const;
  config: z.infer<typeof NativeMessagingDownstreamTransportConfigSchema> =
    NativeMessagingDownstreamTransportConfigSchema.parse({});

  // True after start configures the native host. Cleared by stop and read by
  // reconnect scheduling/status.
  private started = false;

  // Active native messaging port. Set by connect, cleared by disconnect/error,
  // read by start and emit.
  private port: chrome.runtime.Port | null = null;

  // Pending reconnect timer. Set by scheduleReconnect and cleared when it fires.
  private reconnect_timer: ReturnType<typeof setTimeout> | null = null;

  // Number of native connection attempts. Incremented by connect, read by the
  // server status surface.
  private attempts = 0;

  // Last native messaging error. Updated by connect/disconnect, read by the
  // server status surface.
  private last_error: string | null = null;

  // Request object -> native port that sent it. Written by handleMessage and
  // read by sendResponse so responses go only to the originating downstream client.
  private readonly port_from_request = new WeakMap<CdpCommandMessage, chrome.runtime.Port>();

  /** True when the native messaging port is connected and can receive events. */
  get connected() {
    return this.port != null;
  }

  /** Configure and start the nativemessaging downstream connection. */
  start(hostName?: string, config: z.input<typeof NativeMessagingDownstreamTransportConfigSchema> = {}) {
    this.config = NativeMessagingDownstreamTransportConfigSchema.parse({
      ...config,
      upstream_nativemessaging_host_name: hostName,
    });
    this.started = true;
    return this.connect(this.config.upstream_nativemessaging_host_name);
  }

  /** Start polling for native messaging clients using the shipped extension default. */
  startPollingForClients() {
    return this.start();
  }

  /** Stop reconnecting and disconnect the active native messaging port. */
  stop(reason = "stopped") {
    const upstream_nativemessaging_host_name = this.started ? this.config.upstream_nativemessaging_host_name : null;
    this.started = false;
    if (this.reconnect_timer) {
      clearTimeout(this.reconnect_timer);
      this.reconnect_timer = null;
    }
    const port = this.port;
    this.port = null;
    try {
      port?.disconnect();
    } catch {}
    return { upstream_nativemessaging_host_name, stopped: true, reason };
  }

  /** Send one CDP response to the native host that sent the request. */
  sendResponse(request: CdpCommandMessage, response: CdpResponseMessage) {
    const port = this.port_from_request.get(request);
    if (!port) return false;
    port.postMessage(response);
    this.port_from_request.delete(request);
    return true;
  }

  /** Send one CDP event message to the connected native host. */
  sendEvent(message: CdpEventMessage) {
    if (!this.port) return 0;
    this.port.postMessage(message);
    return 1;
  }

  /** Return generic status without exposing nativemessaging lifecycle to ModCDPServer. */
  status() {
    return {
      connected: this.connected,
      attempts: this.attempts,
      last_error: this.last_error,
      config: this.started ? this.config : {},
    };
  }

  private scheduleReconnect() {
    if (!this.started) return;
    if (this.reconnect_timer) return;
    this.reconnect_timer = setTimeout(() => {
      this.reconnect_timer = null;
      if (this.started) this.connect(this.config.upstream_nativemessaging_host_name);
    }, this.config.reconnect_interval_ms);
  }

  private connect(hostName: string) {
    const chrome_api = globalThis.chrome;
    if (!chrome_api?.runtime?.connectNative) {
      this.scheduleReconnect();
      return {
        upstream_nativemessaging_host_name: hostName,
        connected: false,
        reason: "nativemessaging_unavailable",
      };
    }
    if (this.port) return { upstream_nativemessaging_host_name: hostName, connected: true };
    try {
      this.attempts += 1;
      this.last_error = null;
      const port = chrome_api.runtime.connectNative(hostName);
      this.port = port;
      port.postMessage({
        type: "modcdp.nativemessaging.hello",
        role: "extension-service-worker",
        version: 1,
        extension_id: globalThis.chrome?.runtime?.id ?? null,
      });
      port.onMessage.addListener((message) => {
        void this.handleMessage(port, message);
      });
      port.onDisconnect.addListener(() => {
        if (this.port === port) this.port = null;
        this.last_error = chrome_api.runtime.lastError?.message ?? "Native messaging port disconnected.";
        this.scheduleReconnect();
      });
      return { upstream_nativemessaging_host_name: hostName, connected: true };
    } catch (error) {
      this.port = null;
      this.last_error = error instanceof Error ? error.message : String(error);
      this.scheduleReconnect();
      return {
        upstream_nativemessaging_host_name: hostName,
        connected: false,
        reason: this.last_error,
      };
    }
  }

  private async handleMessage(port: chrome.runtime.Port, data: unknown) {
    const message = CdpCommandMessageSchema.parse(data);
    this.port_from_request.set(message, port);
    await this.handleRequest(message);
  }
}

export {
  DEFAULT_NATIVEMESSAGING_BRIDGE_HOST_NAME,
  DEFAULT_NATIVEMESSAGING_BRIDGE_RECONNECT_INTERVAL_MS,
  NativeMessagingDownstreamTransport,
};
