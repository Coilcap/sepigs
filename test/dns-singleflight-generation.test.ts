import assert from "node:assert/strict";
import test from "node:test";
import { GenerationSingleFlight } from "../src/dns/singleFlight.js";

void test("same-generation duplicate DNS queries merge", async () => {
  const flight = new GenerationSingleFlight<string>("dns-0");
  let calls = 0;
  const operation = async () => {
    calls += 1;
    await Promise.resolve();
    return "192.0.2.1";
  };
  const [first, second] = await Promise.all([
    flight.run("A:same.test", operation),
    flight.run("A:same.test", operation)
  ]);
  assert.equal(first, "192.0.2.1");
  assert.equal(second, "192.0.2.1");
  assert.equal(calls, 1);
});

void test("cross-generation duplicate DNS queries do not merge", async () => {
  const old = new GenerationSingleFlight<string>("dns-old");
  const candidate = new GenerationSingleFlight<string>("dns-candidate");
  let calls = 0;
  const operation = () => {
    calls += 1;
    return Promise.resolve("192.0.2.2");
  };
  await Promise.all([
    old.run("A:same.test", operation),
    candidate.run("A:same.test", operation)
  ]);
  assert.equal(calls, 2);
});

void test("old and new generation completions retain their cache owner", async () => {
  const old = new GenerationSingleFlight<string>("dns-old");
  const candidate = new GenerationSingleFlight<string>("dns-candidate");
  const oldCache = new Map<string, string>();
  const candidateCache = new Map<string, string>();
  await Promise.all([
    old.run("A:owner.test", () => {
      oldCache.set("owner.test", "192.0.2.10");
      return Promise.resolve("192.0.2.10");
    }),
    candidate.run("A:owner.test", () => {
      candidateCache.set("owner.test", "192.0.2.20");
      return Promise.resolve("192.0.2.20");
    })
  ]);
  assert.equal(oldCache.get("owner.test"), "192.0.2.10");
  assert.equal(candidateCache.get("owner.test"), "192.0.2.20");
});

void test("old generation timeout does not poison a new generation", async () => {
  const old = new GenerationSingleFlight<string>("dns-old");
  const candidate = new GenerationSingleFlight<string>("dns-candidate");
  await assert.rejects(
    old.run(
      "A:timeout.test",
      async (signal) =>
        await new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new Error("old aborted"));
          }, { once: true });
        }),
      10
    ),
    /timeout|aborted/u
  );
  assert.equal(
    await candidate.run("A:timeout.test", () => Promise.resolve("192.0.2.30")),
    "192.0.2.30"
  );
});

void test("aborting old generation does not abort new generation", async () => {
  const old = new GenerationSingleFlight<string>("dns-old");
  const candidate = new GenerationSingleFlight<string>("dns-candidate");
  const oldPromise = old.run(
    "A:abort.test",
    async (signal) =>
      await new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new Error("old aborted"));
        }, { once: true });
      })
  );
  const newPromise = candidate.run(
    "A:abort.test",
    () => Promise.resolve("192.0.2.40")
  );
  old.abortAll();
  await assert.rejects(oldPromise, /aborted/u);
  assert.equal(await newPromise, "192.0.2.40");
});
