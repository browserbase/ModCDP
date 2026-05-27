// MODCDP_TS_ONLY_TEST: DO NOT TRANSLATE THIS TEST FILE TO OTHER LANGUAGES.
// PipeUpstreamTransport: TS-only pipe upstream transport coverage.
// If a translated sibling is added, all test cases, descriptions, covered edge cases, and setup must be kept perfectly 1:1 in sync.
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "vitest";

import { PipeUpstreamTransport } from "../src/transport/PipeUpstreamTransport.js";

test("pipe upstream constructor, update, launcher config, and unconnected errors match the transport surface", async () => {
  const transport = new PipeUpstreamTransport();
  assert.equal(transport.config.upstream_mode, "pipe");
  assert.equal(transport.update(), transport);
  await assert.rejects(() => transport.connect(), /upstream_mode=pipe requires/);
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
