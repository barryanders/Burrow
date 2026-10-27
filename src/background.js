import { captureSession, configureSessionSaving } from "./lib/session-history.js";
import { runWindowOperation, tuckWindow, restoreWindow, restoreSavedTab } from "./lib/window-vault.js";
const browser = globalThis.browser ?? globalThis.chrome;

let managerTabId = null;
const MANAGER_TAB_KEY = "burrowmarksManagerTabId";

async function rememberManagerTab(tabId) {
  managerTabId = tabId;
  if (tabId === null) await browser.storage.session.remove(MANAGER_TAB_KEY);
  else await browser.storage.session.set({ [MANAGER_TAB_KEY]: tabId });
}

async function openManager(parameters = "") {
  const url = browser.runtime.getURL(`manager.html${parameters}`);
  if (managerTabId === null) {
    managerTabId = (await browser.storage.session.get(MANAGER_TAB_KEY))[MANAGER_TAB_KEY] ?? null;
  }
  if (managerTabId !== null) {
    try {
      const tab = await browser.tabs.update(managerTabId, { active: true, url });
      if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
      return tab;
    } catch { await rememberManagerTab(null); }
  }
  const tab = await browser.tabs.create({ url });
  await rememberManagerTab(tab.id);
  return tab;
}

async function syncContextMenu(enabled) {
  await browser.contextMenus.removeAll();
  if (!enabled) return;
  browser.contextMenus.create({
    id: "burrowmarks-save-page",
    title: "Add this page to Burrow",
    contexts: ["page"],
  });
  browser.contextMenus.create({
    id: "burrowmarks-save-link",
    title: "Add this link to Burrow",
    contexts: ["link"],
  });
}

async function syncStoredContextMenu() {
  const stored = (await browser.storage.local.get("burrowmarksState")).burrowmarksState;
  await syncContextMenu(stored?.settings?.contextMenuEnabled ?? true);
}

browser.runtime.onInstalled.addListener(async (details) => {
  await syncStoredContextMenu();
  if (details.reason === "install") {
    await openManager();
  }
});

browser.runtime.onStartup.addListener(syncStoredContextMenu);

browser.runtime.onMessage.addListener((message, sender) => {
  if (["tuck-window", "restore-window", "restore-tab", "configure-session-saving", "capture-session"].includes(message?.type)) {
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL(""))) return undefined;
    return runWindowOperation(() => message.type === "configure-session-saving"
      ? configureSessionSaving(browser, message.enabled, message.intervalMinutes)
      : message.type === "capture-session" ? captureSession(browser, { force: true })
      : message.type === "tuck-window"
      ? tuckWindow(browser, message.windowId, message.name)
      : message.type === "restore-tab" ? restoreSavedTab(browser, message.id, message.index) : restoreWindow(browser, message.id))
      .then(result => ({ ok: true, ...result }), error => ({ ok: false, error: error.message, code: error.code }));
  }
  if (message?.type === "manager-ready" && sender.tab?.id !== undefined) return rememberManagerTab(sender.tab.id);
  if (message?.type === "open-manager") return openManager(message.parameters || "");
  if (message?.type === "context-menu-setting") return syncContextMenu(message.enabled !== false);
  return undefined;
});

browser.tabs.onRemoved.addListener(async (tabId) => {
  const remembered = managerTabId ?? (await browser.storage.session.get(MANAGER_TAB_KEY))[MANAGER_TAB_KEY];
  if (tabId === remembered) await rememberManagerTab(null);
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!["burrowmarks-save-page", "burrowmarks-save-link"].includes(info.menuItemId)) return;
  const url = info.linkUrl || tab?.url;
  const title = info.linkUrl ? info.linkText || info.linkUrl : tab?.title || url;
  await openManager(`?action=save&url=${encodeURIComponent(url || "")}&title=${encodeURIComponent(title || "")}`);
});

browser.alarms.create("burrowmarks-lock-check", { periodInMinutes: 1 });
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "burrowmarks-lock-check") return;
  const session = (await browser.storage.session.get("burrowmarksSession")).burrowmarksSession;
  if (session?.lockAt !== null && session?.lockAt !== undefined && Date.now() >= session.lockAt) {
    await browser.storage.session.remove("burrowmarksSession");
  }
});

// The existing one-minute alarm also checks the chosen save interval.
browser.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== "burrowmarks-lock-check") return;
  try { await runWindowOperation(() => captureSession(browser)); }
  catch { /* Locked, switched, busy, or unavailable storage: retry on the next alarm. */ }
});
