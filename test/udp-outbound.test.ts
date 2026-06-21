import assert from "node:assert/strict";
import test from "node:test";
import { BlockOutbound } from "../src/outbound/block.js";
import { UdpDirectSender } from "../src/outbound/udpDirect.js";
import { Logger } from "../src/logger/logger.js";
import { startUdpEchoServer } from "./helpers.js";

void test("UDP direct sender relays datagrams and block outbound rejects them", async () => { const echo = await startUdpEchoServer(); try { const response = await new UdpDirectSender(500, new Logger("silent")).send({ host: "127.0.0.1", port: echo.port, addressType: "ipv4" }, Buffer.from("udp-ok")); assert.equal(response?.toString(), "udp-ok"); const block = new BlockOutbound({ type: "block", tag: "block" }); await assert.rejects(block.sendUdp({ id: "1", inboundTag: "x", protocol: "socks5", network: "udp", destination: { host: "127.0.0.1", port: echo.port, addressType: "ipv4" }, startedAt: Date.now() }, Buffer.from("x")), /blocked/u); } finally { await echo.close(); } });
