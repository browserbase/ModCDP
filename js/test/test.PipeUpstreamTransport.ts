import assert from "node:assert/strict";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { PipeUpstreamTransport } from "../src/transport/PipeUpstreamTransport.js";
import { ModCDPClient } from "../src/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, "..", "..", "dist", "extension");

test("pipe upstream constructor, update, launcher config, and unconnected errors match the transport surface", async () => {
  const transport = new PipeUpstreamTransport();
  assert.equal(transport.upstream_mode, "pipe");
  assert.equal(transport.upstream_ws_cdp_url, null);
  assert.equal(
    transport.update({
      upstream_ws_cdp_url: "ws://127.0.0.1:9222/devtools/browser/ignored",
    }),
    transport,
  );
  assert.equal(transport.upstream_ws_cdp_url, null);
  await assert.rejects(() => transport.connect(), /upstream\.upstream_mode=pipe requires/);
  assert.throws(() => transport.send({ id: 1, method: "Runtime.evaluate" }), /CDP pipe is not connected/);
});

test("pipe upstream resets connection state after pipe end and errors", async () => {
  for (const event_name of ["end", "read_error", "write_error"] as const) {
    const pipe_read = new PassThrough();
    const pipe_write = new PassThrough();
    const transport = new PipeUpstreamTransport({
      upstream_pipe_read: pipe_read,
      upstream_pipe_write: pipe_write,
    });
    const closed: Error[] = [];
    transport.onClose((error) => closed.push(error));

    await transport.connect();
    transport.send({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression: "1" },
    });

    if (event_name === "end") pipe_read.emit("end");
    else if (event_name === "read_error") pipe_read.emit("error", new Error("read failed"));
    else pipe_write.emit("error", new Error("write failed"));

    assert.equal(closed.length, 1);
    assert.throws(
      () =>
        transport.send({
          id: 2,
          method: "Runtime.evaluate",
          params: { expression: "1" },
        }),
      /CDP pipe is not connected/,
    );
    await transport.close();
  }
});

test("pipe upstream launches a real browser without a CDP URL", async () => {
  const cdp = new ModCDPClient({
    launcher: {
      launcher_mode: "local",
      launcher_local_headless: true,
    },
    upstream: { upstream_mode: "pipe" },
    injector: {
      injector_mode: "cli",
      injector_cli_extension_path: EXTENSION_PATH,
      injector_service_worker_url_suffixes: ["/modcdp/service_worker.js"],
      injector_trust_service_worker_target: true,
    },
    server_options: { router: { router_routes: { "*.*": "chromedebugger" } } },
  });

  try {
    await cdp.connect();
    assert.equal(cdp.upstream?.upstream_mode, "pipe");
    assert.equal(cdp.upstream.upstream_ws_cdp_url, null);
    assert.equal(cdp.upstream?.upstream_ws_cdp_url, null);
    await cdp.Mod.addCustomCommand("Custom.runtimeReadyState", {
      expression:
        "async () => await upstream.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true })",
    });
    const runtime = (await cdp.send("Custom.runtimeReadyState")) as {
      result?: { value?: unknown };
    };
    assert.equal(runtime.result?.value, "complete");
  } finally {
    await cdp.close();
  }
}, 60_000);
