// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/index.ts
// - ./python/modcdp/__init__.py
package modcdp

import (
	"github.com/browserbase/modcdp/go/modcdp/client"
	"github.com/browserbase/modcdp/go/modcdp/injector"
	"github.com/browserbase/modcdp/go/modcdp/launcher"
	"github.com/browserbase/modcdp/go/modcdp/transport"
)

type ModCDPClient = client.ModCDPClient
type Config = client.Config
type LaunchOptions = client.LaunchOptions
type ClientConfig = client.ClientConfig
type ServerConfig = client.ServerConfig
type RouterOptions = client.RouterOptions
type DownstreamOptions = client.DownstreamOptions
type CustomCommand = client.CustomCommand
type CustomEvent = client.CustomEvent
type CustomMiddleware = client.CustomMiddleware
type CDPTypes = client.CDPTypes
type CDPEvent = client.CDPEvent
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
type AutoSessionRouter = client.AutoSessionRouter

var New = client.New
var NewCDPTypes = client.NewCDPTypes
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
var NewAutoSessionRouter = client.NewAutoSessionRouter

const UpstreamModeWS = transport.UpstreamModeWS
const DefaultModCDPExtensionID = injector.DefaultModCDPExtensionID

var DefaultModCDPServiceWorkerURLSuffixes = injector.DefaultModCDPServiceWorkerURLSuffixes
