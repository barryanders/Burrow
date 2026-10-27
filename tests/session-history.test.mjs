import assert from "node:assert/strict";
import test from "node:test";
import { captureSession, configureSessionSaving, retainSessionHistory, sessionSettings } from "../src/lib/session-history.js";
import { createVault, unlockVault, lockVault } from "../src/lib/service.js";
import { getStoredState, setEntitlement, readUnlockedVault, writeUnlockedVault, selectVault } from "../src/lib/storage.js";
import { restoreWindow } from "../src/lib/window-vault.js";
import { vaultToBookmarkHtml, addBookmark } from "../src/lib/vault.js";
import { unlockWithRecoveryCode } from "../src/lib/crypto.js";
import "../src/recovery-standalone.js";

let local, session, permission, open, tabs, queries, fail, onQuery, effects;
const area = target => ({
  async get(key) { return { [key]: structuredClone(target()[key]) }; },
  async set(value) { if (fail && target() === local) throw new Error("disk full"); Object.assign(target(), structuredClone(value)); },
  async remove(key) { delete target()[key]; },
});
const api = {
  storage: { local: area(() => local), session: area(() => session) },
  permissions: { async contains() { return permission; } },
  runtime: { getURL(path) { return `moz-extension://test/${path}`; } },
  windows: {
    async getAll() { return open; },
    async create() { effects.push("restore"); return { id: 99, tabs: [] }; },
  },
  tabs: {
    async query({ windowId }) { queries.push(windowId); if (onQuery) await onQuery(); return structuredClone(tabs[windowId] || []); },
    async create(props) { effects.push(props); return { id: 50 }; },
    async update() {}, async remove() { effects.push("remove"); },
  },
};
globalThis.browser = api;
const password = "Session history test password";
async function fresh() {
  local = {}; session = {}; permission = true; fail = false; queries = []; effects = []; onQuery = null;
  open = [{ id: 1, type: "normal", incognito: false }];
  tabs = { 1: [{ id: 12, index: 0, url: "https://example.org/private-session", title: "Private session page", pinned: true, active: true, mutedInfo: { muted: true } }] };
  const recovery = await createVault(password);
  await setEntitlement({ kind: "lifetime", active: true });
  return recovery;
}

test("session capture stays opt-in and is free without an entitlement", async () => {
  await fresh(); assert.equal(sessionSettings((await readUnlockedVault()).vault).enabled, false);
  assert.equal((await captureSession(api)).skipped, "disabled");
  await setEntitlement({ kind: "free", active: true });
  await configureSessionSaving(api, true, 5);
  await configureSessionSaving(api, false, 5);
  assert.equal((await captureSession(api)).skipped, "disabled");
  assert.deepEqual(queries, []);
});

test("captures encrypted sessions without closing tabs or extending lock time, deduplicates and respects interval", async () => {
  const recovery = await fresh(); await configureSessionSaving(api, true, 5);
  const deadline = session.burrowmarksSession.lockAt;
  const now = Date.now();
  assert.equal((await captureSession(api, { now })).saved, 1);
  assert.equal(session.burrowmarksSession.lockAt, deadline);
  assert.deepEqual(effects, []);
  assert.doesNotMatch(JSON.stringify(local), /private-session|Private session page/);
  const { vault } = await readUnlockedVault({ touch: false });
  assert.equal(vault.windows[0].tabs[0].muted, true);
  assert.ok(vault.windows[0].autoSaveId);
  assert.equal((await captureSession(api, { now: now + 60_000 })).skipped, "interval");
  assert.equal((await captureSession(api, { now: now + 300_000 })).saved, 0);
  tabs[1][0].url = "https://example.org/next";
  assert.equal((await captureSession(api, { force: true, now: now + 360_000 })).saved, 1);
  const restored = await unlockWithRecoveryCode((await getStoredState()).envelope, recovery);
  assert.equal(restored.payload.windows.length, 2);
  assert.match(vaultToBookmarkHtml(restored.payload), /private-session/);
  assert.match(globalThis.BurrowmarksRecovery.bookmarkHtml(restored.payload), /private-session/);
});

test("locked/expired vaults do not query tabs; saving resumes after unlock", async () => {
  await fresh(); await configureSessionSaving(api, true, 5); await lockVault();
  assert.equal((await captureSession(api)).skipped, "locked"); assert.deepEqual(queries, []);
  await unlockVault(password); session.burrowmarksSession.lockAt = Date.now() - 1;
  assert.equal((await captureSession(api)).skipped, "locked"); assert.deepEqual(queries, []);
  await unlockVault(password); assert.equal((await captureSession(api)).saved, 1);
});

test("private windows are not queried; mixed container and unsupported windows are skipped as a whole", async () => {
  await fresh(); await configureSessionSaving(api, true, 5);
  open.push({ id: 2, type: "normal", incognito: true }, { id: 3, type: "normal" }, { id: 4, type: "normal" });
  tabs[3] = [{ url: "https://example.org/container", cookieStoreId: "firefox-container-1" }];
  tabs[4] = [{ url: "about:preferences" }, ...tabs[1]];
  const result = await captureSession(api);
  assert.equal(result.saved, 1); assert.match(result.status, /2 windows/); assert.deepEqual(queries, [1, 3, 4]);
  permission = false; queries = [];
  const denied = await captureSession(api, { force: true });
  assert.match(denied.status, /Tab access/); assert.deepEqual(queries, []);
});

test("switching vaults pauses capture, and a switch or lock during capture cannot write into either vault", async () => {
  await fresh(); await configureSessionSaving(api, true, 5);
  const original = (await getStoredState()).activeVaultId;
  await createVault(password, "firefox", "Second");
  assert.equal((await captureSession(api)).skipped, "disabled");
  await selectVault(original); await unlockVault(password);
  onQuery = () => lockVault();
  await assert.rejects(captureSession(api), /locked/);
  await unlockVault(password); assert.equal((await readUnlockedVault()).vault.windows.length, 0);
});

test("failed persistence leaves saved history and live tabs unchanged", async () => {
  await fresh(); await configureSessionSaving(api, true, 5); await captureSession(api);
  tabs[1][0].title = "Changed"; const before = structuredClone(local); fail = true;
  await assert.rejects(captureSession(api, { force: true }), /disk full/);
  assert.deepEqual(local, before); assert.deepEqual(effects, []);
});

test("stale bookmark edits preserve automatic snapshots and preferences", async () => {
  await fresh(); const stale = (await readUnlockedVault()).vault;
  await configureSessionSaving(api, true, 15); await captureSession(api);
  await writeUnlockedVault(addBookmark(stale, { title: "A bookmark", url: "https://example.org/bookmark" }));
  const latest = (await readUnlockedVault()).vault;
  assert.equal(latest.autoSave.enabled, true); assert.equal(latest.autoSave.intervalMinutes, 15);
  assert.equal(latest.windows.length, 1); assert.equal(latest.bookmarks.length, 1);
});

test("history restores after license loss and is preserved on permission revocation", async () => {
  await fresh(); await configureSessionSaving(api, true, 5); await captureSession(api);
  const id = (await readUnlockedVault()).vault.windows[0].id;
  await setEntitlement({ kind: "free", active: true }); permission = false;
  assert.equal((await restoreWindow(api, id)).restored, 1);
  assert.equal((await readUnlockedVault()).vault.windows.length, 1);
});

test("retention removes oldest complete sessions without touching manual saves", () => {
  const history = Array.from({ length: 35 }, (_, i) => ({ id: `w${i}`, autoSaveId: `s${i}`, tabs: [{ url: "https://example.org" }] }));
  const manual = { id: "manual", tabs: [] };
  const kept = retainSessionHistory([manual, ...history]);
  assert.equal(kept.length, 31); assert.equal(kept[0], manual); assert.equal(kept.at(-1).autoSaveId, "s29");
  const huge = Array.from({ length: 12 }, (_, i) => ({ autoSaveId: `s${i}`, tabs: Array(500).fill({}) }));
  assert.equal(retainSessionHistory(huge).length, 10);
});

test("oversized sessions report capacity and preserve previous history", async () => {
  await fresh(); await configureSessionSaving(api, true, 5); await captureSession(api);
  open.push({ id: 3, type: "normal" });
  tabs[3] = Array.from({ length: 500 }, (_, index) => ({ index, url: `https://example.org/${index}` }));
  const result = await captureSession(api, { force: true });
  assert.equal(result.saved, 0); assert.match(result.status, /500/);
  assert.equal((await readUnlockedVault()).vault.windows.length, 1);
});

test("periodic background alarm captures opted-in vaults and rejects external messages", async () => {
  await fresh(); await configureSessionSaving(api, true, 5);
  const messages = [], alarms = [];
  api.runtime.id = "burrow-test";
  api.runtime.onMessage = { addListener(fn) { messages.push(fn); } };
  api.runtime.onInstalled = api.runtime.onStartup = { addListener() {} };
  api.tabs.onRemoved = { addListener() {} };
  api.contextMenus = { onClicked: { addListener() {} } };
  api.alarms = { create() {}, onAlarm: { addListener(fn) { alarms.push(fn); } } };
  await import("../src/background.js");
  assert.equal(messages[0]({ type: "capture-session" }, { id: "outside", url: "https://example.org" }), undefined);
  for (const listener of alarms) await listener({ name: "other-alarm" });
  assert.equal(queries.length, 0);
  for (const listener of alarms) await listener({ name: "burrowmarks-lock-check" });
  assert.equal((await readUnlockedVault()).vault.windows.length, 1);
  await lockVault(); queries = [];
  for (const listener of alarms) await listener({ name: "burrowmarks-lock-check" });
  assert.equal(queries.length, 0);
});

test("a concurrent bookmark revision makes automatic capture retry instead of overwriting it", async () => {
  await fresh(); await configureSessionSaving(api, true, 5);
  onQuery = async () => {
    onQuery = null;
    const { vault } = await readUnlockedVault();
    await writeUnlockedVault(addBookmark(vault, { title: "Concurrent edit", url: "https://example.org/edit" }));
  };
  await assert.rejects(captureSession(api), /changed/);
  assert.equal((await readUnlockedVault()).vault.bookmarks[0].title, "Concurrent edit");
  assert.equal((await captureSession(api)).saved, 1);
});
