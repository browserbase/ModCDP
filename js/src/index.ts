// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./python/modcdp/__init__.py
// - ./go/modcdp/modcdp.go
import { browser_launcher_constructors, extension_injector_constructors } from "./client/ModCDPClient.js";
import { BBBrowserLauncher } from "./launcher/BBBrowserLauncher.js";
import { LocalBrowserLauncher } from "./launcher/LocalBrowserLauncher.js";
import { RemoteBrowserLauncher } from "./launcher/RemoteBrowserLauncher.js";
import { BBExtensionInjector } from "./injector/BBExtensionInjector.js";
import { CDPExtensionInjector } from "./injector/CDPExtensionInjector.js";
import { CLIExtensionInjector } from "./injector/CLIExtensionInjector.js";
import { DiscoverExtensionInjector } from "./injector/DiscoverExtensionInjector.js";

browser_launcher_constructors.set("local", LocalBrowserLauncher);
browser_launcher_constructors.set("remote", RemoteBrowserLauncher);
browser_launcher_constructors.set("bb", BBBrowserLauncher);
extension_injector_constructors.set("cli", CLIExtensionInjector);
extension_injector_constructors.set("cdp", CDPExtensionInjector);
extension_injector_constructors.set("bb", BBExtensionInjector);
extension_injector_constructors.set("discover", DiscoverExtensionInjector);

export * from "./client/ModCDPClient.js";
export { ModCDPServer } from "./server/ModCDPServer.js";
export { BrowserLauncher, resolveCdpWebSocketUrl } from "./launcher/BrowserLauncher.js";
export type { LauncherConfig, LaunchedBrowser, LauncherMode } from "./launcher/BrowserLauncher.js";
export { LocalBrowserLauncher } from "./launcher/LocalBrowserLauncher.js";
export { RemoteBrowserLauncher } from "./launcher/RemoteBrowserLauncher.js";
export { BBBrowserLauncher } from "./launcher/BBBrowserLauncher.js";
export { NoneBrowserLauncher } from "./launcher/NoneBrowserLauncher.js";
export {
  DEFAULT_MODCDP_EXTENSION_ID,
  DEFAULT_MODCDP_SERVICE_WORKER_URL_SUFFIXES,
  ExtensionInjector,
} from "./injector/ExtensionInjector.js";
export {
  defaultModCDPExtensionPath,
  extensionIdFromManifestKey,
  prepareUnpackedExtension,
} from "./injector/NodeExtensionFiles.js";
export type { PreparedExtension } from "./injector/NodeExtensionFiles.js";
export type {
  ExtensionInjectionResult,
  InjectorConfig,
  InjectorMode,
  SendCDP,
  TargetInfo,
} from "./injector/ExtensionInjector.js";
export { CLIExtensionInjector } from "./injector/CLIExtensionInjector.js";
export { CDPExtensionInjector } from "./injector/CDPExtensionInjector.js";
export { DiscoverExtensionInjector } from "./injector/DiscoverExtensionInjector.js";
export { BBExtensionInjector } from "./injector/BBExtensionInjector.js";
export { UpstreamTransport, parseHostPort } from "./transport/UpstreamTransport.js";
export type { UpstreamMode, UpstreamTransportConfig } from "./transport/UpstreamTransport.js";
export { DownstreamTransport } from "./transport/DownstreamTransport.js";
export { DownstreamTransportSet } from "./transport/DownstreamTransportSet.js";
export type {
  DownstreamRequestHandler,
  DownstreamTransportName,
  DownstreamTransportStatus,
} from "./transport/DownstreamTransport.js";
export type { TargetRoute, UpstreamEventListener } from "./transport/UpstreamTransport.js";
export { WSUpstreamTransport } from "./transport/WSUpstreamTransport.js";
export { ReverseWSDownstreamTransport } from "./transport/ReverseWSDownstreamTransport.js";
export { NativeMessagingDownstreamTransport } from "./transport/NativeMessagingDownstreamTransport.js";
export { NATSDownstreamTransport } from "./transport/NATSDownstreamTransport.js";
export { AutoSessionRouter } from "./router/AutoSessionRouter.js";
export { CDPTypes } from "./types/CDPTypes.js";
export type {
  CDPCommandAliases,
  CDPCommandMap,
  CDPCommandSpec,
  CDPEventMap,
  CDPEventSpec,
  CDPTypesConfig,
} from "./types/CDPTypes.js";
export { wrapCommandIfNeeded, unwrapResponseIfNeeded, unwrapEventIfNeeded } from "./translate/translate.js";
export * as server from "./server/ModCDPServer.js";
export * as launcher from "./launcher/BrowserLauncher.js";
export * as localBrowserLauncher from "./launcher/LocalBrowserLauncher.js";
export * as remoteBrowserLauncher from "./launcher/RemoteBrowserLauncher.js";
export * as bbBrowserLauncher from "./launcher/BBBrowserLauncher.js";
export * as noneBrowserLauncher from "./launcher/NoneBrowserLauncher.js";
export * as injector from "./injector/ExtensionInjector.js";
export * as cliExtensionInjector from "./injector/CLIExtensionInjector.js";
export * as cdpExtensionInjector from "./injector/CDPExtensionInjector.js";
export * as discoverExtensionInjector from "./injector/DiscoverExtensionInjector.js";
export * as bbExtensionInjector from "./injector/BBExtensionInjector.js";
export * as upstreamTransport from "./transport/UpstreamTransport.js";
export * as downstreamTransport from "./transport/DownstreamTransport.js";
export * as downstreamTransportSet from "./transport/DownstreamTransportSet.js";
export * as wsUpstreamTransport from "./transport/WSUpstreamTransport.js";
export * as reverseWSDownstreamTransport from "./transport/ReverseWSDownstreamTransport.js";
export * as nativeMessagingDownstreamTransport from "./transport/NativeMessagingDownstreamTransport.js";
export * as natsDownstreamTransport from "./transport/NATSDownstreamTransport.js";
export * as router from "./router/AutoSessionRouter.js";
export * as translate from "./translate/translate.js";
export * as proxy from "./proxy/proxy.js";
export * as types from "./types/modcdp.js";
export * as cdpTypes from "./types/CDPTypes.js";
