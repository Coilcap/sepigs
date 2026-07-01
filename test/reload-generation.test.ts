import assert from "node:assert/strict";
import test from "node:test";
import { createReloadGeneration, ReloadTransactionModel } from "../src/reload/generation.js";

const oldGeneration = createReloadGeneration({
  id: "generation-1",
  createdAt: 1,
  configHash: "old",
  state: "active"
});

const candidateGeneration = createReloadGeneration({
  id: "generation-2",
  createdAt: 2,
  configHash: "candidate",
  parentGenerationId: oldGeneration.id
});

void test("reload transaction state machine commits through every required stage", () => {
  const transaction = new ReloadTransactionModel("reload-1", oldGeneration, candidateGeneration, 10);
  for (const state of ["parsing", "validating", "preparing", "prepared", "committing", "committed"] as const) {
    transaction.transition(state, 20);
  }
  const snapshot = transaction.snapshot();
  assert.equal(snapshot.state, "committed");
  assert.equal(snapshot.completedAt, 20);
  assert.equal(snapshot.candidateGeneration.parentGenerationId, oldGeneration.id);
});

void test("reload transaction failure after prepare enters rollback and records reason", () => {
  const transaction = new ReloadTransactionModel("reload-2", oldGeneration, candidateGeneration, 10);
  transaction.transition("parsing");
  transaction.transition("validating");
  transaction.transition("preparing");
  const failed = transaction.fail("inbound bind conflict");
  assert.equal(failed.state, "rolling-back");
  assert.equal(failed.failureReason, "inbound bind conflict");
  const rolledBack = transaction.transition("rolled-back", 30);
  assert.equal(rolledBack.state, "rolled-back");
  assert.equal(rolledBack.completedAt, 30);
});

void test("reload transaction rejects invalid and terminal transitions", () => {
  const transaction = new ReloadTransactionModel("reload-3", oldGeneration, candidateGeneration);
  assert.throws(() => transaction.transition("committed"), /invalid reload transaction transition/u);
  transaction.transition("parsing");
  transaction.fail("parse failed", 40);
  assert.throws(() => transaction.transition("validating"), /invalid reload transaction transition/u);
  assert.throws(() => transaction.fail("again"), /terminal reload transaction/u);
});
