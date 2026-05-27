# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/index.ts
# - ./go/modcdp/modcdp.go
from .router.AutoSessionRouter import AutoSessionRouter
from .injector.BBExtensionInjector import BBExtensionInjector
from .injector.BorrowExtensionInjector import BorrowExtensionInjector
from .launcher.BBBrowserLauncher import BBBrowserLauncher
from .launcher.BrowserLauncher import BrowserLauncher
from .injector.DiscoverExtensionInjector import DiscoverExtensionInjector
from .injector.ExtensionInjector import ExtensionInjector, defaultModCDPExtensionPath
from .injector.CDPExtensionInjector import CDPExtensionInjector
from .injector.CLIExtensionInjector import CLIExtensionInjector
from .launcher.LocalBrowserLauncher import LocalBrowserLauncher
from .client.ModCDPClient import ModCDPClient
from .types.CDPTypes import CDPTypes
from .launcher.NoneBrowserLauncher import NoneBrowserLauncher
from .launcher.RemoteBrowserLauncher import RemoteBrowserLauncher
from .transport.UpstreamTransport import UpstreamTransport, parseHostPort
from .transport.WSUpstreamTransport import WSUpstreamTransport
from .types.generated.cdp import CDPEvent, CDPModel, CDPParams

__all__ = [
    "AutoSessionRouter",
    "BBExtensionInjector",
    "BorrowExtensionInjector",
    "BBBrowserLauncher",
    "BrowserLauncher",
    "DiscoverExtensionInjector",
    "ExtensionInjector",
    "defaultModCDPExtensionPath",
    "CDPExtensionInjector",
    "CLIExtensionInjector",
    "LocalBrowserLauncher",
    "ModCDPClient",
    "CDPTypes",
    "NoneBrowserLauncher",
    "RemoteBrowserLauncher",
    "UpstreamTransport",
    "parseHostPort",
    "WSUpstreamTransport",
    "CDPEvent",
    "CDPModel",
    "CDPParams",
]
