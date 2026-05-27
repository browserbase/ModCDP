# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/transport/UpstreamTransport.ts
# - ./js/src/transport/WSUpstreamTransport.ts
# - ./go/modcdp/transport/UpstreamTransport.go
# - ./go/modcdp/transport/WSUpstreamTransport.go
from .UpstreamTransport import UpstreamTransport, UpstreamTransportConfig
from .WSUpstreamTransport import WSUpstreamTransport
