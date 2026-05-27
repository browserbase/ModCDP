// MODCDP_TS_ONLY: DO NOT TRANSLATE THIS FILE TO OTHER LANGUAGES.
// Reason: only runs in browser.
// Extension service worker entry point.

import { ModCDPServer } from "../../js/src/server/ModCDPServer.js";

const server = new ModCDPServer();
void server.start();
