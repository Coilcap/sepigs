import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FakeIpService } from "../src/dns/fakeIp.js";

void test("fake-IP persistence restores bidirectional mappings without secrets", async () => { const dir = await mkdtemp(join(tmpdir(), "sepigs-fake-ip-")); const path = join(dir, "state.json"); const config = { enabled: true, range: "198.18.0.0/29", size: 4, ttlSeconds: 60, persistPath: path } as const; const first = new FakeIpService(config); const address = first.assign("persist.test"); const second = new FakeIpService(config); assert.equal(second.assign("persist.test"), address); assert.equal(second.reverse(address), "persist.test"); assert.doesNotMatch(await readFile(path, "utf8"), /password|token/iu); });
