import { CdpCommandMessageSchema, type CdpCommandMessage, type CdpEventMessage } from "../types/modcdp.js";

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
export class NativeHostDownstreamTransport {
  // Extension service-worker global scope. Read for chrome.runtime native
  // messaging APIs and runtime id in hello payloads.
  private readonly globalScope: typeof globalThis & { chrome?: typeof chrome };

  // Server-owned command executor. Read by port message handling; this class
  // never interprets routes, custom commands, or middleware itself.
  private readonly handleCommand: (message: CdpCommandMessage) => Promise<unknown>;

  // Server-owned keepalive hook. Called after the native port connects.
  private readonly startOffscreenKeepAlive: () => void;

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
    globalScope,
    handleCommand,
    startOffscreenKeepAlive,
  }: {
    globalScope: typeof globalThis & { chrome?: typeof chrome };
    handleCommand: (message: CdpCommandMessage) => Promise<unknown>;
    startOffscreenKeepAlive: () => void;
  }) {
    this.globalScope = globalScope;
    this.handleCommand = handleCommand;
    this.startOffscreenKeepAlive = startOffscreenKeepAlive;
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

  /** Emit one CDP event message to the connected native host. */
  emit(message: CdpEventMessage) {
    if (!this.port) return false;
    this.port.postMessage(message);
    return true;
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
    const chromeApi = this.globalScope.chrome;
    if (!chromeApi?.runtime?.connectNative) {
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
      const port = chromeApi.runtime.connectNative(hostName);
      this.port = port;
      this.startOffscreenKeepAlive();
      port.postMessage({
        type: "modcdp.native.hello",
        role: "extension-service-worker",
        version: 1,
        extension_id: this.globalScope.chrome?.runtime?.id ?? null,
      });
      port.onMessage.addListener((message) => {
        void this.handleMessage(port, message);
      });
      port.onDisconnect.addListener(() => {
        if (this.port === port) this.port = null;
        this.last_error = chromeApi.runtime.lastError?.message ?? "Native messaging port disconnected.";
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
