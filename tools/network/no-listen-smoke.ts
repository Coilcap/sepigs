import assert from "node:assert/strict";
import { parseConfig } from "../../src/config/schema.js";
import { FakeIpService } from "../../src/dns/fakeIp.js";
import { renderPrometheusMetrics } from "../../src/observability/metrics.js";
import { parseSubscription } from "../../src/subscription/parser.js";
import { BufferQueue } from "../../src/utils/bufferQueue.js";

const config = parseConfig({
  inbounds: [{ type: "http", tag: "http", listen: "127.0.0.1", port: 0 }],
  outbounds: [{ type: "direct", tag: "direct" }],
  route: { defaultOutbound: "direct", rules: [] }
});
assert.equal(config.dashboard.enabled, false);

const fakeIp = new FakeIpService({ enabled: true, range: "198.18.0.0/24", size: 8, ttlSeconds: 60 });
const address = fakeIp.assign("smoke.test");
assert.equal(fakeIp.reverse(address), "smoke.test");

const subscription = parseSubscription(`ss://${Buffer.from("aes-128-gcm:secret@127.0.0.1:8388").toString("base64url")}#smoke`);
assert.equal(subscription.outbounds.length, 1);

const queue = new BufferQueue();
queue.push(Buffer.from("sep"));
queue.push(Buffer.from("igs"));
assert.equal(queue.read(6).toString(), "sepigs");

const metrics = renderPrometheusMetrics({
  stats: {
    activeConnections: 0, totalConnections: 0, failedConnections: 0, closedConnections: 0, rejectedConnections: 0,
    bytesClientToRemote: 0, bytesRemoteToClient: 0, totalBytes: 0, averageConnectionDurationMs: 0, failureRate: 0,
    uptimeMs: 0, udpPacketsClientToRemote: 0, udpPacketsRemoteToClient: 0, udpBytesClientToRemote: 0,
    udpBytesRemoteToClient: 0, routeMatchesTotal: 0, outboundFailuresTotal: 0, dnsQueriesTotal: 0, dnsFailuresTotal: 0,
    hotReloadTotal: 0, hotReloadFailuresTotal: 0
  },
  leaks: { activeSockets: 0, activeTimers: 0, activeListeners: 0, trackedEmitters: 0, warnings: [] },
  eventLoop: { maxMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 },
  gc: { count: 0, totalDurationMs: 0, maxDurationMs: 0 },
  memory: process.memoryUsage()
});
assert.match(metrics, /sepigs_udp_sessions_active/u);
console.log("no-listen fallback smoke passed; this does not validate sockets, throughput, latency, or soak stability");
