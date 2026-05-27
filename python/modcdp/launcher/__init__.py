# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/launcher/BrowserLauncher.ts
# - ./js/src/launcher/LocalBrowserLauncher.ts
# - ./js/src/launcher/RemoteBrowserLauncher.ts
# - ./js/src/launcher/BBBrowserLauncher.ts
# - ./js/src/launcher/NoneBrowserLauncher.ts
# - ./go/modcdp/launcher/BrowserLauncher.go
# - ./go/modcdp/launcher/LocalBrowserLauncher.go
# - ./go/modcdp/launcher/RemoteBrowserLauncher.go
# - ./go/modcdp/launcher/BBBrowserLauncher.go
# - ./go/modcdp/launcher/NoneBrowserLauncher.go
from .BrowserLauncher import BrowserLauncher
from .BBBrowserLauncher import BBBrowserLauncher
from .LocalBrowserLauncher import LocalBrowserLauncher
from .NoneBrowserLauncher import NoneBrowserLauncher
from .RemoteBrowserLauncher import RemoteBrowserLauncher
