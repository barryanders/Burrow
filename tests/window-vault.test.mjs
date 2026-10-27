import assert from "node:assert/strict";
import test from "node:test";
import { snapshotWindow, tuckWindow, restoreWindow, runWindowOperation } from "../src/lib/window-vault.js";
import { createVault, unlockVault, lockVault } from "../src/lib/service.js";
import { readUnlockedVault, writeUnlockedVault, getSessionKey } from "../src/lib/storage.js";
import { vaultToBookmarkHtml, migrateVault } from "../src/lib/vault.js";
import "../src/recovery-standalone.js";

let local, session, tabs, calls, failSave, failClose, navigate, failRestore;
const area = target => ({
  async get(key) { return { [key]: structuredClone(target()[key]) }; },
  async set(value) { if (target() === local && failSave) throw new Error("disk full"); Object.assign(target(), structuredClone(value)); },
  async remove(key) { delete target()[key]; },
});
const api = {
  storage: { local: area(() => local), session: area(() => session) },
  permissions: { async contains() { return true; } },
  runtime: { getURL(path) { return `moz-extension://test/${path}`; } },
  tabs: {
    async query({ windowId }) { return structuredClone(tabs.filter(tab => tab.windowId === windowId)); },
    async get(id) { const tab = tabs.find(tab => tab.id === id); if (!tab) throw new Error("gone"); return { ...tab, ...(navigate && id === 1 ? { url: "https://example.org/changed" } : {}) }; },
    async create(props) { if (failRestore && props.url.startsWith("https:") && calls.filter(call => call[0] === "create").length > 0) throw new Error("failed"); calls.push(["create", props]); const tab = { ...props, id: tabs.length + 50 }; tabs.push(tab); return tab; },
    async update(id, props) { calls.push(["update", id, props]); return Object.assign(tabs.find(tab => tab.id === id), props); },
    async remove(id) { calls.push(["remove", id]); if (failClose) throw new Error("refused"); tabs = tabs.filter(tab => tab.id !== id); },
  },
  windows: { async create() { calls.push(["window"]); return { id: 42, tabs: [{ id: 999 }] }; } },
};
globalThis.browser = api;
async function fresh() {
  local = {}; session = {}; calls = []; failSave = failClose = navigate = failRestore = false;
  tabs = [
    { id: 1, windowId: 7, index: 0, url: "https://example.org/private-a", title: "Secret A", pinned: true, active: false },
    { id: 2, windowId: 7, index: 1, url: "https://example.org/private-b", title: "Secret B", active: true, mutedInfo: { muted: true } },
    { id: 3, windowId: 8, index: 0, url: "https://example.org/other-window", title: "Other" },
  ];
  return createVault("a disposable test password");
}

test("snapshot rejects unsupported, private, container, sharing, and navigating tabs", () => {
  const base = { url: "https://example.org", index: 0 };
  for (const change of [{ url: "file:///a" }, { url: undefined }, { incognito: true }, { cookieStoreId: "firefox-container-1" }, { sharingState: { camera: true } }, { pendingUrl: "https://other.test" }]) {
    assert.throws(() => snapshotWindow([{ ...base, ...change }]));
  }
  assert.throws(() => snapshotWindow([{ url: "about:newtab" }]));
  const snapshot = snapshotWindow([{ ...base, id: 9, windowId: 7, pinned: true }], "  Reading  ");
  assert.equal(snapshot.name, "Reading");
  assert.equal(snapshot.tabs[0].pinned, true);
  assert.equal(snapshot.tabs[0].id, undefined);
});

test("save is encrypted and verified before closing only the chosen window, then locks", async () => {
  const recovery = await fresh();
  const result = await tuckWindow(api, 7, "Secret window");
  assert.deepEqual(result, { saved: 2, remaining: 0 });
  assert.equal(await getSessionKey(), null);
  assert.ok(tabs.find(tab => tab.id === 3));
  assert.equal(tabs.some(tab => tab.id === 1 || tab.id === 2), false);
  assert.doesNotMatch(JSON.stringify(local), /Secret window|private-a|Secret A/);
  await unlockVault(recovery, "recovery");
  const { vault } = await readUnlockedVault();
  assert.equal(vault.windows[0].tabs[1].muted, true);
  assert.match(vaultToBookmarkHtml(vault), /private-a/);
  assert.match(globalThis.BurrowmarksRecovery.bookmarkHtml(vault), /private-b/);
  assert.equal(migrateVault({ schemaVersion: 1, bookmarks: [], folders: [] }).windows.length, 0);
});

test("failed storage never closes any tab", async () => {
  await fresh(); failSave = true;
  await assert.rejects(tuckWindow(api, 7, "Test"), /disk full/);
  assert.deepEqual(calls, []);
  assert.equal(tabs.length, 3);
});

test("close failures lock the vault and report partial closure without losing the snapshot", async () => {
  await fresh(); failClose = true;
  assert.equal((await tuckWindow(api, 7, "Test")).remaining, 2);
  assert.equal(await getSessionKey(), null);
  await unlockVault("a disposable test password");
  assert.equal((await readUnlockedVault()).vault.windows.length, 1);
});

test("a tab that navigates after save is never closed", async () => {
  await fresh(); navigate = true;
  assert.equal((await tuckWindow(api, 7, "Test")).remaining, 1);
  assert.ok(tabs.find(tab => tab.id === 1));
});

test("restore preserves order, pins, mute, active tab, and keeps the encrypted snapshot", async () => {
  await fresh(); await tuckWindow(api, 7, "Test"); await unlockVault("a disposable test password");
  const { vault } = await readUnlockedVault(); calls = [];
  assert.deepEqual(await restoreWindow(api, vault.windows[0].id), { restored: 2 });
  const created = calls.filter(call => call[0] === "create");
  assert.equal(created[0][1].pinned, true);
  assert.equal(created[1][1].url, "https://example.org/private-b");
  assert.ok(calls.some(call => call[0] === "update" && call[2].muted));
  assert.ok(calls.some(call => call[0] === "update" && call[2].active));
  assert.equal((await readUnlockedVault()).vault.windows.length, 1);
  await lockVault();
  await assert.rejects(restoreWindow(api, vault.windows[0].id), /locked/);
});

test("failed restore keeps the snapshot and reports progress", async () => {
  await fresh(); await tuckWindow(api, 7, "Test"); await unlockVault("a disposable test password");
  const { vault } = await readUnlockedVault(); calls = []; failRestore = true;
  await assert.rejects(restoreWindow(api, vault.windows[0].id), /Restored 1 of 2/);
  assert.equal((await readUnlockedVault()).vault.windows[0].tabs.length, 2);
});

test("stale bookmark edits cannot erase windows and conflicting snapshots fail closed", async () => {
  await fresh(); const original = await readUnlockedVault();
  await tuckWindow(api, 7, "Test"); await unlockVault("a disposable test password");
  await writeUnlockedVault(original.vault);
  assert.equal((await readUnlockedVault()).vault.windows.length, 1);
  await assert.rejects(writeUnlockedVault(original.vault, { windowsChanged: true, expectedEnvelope: original.state.envelope }), /changed/);
});

test("window actions reject concurrent double clicks", async () => {
  let finish;
  const first = runWindowOperation(() => new Promise(resolve => { finish = resolve; }));
  await assert.rejects(runWindowOperation(async () => {}), /already running/);
  finish(); await first;
});

test("permission denial and unsupported pages cannot save or close tabs", async () => {
  await fresh();
  const denied = { ...api, permissions: { async contains() { return false; } } };
  await assert.rejects(tuckWindow(denied, 7, "Test"), /Allow tab access/);
  tabs.push({ id: 10, windowId: 7, url: "about:config" });
  await assert.rejects(tuckWindow(api, 7, "Test"), /browser page/);
  assert.deepEqual(calls, []);
  assert.equal((await readUnlockedVault()).vault.windows.length, 0);
});

test("imported unsafe URLs cannot open windows", async () => {
  await fresh();
  const { vault, state } = await readUnlockedVault();
  await writeUnlockedVault({ ...vault, windows: [{ id: "unsafe", tabs: [{ url: "javascript:alert(1)" }] }] }, { windowsChanged: true, expectedEnvelope: state.envelope });
  await assert.rejects(restoreWindow(api, "unsafe"), /unsupported address/);
  assert.deepEqual(calls, []);
});

test("individual tab restore opens only the requested URL and retains the snapshot", async () => {
  const { restoreSavedTab } = await import("../src/lib/window-vault.js");
  await fresh(); await tuckWindow(api, 7, "Research"); await unlockVault("a disposable test password");
  const { vault } = await readUnlockedVault(); calls = [];
  await restoreSavedTab(api, vault.windows[0].id, 1);
  assert.equal(calls.filter(call => call[0] === "create").length, 1);
  assert.equal(calls.find(call => call[0] === "create")[1].url, "https://example.org/private-b");
  assert.equal((await readUnlockedVault()).vault.windows[0].tabs.length, 2);
  await assert.rejects(restoreSavedTab(api, vault.windows[0].id, -1));
  await assert.rejects(restoreSavedTab(api, vault.windows[0].id, "0"));
  await lockVault(); await assert.rejects(restoreSavedTab(api, vault.windows[0].id, 0), /locked/);
});

test("free windows save beyond both former capacity caps", async () => {
  await fresh(); const { vault, state } = await readUnlockedVault();
  const item = snapshotWindow(tabs.filter(tab => tab.windowId === 7));
  await writeUnlockedVault({ ...vault, windows: Array.from({length: 101}, (_, n) => ({...item, id: `saved-${n}`})) }, { windowsChanged: true, expectedEnvelope: state.envelope });
  await tuckWindow(api, 7, "Another free window");
  await unlockVault("a disposable test password");
  assert.equal((await readUnlockedVault()).vault.windows.length, 102);
  assert.deepEqual(await restoreWindow(api, "saved-0"), { restored: 2 });
});
