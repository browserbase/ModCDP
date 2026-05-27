// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/index.ts
// - ./python/modcdp/__init__.py
package modcdp

import (
	"github.com/browserbase/modcdp/go/modcdp/client"
	"github.com/browserbase/modcdp/go/modcdp/injector"
	"github.com/browserbase/modcdp/go/modcdp/launcher"
	"github.com/browserbase/modcdp/go/modcdp/translate"
	"github.com/browserbase/modcdp/go/modcdp/transport"
	"github.com/browserbase/modcdp/go/modcdp/types"
)

type ModCDPClient = client.ModCDPClient
type Config = client.Config
type LauncherConfig = client.LauncherConfig
type ClientConfig = client.ClientConfig
type ServerConfig = client.ServerConfig
type RouterConfig = client.RouterConfig
type CustomCommand = client.CustomCommand
type CustomEvent = client.CustomEvent
type CustomMiddleware = client.CustomMiddleware
type CDPTypes = client.CDPTypes
type LaunchedBrowser = launcher.LaunchedBrowser
type BrowserLauncher = launcher.BrowserLauncher
type LocalBrowserLauncher = launcher.LocalBrowserLauncher
type RemoteBrowserLauncher = launcher.RemoteBrowserLauncher
type BBBrowserLauncher = launcher.BBBrowserLauncher
type NoneBrowserLauncher = launcher.NoneBrowserLauncher
type InjectorConfig = client.InjectorConfig
type ExtensionInjectionResult = client.ExtensionInjectionResult
type ExtensionInjector = injector.ExtensionInjector
type PreparedExtension = injector.PreparedExtension
type DiscoverExtensionInjector = injector.DiscoverExtensionInjector
type BBExtensionInjector = injector.BBExtensionInjector
type CLIExtensionInjector = injector.CLIExtensionInjector
type CDPExtensionInjector = injector.CDPExtensionInjector
type UpstreamMode = transport.UpstreamMode
type UpstreamTransportConfig = transport.UpstreamTransportConfig
type UpstreamTransport = transport.UpstreamTransport
type WSUpstreamTransport = transport.WSUpstreamTransport
type HostPort = transport.HostPort
type AutoSessionRouter = client.AutoSessionRouter
type CdpCommandParams = types.CdpCommandParams
type CdpCommandResult = types.CdpCommandResult
type CdpEventParams = types.CdpEventParams
type RuntimeBindingCalledEvent = types.RuntimeBindingCalledEvent
type TargetAttachedToTargetEvent = types.TargetAttachedToTargetEvent
type ModCDPRoutes = types.ModCDPRoutes
type ModCDPEvaluateParams = types.ModCDPEvaluateParams
type ModCDPAddCustomCommandParams = types.ModCDPAddCustomCommandParams
type ModCDPAddCustomEventObjectParams = types.ModCDPAddCustomEventObjectParams
type ModCDPAddMiddlewareParams = types.ModCDPAddMiddlewareParams
type ModCDPPingParams = types.ModCDPPingParams
type ModCDPPongEvent = types.ModCDPPongEvent
type ModCDPPingLatency = types.ModCDPPingLatency
type ModCDPGetTopologyParams = types.ModCDPGetTopologyParams
type ModCDPTopologyFrame = types.ModCDPTopologyFrame
type ModCDPTopologyDomRoot = types.ModCDPTopologyDomRoot
type ModCDPTopologyTarget = types.ModCDPTopologyTarget
type ModCDPTopologyExecutionContext = types.ModCDPTopologyExecutionContext
type ModCDPTopology = types.ModCDPTopology
type ModCDPGetTopologyResponse = types.ModCDPGetTopologyResponse
type ModCDPConfigureParams = types.ModCDPConfigureParams
type ModCDPCommandParams = types.ModCDPCommandParams
type ModCDPCommandResult = types.ModCDPCommandResult
type ModCDPEvaluateResponse = types.ModCDPEvaluateResponse
type ModCDPConfigureResponse = types.ModCDPConfigureResponse
type ModCDPAddCustomCommandResponse = types.ModCDPAddCustomCommandResponse
type ModCDPAddCustomEventResponse = types.ModCDPAddCustomEventResponse
type ModCDPAddMiddlewareResponse = types.ModCDPAddMiddlewareResponse
type ModCDPPingResponse = types.ModCDPPingResponse
type ModCDPBindingPayload = types.ModCDPBindingPayload
type CdpDebuggeeCommandParams = types.CdpDebuggeeCommandParams
type ProtocolParams = types.ProtocolParams
type ProtocolResult = types.ProtocolResult
type ProtocolPayload = types.ProtocolPayload
type CdpError = types.CdpError
type CdpCommandMessage = types.CdpCommandMessage
type CdpResponseMessage = types.CdpResponseMessage
type CdpEventMessage = types.CdpEventMessage
type TranslatedStep = types.TranslatedStep
type TranslatedCommand = types.TranslatedCommand
type UnwrappedModCDPEvent = types.UnwrappedModCDPEvent

var New = client.New
var NewCDPTypes = client.NewCDPTypes
var Bool = client.Bool
var NewLocalBrowserLauncher = launcher.NewLocalBrowserLauncher
var NewRemoteBrowserLauncher = launcher.NewRemoteBrowserLauncher
var NewBBBrowserLauncher = launcher.NewBBBrowserLauncher
var NewNoneBrowserLauncher = launcher.NewNoneBrowserLauncher
var ResolveCdpWebSocketUrl = launcher.WebsocketURLFor
var NewExtensionInjector = injector.NewExtensionInjector
var NewDiscoverExtensionInjector = injector.NewDiscoverExtensionInjector
var NewBBExtensionInjector = injector.NewBBExtensionInjector
var NewCLIExtensionInjector = injector.NewCLIExtensionInjector
var NewCDPExtensionInjector = injector.NewCDPExtensionInjector
var DefaultModCDPExtensionPath = injector.DefaultModCDPExtensionPath
var PrepareUnpackedExtension = injector.PrepareUnpackedExtension
var ExtensionIDFromManifestKey = injector.ExtensionIDFromManifestKey
var NewUpstreamTransport = transport.NewUpstreamTransport
var NewWSUpstreamTransport = transport.NewWSUpstreamTransport
var NewAutoSessionRouter = client.NewAutoSessionRouter
var ParseHostPort = transport.ParseHostPort
var WrapCommandIfNeeded = translate.WrapCommandIfNeeded
var UnwrapResponseIfNeeded = translate.UnwrapResponseIfNeeded
var UnwrapEventIfNeeded = translate.UnwrapEventIfNeeded
var EncodeBindingPayload = translate.EncodeBindingPayload

const UpstreamModeWS = transport.UpstreamModeWS
const DefaultModCDPExtensionID = injector.DefaultModCDPExtensionID

var DefaultModCDPServiceWorkerURLSuffixes = injector.DefaultModCDPServiceWorkerURLSuffixes
