import assert from "node:assert/strict";
import test from "node:test";
import { detectWireGuardCapability } from "../src/wireguard/capability.js";
import { validateWireGuardPrototypeConfig } from "../src/wireguard/config.js";

void test("WireGuard prototype validates config and reports missing runtime", async () => { assert.throws(() => { validateWireGuardPrototypeConfig({ type: "wireguard", tag: "wg", privateKey: "bad", address: [], peer: { publicKey: "bad", endpointHost: "localhost", endpointPort: 51820, allowedIps: [] } }); }, /keys/u); const capability = await detectWireGuardCapability(["/definitely/missing/wg"]); assert.equal(capability.available, false); });
