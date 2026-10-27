import assert from "node:assert/strict";
import test from "node:test";

const local = {};
const session = {};

function storageArea(target) {
  return {
    async get(key) { return { [key]: target[key] }; },
    async set(values) { Object.assign(target, values); },
    async remove(key) { delete target[key]; },
  };
}

globalThis.browser = {
  storage: {
    local: storageArea(local),
    session: storageArea(session),
  },
};

const {
  changeVaultPassword,
  createVault,
  lockVault,
  resetPasswordWithRecovery,
  unlockVault,
} = await import("../src/lib/service.js");
const { getSessionKey, getStoredState, setSessionKey } = await import("../src/lib/storage.js");

test("changing the master password preserves recovery and removes the old wrapper copy", async () => {
  const recoveryCode = await createVault("original master password", "lockbox");
  await changeVaultPassword("original master password", "replacement master password");
  await lockVault();

  await assert.rejects(unlockVault("original master password"), /did not unlock/);
  await unlockVault("replacement master password");
  assert.equal((await getStoredState()).previousEnvelope, null);
  assert.equal((await getStoredState()).settings.contextMenuEnabled, true);

  await lockVault();
  await resetPasswordWithRecovery(recoveryCode, "recovered master password");
  await lockVault();
  await unlockVault("recovered master password");
  assert.equal((await getStoredState()).previousEnvelope, null);
});

test("a wrong current password cannot change the vault", async () => {
  await assert.rejects(
    changeVaultPassword("wrong current password", "another master password"),
    /did not unlock/,
  );
  await lockVault();
  await unlockVault("recovered master password");
});

test("a zero-minute lock setting stays unlocked until the browser session ends", async () => {
  const dataKey = await getSessionKey({ touch: false });
  await setSessionKey(dataKey, 0);
  assert.equal(session.burrowmarksSession.lockAt, null);
  assert.ok(await getSessionKey({ touch: false }));
});
