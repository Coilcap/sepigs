import assert from "node:assert/strict";
import test from "node:test";
import { ReloadEventLog } from "../src/reload/events.js";

void test("reload events are ordered, JSON serializable, bounded, and redacted", () => {
  const log = new ReloadEventLog();
  log.append({
    type: "transaction.started",
    transactionId: "reload-1",
    generationId: "generation-2"
  }, 1);
  log.append({
    type: "component.prepare.failed",
    transactionId: "reload-1",
    generationId: "generation-2",
    component: "dns",
    phase: "prepare",
    message: `password=do-not-retain ${"x".repeat(700)}`
  }, 2);

  const events = log.snapshot();
  assert.equal(events.length, 2);
  assert.equal(events[0]?.timestamp, new Date(1).toISOString());
  assert.equal(events[1]?.timestamp, new Date(2).toISOString());
  assert.match(events[1].message ?? "", /password=<redacted>/u);
  assert.doesNotMatch(JSON.stringify(events), /do-not-retain/u);
  assert.ok((events[1].message?.length ?? 0) <= 512);
  assert.doesNotThrow(() => JSON.stringify(events));
});
