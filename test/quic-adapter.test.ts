import assert from "node:assert/strict";
import test from "node:test";
import { makeDestination } from "../src/utils/net.js";
import { MissingDependencyQuicAdapter, MockQuicAdapter, QuicAdapterRegistry } from "../src/transport/quicAdapter.js";

void test("MissingDependencyQuicAdapter reports a clear unsupported error", async () => {
  const adapter = new MissingDependencyQuicAdapter();
  await assert.rejects(async () => await adapter.connect({ destination: makeDestination("example.com", 443) }), /dependency is missing/u);
});

void test("QuicAdapterRegistry can swap in a mock adapter", async () => {
  const registry = new QuicAdapterRegistry();
  registry.register(new MockQuicAdapter());
  const connection = await registry.current().connect({ destination: makeDestination("example.com", 443), alpnProtocols: ["h3"] });
  assert.equal(connection.protocol, "mock-quic");
  connection.stream.destroy();
});
