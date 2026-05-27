# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/injector/ExtensionInjector.ts
# - ./js/src/injector/BBExtensionInjector.ts
# - ./js/src/injector/CDPExtensionInjector.ts
# - ./js/src/injector/CLIExtensionInjector.ts
# - ./js/src/injector/DiscoverExtensionInjector.ts
# - ./go/modcdp/injector/ExtensionInjector.go
# - ./go/modcdp/injector/BBExtensionInjector.go
# - ./go/modcdp/injector/CDPExtensionInjector.go
# - ./go/modcdp/injector/CLIExtensionInjector.go
# - ./go/modcdp/injector/DiscoverExtensionInjector.go
from .BBExtensionInjector import BBExtensionInjector
from .DiscoverExtensionInjector import DiscoverExtensionInjector
from .ExtensionInjector import ExtensionInjector
from .NodeExtensionFiles import PreparedExtension, defaultModCDPExtensionPath, extensionIdFromManifestKey, prepareUnpackedExtension
from .CDPExtensionInjector import CDPExtensionInjector
from .CLIExtensionInjector import CLIExtensionInjector
