import assert from "node:assert/strict";
import test from "node:test";
import { parseIpv4Packet } from "../src/tun/packet.js";

void test("TUN IPv4 parser classifies TCP and UDP packets", () => {
  for (const [number, expected] of [[6, "tcp"], [17, "udp"]] as const) { const packet = Buffer.alloc(24); packet[0] = 0x45; packet.writeUInt16BE(24, 2); packet[9] = number; packet.set([10,0,0,1], 12); packet.set([198,18,0,1], 16); assert.equal(parseIpv4Packet(packet).protocol, expected); }
});
