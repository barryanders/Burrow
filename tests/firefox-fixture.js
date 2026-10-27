import { createVault, hasVault, unlockVault } from "./lib/service.js";
import { getStoredState, readUnlockedVault, selectVault, writeUnlockedVault } from "./lib/storage.js";
import { addBookmark, addFolder } from "./lib/vault.js";

if (!(await hasVault())) {
  const requestedTheme = new URLSearchParams(location.search).get("theme");
  const password = "Disposable Burrowmarks visual test only";
  const recoveryCode = await createVault(password, requestedTheme || "firefox-burrow", "Personal plans");
  localStorage.setItem("burrowmarks-fixture-recovery-code", recoveryCode);
  let { vault } = await readUnlockedVault();
  vault = addFolder(vault, "Future trips");
  vault = addFolder(vault, "Gift ideas");
  const futureTrips = vault.folders.find((folder) => folder.name === "Future trips").id;
  const giftIdeas = vault.folders.find((folder) => folder.name === "Gift ideas").id;
  for (const bookmark of [
    { title: "Quiet cabin weekend", url: "https://example.com/cabin", folderId: futureTrips, notes: "A possible autumn escape" },
    { title: "Surprise anniversary ideas", url: "https://example.com/surprise", folderId: giftIdeas, notes: "Keep this one secret" },
    { title: "Long-form reading list", url: "https://example.com/reading", notes: "Come back to this later" },
    { title: "Desert stargazing guide", url: "https://example.com/stars", folderId: futureTrips, notes: "Best viewed away from city lights" },
  ]) vault = addBookmark(vault, bookmark);
  await writeUnlockedVault(vault);

  const firstVaultId = (await getStoredState()).activeVaultId;
  await createVault(password, "lockbox", "Work research");
  let { vault: workVault } = await readUnlockedVault();
  workVault = addBookmark(workVault, {
    title: "Private project notes",
    url: "https://example.com/project",
    notes: "Research that belongs outside ordinary bookmarks",
  }, { totalBookmarks: 4 });
  await writeUnlockedVault(workVault);

  await selectVault(firstVaultId);
  await unlockVault(password);
}
location.replace("manager.html");
