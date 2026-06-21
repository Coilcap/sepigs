import assert from "node:assert/strict";
import test from "node:test";
import { MockTunDevice } from "../src/tun/device.js";

void test("mock TUN device supports deterministic packet IO", async () => { const tun = new MockTunDevice(); const pending = tun.read(); tun.inject(Buffer.from([1,2,3])); assert.deepEqual(await pending, Buffer.from([1,2,3])); await tun.write(Buffer.from([4])); assert.deepEqual(tun.written[0], Buffer.from([4])); await tun.close(); });
