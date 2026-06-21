import assert from "node:assert/strict";
import test from "node:test";
import { encodeSocksUdpPacket, parseSocksUdpPacket } from "../src/inbound/socks5Udp.js";

void test("SOCKS5 UDP codec round-trips domains and rejects fragmentation", () => { const encoded = encodeSocksUdpPacket({ host: "dns.example", port: 53, addressType: "domain" }, Buffer.from("query")); const parsed = parseSocksUdpPacket(encoded); assert.equal(parsed.destination.host, "dns.example"); assert.equal(parsed.payload.toString(), "query"); const fragmented = Buffer.from(encoded); fragmented[2] = 1; assert.throws(() => parseSocksUdpPacket(fragmented), /fragmentation/u); });
