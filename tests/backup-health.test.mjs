import assert from "node:assert/strict";
import test from "node:test";

import { getBackupHealth } from "../src/lib/backup-health.js";

const now = Date.parse("2026-08-08T12:00:00.000Z");

test("marks a never-downloaded backup as due", () => {
  const health = getBackupHealth({}, { updatedAt: "2026-08-08T11:00:00.000Z" }, now);
  assert.equal(health.due, true);
  assert.equal(health.current, false);
  assert.match(health.label, /No downloaded backup/);
});

test("distinguishes a recent current backup from one missing newer changes", () => {
  const state = { settings: { lastEncryptedBackupAt: "2026-08-08T11:00:00.000Z" } };
  assert.equal(getBackupHealth(state, { updatedAt: "2026-08-08T10:00:00.000Z" }, now).current, true);
  const stale = getBackupHealth(state, { updatedAt: "2026-08-08T11:30:00.000Z" }, now);
  assert.equal(stale.due, false);
  assert.equal(stale.current, false);
  assert.match(stale.label, /newer changes are only local/);
});

test("asks for another off-profile backup after thirty days", () => {
  const state = { settings: { lastEncryptedBackupAt: "2026-07-09T12:00:00.000Z" } };
  assert.equal(getBackupHealth(state, { updatedAt: "2026-07-09T12:00:00.000Z" }, now).due, true);
});
