package modcdp

import (
	"github.com/browserbase/modcdp/go/modcdp/client"
	"github.com/browserbase/modcdp/go/modcdp/injector"
	"github.com/browserbase/modcdp/go/modcdp/launcher"
	"github.com/browserbase/modcdp/go/modcdp/transport"
)

type ModCDPClient = client.ModCDPClient
type Options = client.Options
type LaunchOptions = client.LaunchOptions
type ClientOptions = client.ClientOptions
type ServerConfig = client.ServerConfig
type RouterOptions = client.RouterOptions
type DownstreamOptions = client.DownstreamOptions
type CustomCommand = client.CustomCommand
type CustomEvent = client.CustomEvent
type CustomMiddleware = client.CustomMiddleware
type CDPEvent = client.CDPEvent
type LaunchOptions = launcher.LaunchOptions
type LaunchedBrowser = launcher.LaunchedBrowser
type BrowserLauncher = launcher.BrowserLauncher
type LocalBrowserLauncher = launcher.LocalBrowserLauncher
type RemoteBrowserLauncher = launcher.RemoteBrowserLauncher
type BBBrowserLauncher = launcher.BBBrowserLauncher
type NoneBrowserLauncher = launcher.NoneBrowserLauncher
type InjectorOptions = client.InjectorOptions
type ExtensionInjectionResult = client.ExtensionInjectionResult
type ExtensionInjector = injector.ExtensionInjector
type DiscoverExtensionInjector = injector.DiscoverExtensionInjector
type BBExtensionInjector = injector.BBExtensionInjector
type CLIExtensionInjector = injector.CLIExtensionInjector
type CDPExtensionInjector = injector.CDPExtensionInjector
type BorrowExtensionInjector = injector.BorrowExtensionInjector
type UpstreamMode = transport.UpstreamMode
type UpstreamTransportOptions = transport.UpstreamTransportOptions
type UpstreamTransport = transport.UpstreamTransport
type WSUpstreamTransport = transport.WSUpstreamTransport
type PipeUpstreamTransport = transport.PipeUpstreamTransport
type ReverseWSUpstreamTransport = transport.ReverseWSUpstreamTransport
type NativeMessagingUpstreamTransport = transport.NativeMessagingUpstreamTransport
type NATSUpstreamTransport = transport.NATSUpstreamTransport
type AutoSessionRouter = client.AutoSessionRouter

var New = client.New
var Bool = client.Bool
var NewLocalBrowserLauncher = launcher.NewLocalBrowserLauncher
var NewRemoteBrowserLauncher = launcher.NewRemoteBrowserLauncher
var NewBBBrowserLauncher = launcher.NewBBBrowserLauncher
var NewNoneBrowserLauncher = launcher.NewNoneBrowserLauncher
var NewExtensionInjector = injector.NewExtensionInjector
var NewDiscoverExtensionInjector = injector.NewDiscoverExtensionInjector
var NewBBExtensionInjector = injector.NewBBExtensionInjector
var NewCLIExtensionInjector = injector.NewCLIExtensionInjector
var NewCDPExtensionInjector = injector.NewCDPExtensionInjector
var NewBorrowExtensionInjector = injector.NewBorrowExtensionInjector
var NewUpstreamTransport = transport.NewUpstreamTransport
var NewWSUpstreamTransport = transport.NewWSUpstreamTransport
var NewPipeUpstreamTransport = transport.NewPipeUpstreamTransport
var NewReverseWSUpstreamTransport = transport.NewReverseWSUpstreamTransport
var NewNativeMessagingUpstreamTransport = transport.NewNativeMessagingUpstreamTransport
var NewNATSUpstreamTransport = transport.NewNATSUpstreamTransport
var NewAutoSessionRouter = client.NewAutoSessionRouter

const UpstreamModeWS = transport.UpstreamModeWS
const UpstreamModePipe = transport.UpstreamModePipe
const UpstreamModeNativeMessaging = transport.UpstreamModeNativeMessaging
const UpstreamModeReverseWS = transport.UpstreamModeReverseWS
const UpstreamModeNATS = transport.UpstreamModeNATS
const UpstreamModeChromeDebugger = transport.UpstreamModeChromeDebugger
const DefaultModCDPExtensionID = injector.DefaultModCDPExtensionID
const DefaultUpstreamReverseWSBind = transport.DefaultUpstreamReverseWSBind
const DefaultUpstreamReverseWSWaitTimeoutMS = transport.DefaultUpstreamReverseWSWaitTimeoutMS
const DefaultUpstreamNATSWaitTimeoutMS = transport.DefaultUpstreamNATSWaitTimeoutMS

var DefaultModCDPServiceWorkerURLSuffixes = injector.DefaultModCDPServiceWorkerURLSuffixes
