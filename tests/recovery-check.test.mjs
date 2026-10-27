import assert from "node:assert/strict";
import test from "node:test";

if (!globalThis.btoa) globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
if (!globalThis.atob) globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");

const { createVaultEnvelope } = await import("../src/lib/crypto.js");
const {
  validateEncryptedBackup,
  verifyEncryptedBackup,
  verifyRecoveryKey,
} = await import("../src/lib/recovery-check.js");

const vault = {
  schemaVersion: 1,
  folders: [
    { id: "inbox", name: "Tucked away" },
    { id: "research", name: "Research" },
  ],
  bookmarks: [
    { id: "one", title: "One", url: "https://example.com", folderId: "research" },
  ],
};

test("recovery check verifies the current key without changing the envelope", async () => {
  const created = await createVaultEnvelope("master password", vault);
  const originalEnvelope = structuredClone(created.envelope);
  const result = await verifyRecoveryKey(created.envelope, created.recoveryCode.toLowerCase());

  assert.deepEqual(result, { unlockMethod: "recovery key", bookmarkCount: 1, folderCount: 2, windowCount: 0, tabCount: 0 });
  assert.deepEqual(created.envelope, originalEnvelope);
});

test("recovery check rejects the wrong key", async () => {
  const created = await createVaultEnvelope("master password", vault);
  await assert.rejects(verifyRecoveryKey(created.envelope, "WRONG-RECOVERY-KEY"), /did not unlock/);
});

test("backup check accepts either the password or recovery key without restoring", async () => {
  const created = await createVaultEnvelope("master password", vault);
  const backup = { format: "burrowmarks-backup", version: 1, state: { envelope: created.envelope } };
  const originalBackup = structuredClone(backup);

  assert.equal((await verifyEncryptedBackup(backup, "master password")).unlockMethod, "master password");
  assert.equal((await verifyEncryptedBackup(backup, created.recoveryCode)).unlockMethod, "recovery key");
  assert.deepEqual(backup, originalBackup);
});

test("backup check rejects unsupported files", () => {
  assert.throws(() => validateEncryptedBackup({ format: "something-else" }), /not a supported/);
});
