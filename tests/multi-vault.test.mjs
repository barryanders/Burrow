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

const { createVault, lockVault, unlockVault } = await import("../src/lib/service.js");
const {
  getSessionKey,
  getStoredState,
  getTotalBookmarkCount,
  listVaults,
  readUnlockedVault,
  selectVault,
  writeUnlockedVault,
} = await import("../src/lib/storage.js");
const { addBookmark } = await import("../src/lib/vault.js");

test("multiple independently locked vaults remain free beyond the old shared limit", async () => {
  await createVault("work password", "firefox", "Work");
  let { vault } = await readUnlockedVault();
  for (let index = 0; index < 4; index += 1) {
    vault = addBookmark(vault, {
      title: `Work ${index}`,
      url: `https://example.com/work-${index}`,
    }, { totalBookmarks: index });
  }
  await writeUnlockedVault(vault);
  await lockVault();

  await createVault("personal password", "lockbox", "Personal");
  assert.deepEqual((await listVaults()).map(({ name }) => name), ["Work", "Personal"]);
  assert.deepEqual((await listVaults()).map(({ theme }) => theme), ["firefox", "lockbox"]);
  assert.deepEqual((await listVaults()).map(({ iconStyle }) => iconStyle), ["stone-bookmark", "abstract-burrowmark"]);
  assert.equal((await getStoredState()).settings.theme, "lockbox");
  assert.equal(await getTotalBookmarkCount((await readUnlockedVault()).vault), 4);

  ({ vault } = await readUnlockedVault());
  vault = addBookmark(vault, {
    title: "Personal one",
    url: "https://example.com/personal-one",
  }, { totalBookmarks: 4 });
  await writeUnlockedVault(vault);
  assert.equal(await getTotalBookmarkCount(vault), 5);
  assert.doesNotThrow(() => addBookmark(vault, {
    title: "Over the shared limit",
    url: "https://example.com/six",
  }, { totalBookmarks: 5 }));

  const work = (await listVaults()).find((item) => item.name === "Work");
  await selectVault(work.id);
  assert.equal((await getStoredState()).settings.theme, "firefox");
  assert.equal(await getSessionKey({ touch: false }), null);
  await assert.rejects(unlockVault("personal password"), /did not unlock/);
  await unlockVault("work password");
  assert.equal((await readUnlockedVault()).vault.bookmarks.length, 4);
});
