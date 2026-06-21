import assert from "node:assert/strict";
import test from "node:test";
import { ExperimentalQuicTransport } from "../src/transport/quicExperimental.js";
import { MockQuicAdapter, MissingDependencyQuicAdapter } from "../src/transport/quicAdapter.js";

const destination = { host: "localhost", port: 443, addressType: "domain" as const };
void test("experimental QUIC requires opt-in and an available adapter", async () => { await assert.rejects(new ExperimentalQuicTransport(false, new MockQuicAdapter()).connect({ destination }), /disabled/u); await assert.rejects(new ExperimentalQuicTransport(true, new MissingDependencyQuicAdapter()).connect({ destination }), /missing/u); const transport = new ExperimentalQuicTransport(true, new MockQuicAdapter()); assert.equal((await transport.connect({ destination })).protocol, "mock-quic"); await transport.close(); });
