import {
  CdpCommandMessageSchema,
  type CdpCommandMessage,
  type CdpEventMessage,
  type ModCDPConfigureParams,
} from "../types/modcdp.js";
import type { ServerDownstreamTransport } from "./ServerDownstreamTransport.js";

export const DEFAULT_NATIVE_BRIDGE_HOST_NAME = "com.modcdp.bridge";
export const DEFAULT_NATIVE_BRIDGE_RECONNECT_INTERVAL_MS = 2_000;

/**
 * Owns the native messaging downstream connection from the extension service
 * worker to a native ModCDP host.
 *
 * This class owns only native-host lifecycle: chrome.runtime.connectNative,
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
export class NativeHostDownstreamTransport implements ServerDownstreamTransport {
  readonly name = "native";

  // Server-owned command executor. Read by port message handling; this class
  // never interprets routes, custom commands, or middleware itself.
  private readonly handleCommand: (message: CdpCommandMessage) => Promise<unknown>;

  // Server-owned keepalive hook. Called after the native port connects.
  private readonly ensureOffscreenKeepAlive: () => unknown;

  // Configured native host name. Set by start, read by reconnect scheduling.
  private host_name: string | null = null;

  // Reconnect interval currently configured for the native host. Set by start
  // and read by disconnect/error handling.
  private reconnect_interval_ms = DEFAULT_NATIVE_BRIDGE_RECONNECT_INTERVAL_MS;

  // Active native messaging port. Set by connect, cleared by disconnect/error,
  // read by start and emit.
  private port: chrome.runtime.Port | null = null;

  // Pending reconnect timer. Set by scheduleReconnect and cleared when it fires.
  private reconnect_timer: ReturnType<typeof setTimeout> | null = null;

  // Number of native connection attempts. Incremented by connect, read by the
  // server status surface.
  attempts = 0;

  // Last native messaging error. Updated by connect/disconnect, read by the
  // server status surface.
  last_error: string | null = null;

  constructor({
    handleCommand,
    ensureOffscreenKeepAlive,
  }: {
    handleCommand: (message: CdpCommandMessage) => Promise<unknown>;
    ensureOffscreenKeepAlive: () => unknown;
  }) {
    this.handleCommand = handleCommand;
    this.ensureOffscreenKeepAlive = ensureOffscreenKeepAlive;
  }

  /** True when the native messaging port is connected and can receive events. */
  get connected() {
    return this.port != null;
  }

  /** Configure and start the native-host downstream connection. */
  start(
    hostName = DEFAULT_NATIVE_BRIDGE_HOST_NAME,
    {
      reconnect_interval_ms = DEFAULT_NATIVE_BRIDGE_RECONNECT_INTERVAL_MS,
    }: {
      reconnect_interval_ms?: number;
    } = {},
  ) {
    this.host_name = hostName;
    this.reconnect_interval_ms = reconnect_interval_ms;
    return this.connect(hostName);
  }

  /** Start the default native host configured into the shipped extension. */
  startDefault() {
    return this.start(DEFAULT_NATIVE_BRIDGE_HOST_NAME, {
      reconnect_interval_ms: DEFAULT_NATIVE_BRIDGE_RECONNECT_INTERVAL_MS,
    });
  }

  /** Native host default lifecycle is not configured by Mod.configure. */
  configure(_params: ModCDPConfigureParams) {
    return null;
  }

  /** Stop reconnecting and disconnect the active native messaging port. */
  stop(reason = "stopped") {
    const upstream_nativemessaging_host_name = this.host_name;
    this.host_name = null;
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

  /** Emit one CDP event message to the connected native host. */
  emit(message: CdpEventMessage) {
    if (!this.port) return false;
    this.port.postMessage(message);
    return true;
  }

  /** Return generic status without exposing native-host lifecycle to ModCDPServer. */
  status() {
    return {
      connected: this.connected,
      attempts: this.attempts,
      last_error: this.last_error,
      config: this.host_name ? { upstream_nativemessaging_host_name: this.host_name } : {},
    };
  }

  private scheduleReconnect(delay_ms: number) {
    if (!this.host_name) return;
    if (this.reconnect_timer) return;
    this.reconnect_timer = setTimeout(() => {
      this.reconnect_timer = null;
      if (this.host_name) this.connect(this.host_name);
    }, delay_ms);
  }

  private connect(hostName: string) {
    const chrome_api = globalThis.chrome;
    if (!chrome_api?.runtime?.connectNative) {
      this.scheduleReconnect(this.reconnect_interval_ms);
      return {
        upstream_nativemessaging_host_name: hostName,
        connected: false,
        reason: "native_messaging_unavailable",
      };
    }
    if (this.port) return { upstream_nativemessaging_host_name: hostName, connected: true };
    try {
      this.attempts += 1;
      this.last_error = null;
      const port = chrome_api.runtime.connectNative(hostName);
      this.port = port;
      void this.ensureOffscreenKeepAlive();
      port.postMessage({
        type: "modcdp.native.hello",
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
        this.scheduleReconnect(this.reconnect_interval_ms);
      });
      return { upstream_nativemessaging_host_name: hostName, connected: true };
    } catch (error) {
      this.port = null;
      this.last_error = error instanceof Error ? error.message : String(error);
      this.scheduleReconnect(this.reconnect_interval_ms);
      return {
        upstream_nativemessaging_host_name: hostName,
        connected: false,
        reason: this.last_error,
      };
    }
  }

  private async handleMessage(port: chrome.runtime.Port, data: unknown) {
    let message: CdpCommandMessage;
    try {
      message = CdpCommandMessageSchema.parse(data);
    } catch {
      return;
    }

    try {
      const result = await this.handleCommand(message);
      port.postMessage({ id: message.id, result });
    } catch (error) {
      port.postMessage({
        id: message.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
