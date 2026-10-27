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

const { createVault } = await import("../src/lib/service.js");
const {
  getAutomaticBackups,
  getSessionKey,
  getStoredState,
  readUnlockedVault,
  restoreAutomaticBackup,
  restoreBackupState,
  writeUnlockedVault,
} = await import("../src/lib/storage.js");
const { addBookmark, addFolder } = await import("../src/lib/vault.js");

test("keeps three encrypted earlier vaults and can restore one", async () => {
  await createVault("a durable master password", "lockbox");

  for (let index = 1; index <= 4; index += 1) {
    const { vault } = await readUnlockedVault();
    await writeUnlockedVault(addBookmark(vault, {
      title: `Private link ${index}`,
      url: `https://example.com/${index}`,
    }, { paid: true }));
  }

  const backups = await getAutomaticBackups();
  assert.equal(backups.length, 3);

  await restoreAutomaticBackup(backups[1].id, await getSessionKey({ touch: false }));
  const restored = await readUnlockedVault();
  assert.equal(restored.vault.bookmarks.length, 2);
  assert.equal(restored.vault.bookmarks[0].title, "Private link 2");
});

test("a downloaded encrypted backup restores folders and their bookmark assignments exactly", async () => {
  let { vault } = await readUnlockedVault();
  vault = addFolder(vault, "Paid folder");
  const folder = vault.folders.find((item) => item.name === "Paid folder");
  vault = addBookmark(vault, {
    title: "Folder bookmark",
    url: "https://example.com/folder-bookmark",
    folderId: folder.id,
  }, { paid: true });
  await writeUnlockedVault(vault);

  const exportedState = structuredClone(await getStoredState());
  const originalFolderIds = vault.folders.map((item) => item.id);
  const { vault: changedVault } = await readUnlockedVault();
  await writeUnlockedVault(addFolder(changedVault, "Later folder"));

  await restoreBackupState(exportedState, await getSessionKey({ touch: false }));
  const restored = await readUnlockedVault();
  assert.deepEqual(restored.vault.folders.map((item) => item.id), originalFolderIds);
  assert.equal(restored.vault.bookmarks.find((item) => item.title === "Folder bookmark").folderId, folder.id);
  assert.equal(restored.vault.folders.some((item) => item.name === "Later folder"), false);
});
