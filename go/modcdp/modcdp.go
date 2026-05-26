package modcdp

import (
	"github.com/browserbase/modcdp/go/modcdp/client"
	"github.com/browserbase/modcdp/go/modcdp/injector"
	"github.com/browserbase/modcdp/go/modcdp/launcher"
	"github.com/browserbase/modcdp/go/modcdp/transport"
)

type ModCDPClient = client.ModCDPClient
type Options = client.Options
type LauncherConfig = client.LauncherConfig
type UpstreamConfig = client.UpstreamConfig
type InjectorConfig = client.InjectorConfig
type ClientConfig = client.ClientConfig
type ServerConfig = client.ServerConfig
type CustomCommand = client.CustomCommand
type CustomEvent = client.CustomEvent
type CustomMiddleware = client.CustomMiddleware
type CDPEvent = client.CDPEvent
type LaunchOptions = launcher.LaunchOptions
type LaunchedBrowser = launcher.LaunchedBrowser
type BrowserLauncher = launcher.BrowserLauncher
type LocalBrowserLauncher = launcher.LocalBrowserLauncher
type RemoteBrowserLauncher = launcher.RemoteBrowserLauncher
type BrowserbaseBrowserLauncher = launcher.BrowserbaseBrowserLauncher
type NoopBrowserLauncher = launcher.NoopBrowserLauncher
type ExtensionInjectorConfig = client.ExtensionInjectorConfig
type ExtensionInjectionResult = client.ExtensionInjectionResult
type ExtensionInjector = injector.ExtensionInjector
type DiscoveredExtensionInjector = injector.DiscoveredExtensionInjector
type BBBrowserExtensionInjector = injector.BBBrowserExtensionInjector
type LocalBrowserLaunchExtensionInjector = injector.LocalBrowserLaunchExtensionInjector
type ExtensionsLoadUnpackedInjector = injector.ExtensionsLoadUnpackedInjector
type BorrowedExtensionInjector = injector.BorrowedExtensionInjector
type UpstreamMode = transport.UpstreamMode
type UpstreamTransport = transport.UpstreamTransport
type WebSocketUpstreamTransport = transport.WebSocketUpstreamTransport
type WebSocketUpstreamTransportOptions = transport.WebSocketUpstreamTransportOptions
type PipeUpstreamTransport = transport.PipeUpstreamTransport
type PipeUpstreamTransportOptions = transport.PipeUpstreamTransportOptions
type ReverseWebSocketUpstreamTransport = transport.ReverseWebSocketUpstreamTransport
type ReverseWebSocketUpstreamTransportOptions = transport.ReverseWebSocketUpstreamTransportOptions
type NativeMessagingUpstreamTransport = transport.NativeMessagingUpstreamTransport
type NativeMessagingUpstreamTransportOptions = transport.NativeMessagingUpstreamTransportOptions
type NatsUpstreamUpstreamTransport = transport.NatsUpstreamUpstreamTransport
type NatsUpstreamUpstreamTransportOptions = transport.NatsUpstreamUpstreamTransportOptions
type AutoSessionRouter = client.AutoSessionRouter

var New = client.New
var Bool = client.Bool
var NewLocalBrowserLauncher = launcher.NewLocalBrowserLauncher
var NewRemoteBrowserLauncher = launcher.NewRemoteBrowserLauncher
var NewBrowserbaseBrowserLauncher = launcher.NewBrowserbaseBrowserLauncher
var NewNoopBrowserLauncher = launcher.NewNoopBrowserLauncher
var NewExtensionInjector = injector.NewExtensionInjector
var NewDiscoveredExtensionInjector = injector.NewDiscoveredExtensionInjector
var NewBBBrowserExtensionInjector = injector.NewBBBrowserExtensionInjector
var NewLocalBrowserLaunchExtensionInjector = injector.NewLocalBrowserLaunchExtensionInjector
var NewExtensionsLoadUnpackedInjector = injector.NewExtensionsLoadUnpackedInjector
var NewBorrowedExtensionInjector = injector.NewBorrowedExtensionInjector
var NewWebSocketUpstreamTransport = transport.NewWebSocketUpstreamTransport
var NewPipeUpstreamTransport = transport.NewPipeUpstreamTransport
var NewReverseWebSocketUpstreamTransport = transport.NewReverseWebSocketUpstreamTransport
var NewNativeMessagingUpstreamTransport = transport.NewNativeMessagingUpstreamTransport
var NewNatsUpstreamUpstreamTransport = transport.NewNatsUpstreamUpstreamTransport
var NewAutoSessionRouter = client.NewAutoSessionRouter

const UpstreamModeWS = transport.UpstreamModeWS
const UpstreamModePipe = transport.UpstreamModePipe
const UpstreamModeNativeMessaging = transport.UpstreamModeNativeMessaging
const UpstreamModeReverseWS = transport.UpstreamModeReverseWS
const UpstreamModeNATS = transport.UpstreamModeNATS
const DefaultModCDPExtensionID = injector.DefaultModCDPExtensionID
const DefaultUpstreamReverseWSBind = transport.DefaultUpstreamReverseWSBind
const DefaultUpstreamReverseWSWaitTimeoutMS = transport.DefaultUpstreamReverseWSWaitTimeoutMS
const DefaultUpstreamNATSWaitTimeoutMS = transport.DefaultUpstreamNATSWaitTimeoutMS

var DefaultModCDPServiceWorkerURLSuffixes = injector.DefaultModCDPServiceWorkerURLSuffixes
