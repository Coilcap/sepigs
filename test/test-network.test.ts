import assert from "node:assert/strict";
import test from "node:test";
import { readTestNetworkConfig } from "../src/utils/testNetwork.js";

void test("test network config defaults to IPv4 loopback and an ephemeral port", () => {
  assert.deepEqual(readTestNetworkConfig({}), { host: "127.0.0.1", port: 0, disableIpv6: false });
});

void test("test network config disables IPv6 and rejects public binds", () => {
  assert.deepEqual(readTestNetworkConfig({ SEPIGS_TEST_HOST: "::1", SEPIGS_TEST_PORT: "0", SEPIGS_DISABLE_IPV6: "1" }), {
    host: "127.0.0.1", port: 0, disableIpv6: true
  });
  assert.throws(() => readTestNetworkConfig({ SEPIGS_TEST_HOST: "0.0.0.0" }), /loopback/u);
});
