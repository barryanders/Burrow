import assert from "node:assert/strict";
import test from "node:test";
import { createVaultEnvelope } from "../src/lib/crypto.js";

await import(`../src/recovery-standalone.js?test=${Date.now()}`);

test("the standalone kit recovers an extension backup by password and recovery key", async () => {
  const original = { schemaVersion: 1, folders: [], bookmarks: [{ title: "Kept", url: "https://example.com" }] };
  const created = await createVaultEnvelope("correct horse battery staple", original);
  const backup = { format: "burrowmarks-backup", version: 1, state: { envelope: created.envelope } };
  const passwordVault = await globalThis.BurrowmarksRecovery.unlockBackup(backup, "correct horse battery staple");
  const recoveryVault = await globalThis.BurrowmarksRecovery.unlockBackup(backup, created.recoveryCode, true);
  assert.deepEqual(passwordVault, original);
  assert.deepEqual(recoveryVault, original);
  assert.match(globalThis.BurrowmarksRecovery.bookmarkHtml(recoveryVault), /Kept/);
});

test("the standalone kit rejects unrelated files and bad secrets", async () => {
  await assert.rejects(globalThis.BurrowmarksRecovery.unlockBackup({}, "anything"), /not a supported/);
  const created = await createVaultEnvelope("correct horse battery staple", { bookmarks: [] });
  await assert.rejects(globalThis.BurrowmarksRecovery.unlockBackup({ format: "burrowmarks-backup", state: { envelope: created.envelope } }, "wrong password"));
});
