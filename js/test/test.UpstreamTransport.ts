// MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
// - ./python/tests/test_UpstreamTransport.py
// - ./go/modcdp/transport/UpstreamTransport_test.go
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import { describe, expect, it } from "vitest";

import { UpstreamTransport, parseHostPort } from "../src/transport/UpstreamTransport.js";

describe("UpstreamTransport", () => {
  it("owns shared transport config and recv callbacks", async () => {
    const transport = new UpstreamTransport();
    const received: unknown[] = [];
    const stop = transport.onRecv((message) => received.push(message));

    expect(parseHostPort("127.0.0.1:29292", "0.0.0.0", 80)).toEqual({ host: "127.0.0.1", port: 29292 });
    expect(transport.update()).toBe(transport);

    class TestTransport extends UpstreamTransport {
      emit(value: unknown) {
        this.parseAndEmitRecv(value);
      }
    }
    const test_transport = new TestTransport();
    const parsed: unknown[] = [];
    test_transport.onRecv((message) => parsed.push(message));
    test_transport.emit(JSON.stringify({ id: 1, result: { ok: true } }));
    test_transport.emit(JSON.stringify({ id: 2, result: true }));
    test_transport.emit(JSON.stringify({ id: 3, result: 0 }));
    test_transport.emit(JSON.stringify({ method: "Runtime.executionContextCreated", params: {} }));
    expect(parsed).toEqual([
      { id: 1, result: { ok: true } },
      { id: 2, result: true },
      { id: 3, result: 0 },
      { method: "Runtime.executionContextCreated", params: {} },
    ]);

    stop();
    expect(received).toEqual([]);
    await expect(transport.connect()).rejects.toThrow("UpstreamTransport.connect is not implemented.");
    expect(() => transport.send({ id: 1, method: "Browser.getVersion", params: {} })).toThrow(
      "UpstreamTransport.send is not implemented.",
    );
  });
});
