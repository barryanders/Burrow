import { isPaid, readUnlockedVault, writeUnlockedVault } from "./storage.js";
import { snapshotWindow } from "./window-vault.js";

export const SESSION_INTERVALS = [5, 15, 30, 60];
export const MAX_SESSIONS = 30;
export const MAX_HISTORY_TABS = 5000;
export const MAX_SESSION_TABS = 500;

export function sessionSettings(vault) {
  return {
    enabled: vault.autoSave?.enabled === true,
    intervalMinutes: SESSION_INTERVALS.includes(vault.autoSave?.intervalMinutes) ? vault.autoSave.intervalMinutes : 5,
    lastCheckedAt: Number(vault.autoSave?.lastCheckedAt) || 0,
    signature: vault.autoSave?.signature || "",
    status: vault.autoSave?.status || "",
  };
}

export function retainSessionHistory(windows) {
  const groups = new Map();
  for (const item of windows.filter(item => item.autoSaveId)) {
    if (!groups.has(item.autoSaveId)) groups.set(item.autoSaveId, []);
    groups.get(item.autoSaveId).push(item);
  }
  let tabs = 0;
  const keep = new Set();
  for (const [id, items] of groups) {
    const count = items.reduce((sum, item) => sum + item.tabs.length, 0);
    if (keep.size >= MAX_SESSIONS || tabs + count > MAX_HISTORY_TABS) break;
    keep.add(id); tabs += count;
  }
  return windows.filter(item => !item.autoSaveId || keep.has(item.autoSaveId));
}

export async function configureSessionSaving(api, enabled, intervalMinutes) {
  if (typeof enabled !== "boolean" || !SESSION_INTERVALS.includes(intervalMinutes)) throw new Error("Choose a supported save interval.");
  if (enabled && !(await isPaid())) throw new Error("Automatic session saving is included with Burrow Lifetime.");
  if (enabled && !(await api.permissions.contains({ permissions: ["tabs"] }))) throw new Error("Allow tab access to turn on automatic saves.");
  const { vault, state } = await readUnlockedVault();
  await writeUnlockedVault({ ...vault, autoSave: { ...sessionSettings(vault), enabled, intervalMinutes, lastCheckedAt: 0, status: "" } },
    { autoSaveChanged: true, expectedEnvelope: state.envelope });
  return { enabled };
}

// No decrypted data, addresses, or titles are kept outside the vault between runs.
// Background reads/writes must never extend the user's automatic lock deadline.
export async function captureSession(api, { force = false, now = Date.now() } = {}) {
  if (!(await isPaid())) return { skipped: "license" };
  let unlocked;
  try { unlocked = await readUnlockedVault({ touch: false }); }
  catch (error) { if (error.code === "LOCKED") return { skipped: "locked" }; throw error; }
  const { vault, state } = unlocked;
  const settings = sessionSettings(vault);
  if (!settings.enabled) return { skipped: "disabled" };
  if (!force && now - settings.lastCheckedAt < settings.intervalMinutes * 60_000) return { skipped: "interval" };
  let status = "";
  const windows = [];
  if (!(await api.permissions.contains({ permissions: ["tabs"] }))) status = "Tab access is off. Allow it again to resume automatic saves.";
  else {
    // Only ordinary windows. Private windows are never inspected for tab metadata.
    const open = await api.windows.getAll({ windowTypes: ["normal"] });
    let skipped = 0;
    for (const window of open) {
      if (window.incognito || window.type !== "normal") continue;
      const tabs = await api.tabs.query({ windowId: window.id });
      try {
        const snapshot = snapshotWindow(tabs, "", api.runtime.getURL(""));
        snapshot.name = String(snapshot.tabs.find(tab => tab.active)?.title || snapshot.tabs[0].title || "Browser window").slice(0, 80);
        windows.push(snapshot);
      } catch { skipped += 1; }
    }
    if (skipped) status = `${skipped} window${skipped === 1 ? " was" : "s were"} skipped because no supported snapshot was available.`;
  }
  const count = windows.reduce((sum, window) => sum + window.tabs.length, 0);
  const overCapacity = count > MAX_SESSION_TABS;
  if (overCapacity) status = `Automatic saves support up to ${MAX_SESSION_TABS} open web tabs at a time. This session was not saved.`;
  // Window ordering and transient Firefox IDs do not create duplicate sessions.
  const signature = JSON.stringify(windows.map(window => JSON.stringify(window.tabs)).sort());
  const changed = !overCapacity && windows.length > 0 && signature !== settings.signature;
  const id = `session_${crypto.randomUUID()}`;
  const savedAt = new Date(now).toISOString();
  const nextWindows = changed ? retainSessionHistory([
    ...windows.map(window => ({ ...window, autoSaveId: id, savedAt })), ...(vault.windows || []),
  ]) : vault.windows;
  await writeUnlockedVault({ ...vault, windows: nextWindows, autoSave: {
    ...settings, lastCheckedAt: now, signature: !overCapacity && windows.length ? signature : settings.signature, status,
  } }, { windowsChanged: true, autoSaveChanged: true, expectedEnvelope: state.envelope, touch: false });
  return { saved: changed ? count : 0, windows: changed ? windows.length : 0, status };
}
