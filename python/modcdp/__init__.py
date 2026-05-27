# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/index.ts
# - ./go/modcdp/modcdp.go
from .router.AutoSessionRouter import AutoSessionRouter
from .injector.BBExtensionInjector import BBExtensionInjector
from .launcher.BBBrowserLauncher import BBBrowserLauncher
from .launcher.BrowserLauncher import BrowserLauncher, resolveCdpWebSocketUrl
from .injector.DiscoverExtensionInjector import DiscoverExtensionInjector
from .injector.ExtensionInjector import ExtensionInjector, DEFAULT_MODCDP_EXTENSION_ID, DEFAULT_MODCDP_SERVICE_WORKER_URL_SUFFIXES
from .injector.NodeExtensionFiles import PreparedExtension, defaultModCDPExtensionPath, extensionIdFromManifestKey, prepareUnpackedExtension
from .injector.CDPExtensionInjector import CDPExtensionInjector
from .injector.CLIExtensionInjector import CLIExtensionInjector
from .launcher.LocalBrowserLauncher import LocalBrowserLauncher
from .client.ModCDPClient import ModCDPClient
from .types.CDPTypes import CDPTypes
from .launcher.NoneBrowserLauncher import NoneBrowserLauncher
from .launcher.RemoteBrowserLauncher import RemoteBrowserLauncher
from .transport.UpstreamTransport import UpstreamTransport
from .transport.WSUpstreamTransport import WSUpstreamTransport
from .translate.translate import wrap_command_if_needed, unwrap_response_if_needed, unwrap_event_if_needed, encode_binding_payload
from .types.generated.cdp import CDPEvent, CDPModel, CDPParams

__all__ = [
    "AutoSessionRouter",
    "BBExtensionInjector",
    "BBBrowserLauncher",
    "BrowserLauncher",
    "resolveCdpWebSocketUrl",
    "DiscoverExtensionInjector",
    "ExtensionInjector",
    "DEFAULT_MODCDP_EXTENSION_ID",
    "DEFAULT_MODCDP_SERVICE_WORKER_URL_SUFFIXES",
    "PreparedExtension",
    "defaultModCDPExtensionPath",
    "extensionIdFromManifestKey",
    "prepareUnpackedExtension",
    "CDPExtensionInjector",
    "CLIExtensionInjector",
    "LocalBrowserLauncher",
    "ModCDPClient",
    "CDPTypes",
    "NoneBrowserLauncher",
    "RemoteBrowserLauncher",
    "UpstreamTransport",
    "WSUpstreamTransport",
    "wrap_command_if_needed",
    "unwrap_response_if_needed",
    "unwrap_event_if_needed",
    "encode_binding_payload",
    "CDPEvent",
    "CDPModel",
    "CDPParams",
]
