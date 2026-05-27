// Extension service worker entry point.

import { ModCDPServer } from "../../js/src/server/ModCDPServer.js";

const server = new ModCDPServer();
void server.start();
