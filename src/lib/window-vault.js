import { readUnlockedVault, writeUnlockedVault } from "./storage.js";
import { lockVault } from "./service.js";

export const TAB_LIMIT = 500;

// A snapshot deliberately contains no browser tab IDs, cookies, or page contents.
export function snapshotWindow(tabs, name = "", extensionRoot = "") {
  if (tabs.some(tab => tab.incognito)) throw new Error("Private windows are not supported. Nothing was closed.");
  const candidates = tabs.filter(tab => !(extensionRoot && tab.url?.startsWith(extensionRoot))
    && !["about:blank", "about:newtab", "about:home"].includes(tab.url));
  if (!candidates.length) throw new Error("This window has no web tabs to save.");
  if (candidates.length > TAB_LIMIT) throw new Error(`Keep this window under ${TAB_LIMIT + 1} tabs. Nothing was closed.`);
  if (candidates.some(tab => !/^https?:\/\//i.test(tab.url || "") || tab.pendingUrl)) {
    throw new Error("This window contains a browser page, local file, or navigating tab. Move it to another window or wait for loading to finish. Nothing was closed.");
  }
  if (candidates.some(tab => tab.cookieStoreId && tab.cookieStoreId !== "firefox-default")) {
    throw new Error("Container tabs need their original containers. Move them to another window before saving this one.");
  }
  if (candidates.some(tab => tab.sharingState?.camera || tab.sharingState?.microphone || tab.sharingState?.screen)) {
    throw new Error("Stop screen, camera, or microphone sharing before saving this window.");
  }
  return {
    id: `window_${crypto.randomUUID()}`,
    name: String(name).trim().slice(0, 80) || "Saved window",
    savedAt: new Date().toISOString(),
    tabs: [...candidates].sort((a, b) => a.index - b.index).map(tab => ({
      url: new URL(tab.url).href, title: String(tab.title || tab.url),
      pinned: Boolean(tab.pinned), active: Boolean(tab.active), muted: Boolean(tab.mutedInfo?.muted),
    })),
  };
}

let busy = false;
export async function runWindowOperation(operation) {
  if (busy) throw new Error("A window operation is already running. Please wait.");
  busy = true;
  try { return await operation(); } finally { busy = false; }
}

export async function tuckWindow(api, windowId, name) {
  if (!Number.isInteger(windowId) || windowId < 0) throw new Error("Choose a browser window first.");
  if (!(await api.permissions.contains({ permissions: ["tabs"] }))) throw new Error("Allow tab access to save this window.");
  const { vault, state } = await readUnlockedVault();
  const original = await api.tabs.query({ windowId });
  const root = api.runtime.getURL("");
  const snapshot = snapshotWindow(original, name, root);
  const sourceTabs = original.filter(tab => /^https?:\/\//i.test(tab.url || ""));
  const next = { ...vault, updatedAt: snapshot.savedAt, windows: [snapshot, ...(vault.windows || [])] };
  await writeUnlockedVault(next, { windowsChanged: true, expectedEnvelope: state.envelope });
  // Verify the persisted encrypted record before making any destructive browser changes.
  const verified = await readUnlockedVault();
  if (verified.state.activeVaultId !== state.activeVaultId ||
      JSON.stringify(verified.vault.windows.find(item => item.id === snapshot.id)) !== JSON.stringify(snapshot)) {
    throw new Error("The saved window could not be verified. Nothing was closed.");
  }
  let curtain;
  let remaining = sourceTabs.length;
  try {
    // Keep the window (and the background task) alive when its final web tab closes.
    curtain = await api.tabs.create({ windowId, url: api.runtime.getURL("manager.html?windowResult=working"), active: true });
    for (const tab of sourceTabs) {
      try {
        const live = await api.tabs.get(tab.id);
        // Never close a tab that navigated or moved after the encrypted snapshot.
        if (live.windowId === windowId && live.url === tab.url && !live.pendingUrl) await api.tabs.remove(tab.id);
      } catch { /* A closed/moved tab or a refused close is counted by the final query. */ }
    }
    const survivors = await api.tabs.query({ windowId });
    remaining = survivors.filter(tab => tab.id !== curtain.id &&
      !tab.url?.startsWith(root) && !["about:blank", "about:newtab", "about:home"].includes(tab.url)).length;
  } finally {
    await lockVault();
    if (curtain) await api.tabs.update(curtain.id, {
      url: api.runtime.getURL(`manager.html?windowResult=${remaining ? "partial" : "saved"}`), active: true,
    }).catch(() => {});
  }
  return { saved: snapshot.tabs.length, remaining };
}

export async function restoreWindow(api, id) {
  const { vault } = await readUnlockedVault();
  const saved = vault.windows?.find(item => item.id === id);
  if (!saved || !Array.isArray(saved.tabs) || !saved.tabs.length || saved.tabs.length > TAB_LIMIT) throw new Error("That saved window is unavailable.");
  // Validate imported data before opening anything; never execute a javascript/file URL.
  if (saved.tabs.some(tab => !/^https?:\/\//i.test(tab.url || "") || !URL.canParse(tab.url))) throw new Error("This window contains an unsupported address.");
  const created = await api.windows.create({ url: "about:blank", focused: true });
  let count = 0;
  let selected;
  try {
    for (const tab of saved.tabs) {
      const restored = await api.tabs.create({ windowId: created.id, url: tab.url, pinned: Boolean(tab.pinned), active: false });
      count += 1;
      if (tab.muted) await api.tabs.update(restored.id, { muted: true });
      if (tab.active) selected = restored.id;
    }
    if (selected !== undefined) await api.tabs.update(selected, { active: true });
    if (created.tabs?.[0]?.id !== undefined) await api.tabs.remove(created.tabs[0].id);
  } catch {
    throw new Error(`Restored ${count} of ${saved.tabs.length} tabs. Your saved copy is still in the vault; close the partial window before retrying.`);
  }
  return { restored: count };
}

export async function restoreSavedTab(api, id, index) {
  const { vault } = await readUnlockedVault();
  const tab = vault.windows?.find(item => item.id === id)?.tabs?.[index];
  if (!Number.isInteger(index) || index < 0 || !tab || !/^https?:\/\//i.test(tab.url || "") || !URL.canParse(tab.url)) throw new Error("That saved tab is unavailable or has an unsupported address.");
  const created = await api.tabs.create({ url: tab.url, active: true, pinned: Boolean(tab.pinned) });
  if (tab.muted) await api.tabs.update(created.id, { muted: true });
  return { restored: 1 };
}
