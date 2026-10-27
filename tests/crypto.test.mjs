import assert from "node:assert/strict";
import test from "node:test";

if (!globalThis.btoa) globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
if (!globalThis.atob) globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");

const {
  changePassword,
  createVaultEnvelope,
  unlockWithPassword,
  unlockWithRecoveryCode,
  updateEncryptedPayload,
} = await import("../src/lib/crypto.js");

test("password and recovery key unlock the same payload", async () => {
  const original = { bookmarks: [{ title: "Private", url: "https://example.com" }] };
  const created = await createVaultEnvelope("correct horse battery staple", original);
  const passwordUnlock = await unlockWithPassword(
    created.envelope,
    "correct horse battery staple",
  );
  const recoveryUnlock = await unlockWithRecoveryCode(
    created.envelope,
    created.recoveryCode.toLowerCase(),
  );
  assert.deepEqual(passwordUnlock.payload, original);
  assert.deepEqual(recoveryUnlock.payload, original);
});

test("wrong passwords fail without changing the envelope", async () => {
  const created = await createVaultEnvelope("correct horse battery staple", { ok: true });
  await assert.rejects(
    unlockWithPassword(created.envelope, "incorrect password"),
    /did not unlock/,
  );
  const unlocked = await unlockWithPassword(
    created.envelope,
    "correct horse battery staple",
  );
  assert.equal(unlocked.payload.ok, true);
});

test("password can be changed without invalidating recovery", async () => {
  const created = await createVaultEnvelope("correct horse battery staple", { count: 1 });
  const changed = await changePassword(
    created.envelope,
    created.dataKey,
    "a newer stronger password",
  );
  await assert.rejects(unlockWithPassword(changed, "correct horse battery staple"));
  assert.equal((await unlockWithPassword(changed, "a newer stronger password")).payload.count, 1);
  assert.equal((await unlockWithRecoveryCode(changed, created.recoveryCode)).payload.count, 1);
});

test("people may choose a short non-empty master password", async () => {
  const created = await createVaultEnvelope("x", { private: true });
  assert.deepEqual((await unlockWithPassword(created.envelope, "x")).payload, { private: true });
  const changed = await changePassword(created.envelope, created.dataKey, "y");
  assert.deepEqual((await unlockWithPassword(changed, "y")).payload, { private: true });
});

test("an empty master password is still rejected", async () => {
  await assert.rejects(createVaultEnvelope("", {}), /Enter a master password/);
});

test("payload updates remain decryptable", async () => {
  const created = await createVaultEnvelope("correct horse battery staple", { count: 1 });
  const updated = await updateEncryptedPayload(created.envelope, created.dataKey, { count: 2 });
  assert.equal(
    (await unlockWithPassword(updated, "correct horse battery staple")).payload.count,
    2,
  );
});
