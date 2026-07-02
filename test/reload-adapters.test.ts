import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config/loader.js";
import type { ReloadOperationContext } from "../src/reload/contract.js";
import { createDashboardReloadAdapter } from "../src/reload/adapters/dashboardAdapter.js";
import { createDnsReloadAdapter } from "../src/reload/adapters/dnsAdapter.js";
import { createFakeIpReloadAdapter } from "../src/reload/adapters/fakeIpAdapter.js";
import { createInboundReloadAdapter } from "../src/reload/adapters/inboundAdapter.js";
import { createMetricsReloadAdapter } from "../src/reload/adapters/metricsAdapter.js";
import { createOutboundReloadAdapter } from "../src/reload/adapters/outboundAdapter.js";
import { createPluginReloadAdapter } from "../src/reload/adapters/pluginAdapter.js";
import { createProberReloadAdapter } from "../src/reload/adapters/proberAdapter.js";
import { createRouterReloadAdapter } from "../src/reload/adapters/routerAdapter.js";
import { createUdpReloadAdapter } from "../src/reload/adapters/udpAdapter.js";

void test("prototype adapters honor the component contract without owning runtime resources", async () => {
  const config = await loadConfig("examples/sepigs.safe.json");
  const adapters = [
    createDnsReloadAdapter(),
    createRouterReloadAdapter(),
    createOutboundReloadAdapter(),
    createInboundReloadAdapter(),
    createDashboardReloadAdapter(),
    createMetricsReloadAdapter(),
    createPluginReloadAdapter(),
    createFakeIpReloadAdapter(),
    createUdpReloadAdapter(),
    createProberReloadAdapter()
  ];
  const context = reloadContext();

  assert.equal(new Set(adapters.map((adapter) => adapter.name)).size, adapters.length);
  for (const adapter of adapters) {
    const prepared = await adapter.prepare(config, context);
    assert.equal(prepared.value.prototypeOnly, true);
    assert.deepEqual(prepared.resources, []);
    await adapter.healthCheck(prepared);
    await adapter.commit(prepared);
    assert.equal(adapter.currentGeneration(), "shadow-candidate");
    await adapter.rollback(prepared, context);
    assert.equal(adapter.currentGeneration(), "shadow-current");
    await adapter.cleanup(prepared);
    assert.equal(prepared.value.released, true);
  }
});

const reloadContext = (): ReloadOperationContext => ({
  transactionId: "adapter-test",
  oldGenerationId: "shadow-current",
  candidateGenerationId: "shadow-candidate",
  deadline: Date.now() + 2_000,
  signal: new AbortController().signal
});
