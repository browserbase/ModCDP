// MODCDP_TS_ONLY_TEST: DO NOT TRANSLATE THIS TEST FILE TO OTHER LANGUAGES.
// ReverseWSUpstreamTransport: TS-only reverse websocket upstream transport coverage.
// If a translated sibling is added, all test cases, descriptions, covered edge cases, and setup must be kept perfectly 1:1 in sync.
// NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
// USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
import assert from "node:assert/strict";
import { once } from "node:events";
import WebSocket from "ws";
import { test } from "vitest";

import { LocalBrowserLauncher } from "../src/launcher/LocalBrowserLauncher.js";
import { ReverseWSUpstreamTransport } from "../src/transport/ReverseWSUpstreamTransport.js";

test("reversews client transport config owns bind updates and wait timeout", async () => {
  const transport = new ReverseWSUpstreamTransport({
    upstream_reversews_bind: "127.0.0.1:29292",
    upstream_reversews_wait_timeout_ms: 10,
  });
  assert.equal(transport.endpoint_url, "ws://127.0.0.1:29292");
  assert.equal(
    transport.update({
      upstream_reversews_bind: "127.0.0.1:29293",
      upstream_reversews_wait_timeout_ms: 5,
    }),
    transport,
  );
  assert.equal(transport.endpoint_url, "ws://127.0.0.1:29293");
  assert.throws(
    () => transport.send({ id: 1, method: "Browser.getVersion" }),
    /No reverse ModCDP extension peer is connected/,
  );
  await assert.rejects(() => transport.waitForPeer(), /Timed out waiting 5ms/);
});

test("reversews client transport close rejects pending peer waits", async () => {
  const reverse_port = await LocalBrowserLauncher.freePort();
  const transport = new ReverseWSUpstreamTransport({
    upstream_reversews_bind: `127.0.0.1:${reverse_port}`,
    upstream_reversews_wait_timeout_ms: 5_000,
  });
  const pending = transport.waitForPeer();

  await transport.close();

  await assert.rejects(
    () => pending,
    new RegExp(`Reverse websocket transport at ws://127\\.0\\.0\\.1:${reverse_port} closed before a peer connected`),
  );
});

test("reversews client transport close resets peer wait state", async () => {
  const reverse_port = await LocalBrowserLauncher.freePort();
  const transport = new ReverseWSUpstreamTransport({
    upstream_reversews_bind: `127.0.0.1:${reverse_port}`,
    upstream_reversews_wait_timeout_ms: 5,
  });
  await transport.connect();
  const peer = new WebSocket(transport.endpoint_url);
  await once(peer, "open");
  peer.send(JSON.stringify({ type: "modcdp.reverse.hello", role: "test-peer", version: 1 }));

  try {
    await transport.waitForPeer();
    assert.deepEqual(transport.peer_info, { type: "modcdp.reverse.hello", role: "test-peer", version: 1 });
    await transport.close();

    await assert.rejects(() => transport.waitForPeer(), /Timed out waiting 5ms/);
    assert.equal(transport.peer_info, null);
  } finally {
    peer.close();
    await transport.close();
  }
});

test("reversews client transport waits again after a peer disconnects", async () => {
  const reverse_port = await LocalBrowserLauncher.freePort();
  const transport = new ReverseWSUpstreamTransport({
    upstream_reversews_bind: `127.0.0.1:${reverse_port}`,
    upstream_reversews_wait_timeout_ms: 5,
  });
  await transport.connect();
  const peer = new WebSocket(transport.endpoint_url);
  await once(peer, "open");
  peer.send(JSON.stringify({ type: "modcdp.reverse.hello", role: "test-peer", version: 1 }));

  try {
    await transport.waitForPeer();
    peer.close();
    await waitFor(() => (transport as unknown as { socket: unknown | null }).socket === null);

    await assert.rejects(() => transport.waitForPeer(), /Timed out waiting 5ms/);
  } finally {
    peer.close();
    await transport.close();
  }
});

test("reversews client transport accepts a replacement peer after disconnect", async () => {
  const reverse_port = await LocalBrowserLauncher.freePort();
  const transport = new ReverseWSUpstreamTransport({
    upstream_reversews_bind: `127.0.0.1:${reverse_port}`,
    upstream_reversews_wait_timeout_ms: 500,
  });
  await transport.connect();
  const first_peer = new WebSocket(transport.endpoint_url);
  await once(first_peer, "open");
  first_peer.send(JSON.stringify({ type: "modcdp.reverse.hello", role: "first-peer", version: 1 }));

  try {
    await transport.waitForPeer();
    first_peer.close();
    await waitFor(() => (transport as unknown as { socket: unknown | null }).socket === null);

    const second_peer = new WebSocket(transport.endpoint_url);
    await once(second_peer, "open");
    second_peer.send(JSON.stringify({ type: "modcdp.reverse.hello", role: "second-peer", version: 1 }));
    try {
      await transport.waitForPeer();
      assert.equal(transport.peer_info?.role, "second-peer");
    } finally {
      second_peer.close();
    }
  } finally {
    first_peer.close();
    await transport.close();
  }
});

async function waitFor(predicate: () => boolean, timeout_ms = 2_000) {
  const deadline = Date.now() + timeout_ms;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for condition");
}
