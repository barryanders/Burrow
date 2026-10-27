import { sessionSettings, SESSION_INTERVALS } from "./lib/session-history.js";
import { searchWindows, renameSavedWindow } from "./lib/window-library.js";
import { WINDOW_EXPLANATION, requestWindowAccess, sendWindowAction } from "./lib/window-ui.js";
import { getActiveVaultBackupState, getAutomaticBackups, getStoredState, getSessionKey, getTotalBookmarkCount, isPaid, readUnlockedVault, recordEncryptedBackupDownload, restoreAutomaticBackup, restoreBackupState, saveStoredState, selectVault, setEntitlement, setSessionKey, writeUnlockedVault } from "./lib/storage.js";
import { changeVaultPassword, createVault, lockVault, resetPasswordWithRecovery, unlockVault } from "./lib/service.js";
import { downloadText, readJsonFile, readTextFile } from "./lib/files.js";
import { getBackupHealth } from "./lib/backup-health.js";
import { unlockWithPassword, unlockWithRecoveryCode } from "./lib/crypto.js";
import { validateEncryptedBackup, verifyEncryptedBackup, verifyRecoveryKey } from "./lib/recovery-check.js";
import { applyTheme, DEFAULT_THEME, normalizeTheme, themeArt, canSelectTheme, THEMES } from "./lib/theme.js";
import { effectiveIconStyle, iconStyleAsset } from "./lib/icon-style.js";
const browser = globalThis.browser ?? globalThis.chrome;
import {
  addBookmark,
  addFolder,
  findBookmarkByUrl,
  importBookmarkHtml,
  removeBookmark,
  removeBookmarks,
  removeFolder,
  renameFolder,
  searchBookmarks,
  savePendingBookmark,
  updateBookmark,
  vaultToBookmarkHtml,
} from "./lib/vault.js";

const app = document.querySelector("#app");
let currentVault = null;
let currentPaid = false;
let currentTotalBookmarks = 0;
let currentFolderId = null;
let currentView = "windows";
let currentSettingsTab = "main";
let dialogCloseCallback = null;
let dialogReturnFocus = null;
let selectedBookmarkIds = new Set();
let liveRefreshTimer = null;
let windowQuery = "";

const ICON_PATHS = Object.freeze({
  restore: '<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  bookmarks: '<path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-3.75L6 21V4.75Z"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  export: '<path d="M12 3v12m0-12 4 4m-4-4L8 7M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  folder: '<path d="M3.5 7.25A2.25 2.25 0 0 1 5.75 5h3l2 2h7.5a2.25 2.25 0 0 1 2.25 2.25v7.5A2.25 2.25 0 0 1 18.25 19H5.75a2.25 2.25 0 0 1-2.25-2.25v-9.5Z"/>',
  folders: '<path d="M3.5 8.5V6.75A1.75 1.75 0 0 1 5.25 5h3l2 2H18a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H6a2.5 2.5 0 0 1-2.5-2.5V8.5Zm3-3.5V3.5h7L15 5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.75 9a2.35 2.35 0 1 1 3.1 2.23c-.7.28-.85.78-.85 1.52M12 16.9h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.55v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-1.5-1H2.5V10h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.56 4.2l.06.06A1.7 1.7 0 0 0 8.5 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 18.9 9a1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1 .6Z"/>',
  vault: '<path d="M5 21V7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5V21M3 21h18M9 5V3h6v2"/><circle cx="12" cy="13" r="2.5"/><path d="M12 15.5V18"/>',
});

function uiIcon(name, className = "") {
  return `<svg class="ui-icon${className ? ` ${className}` : ""}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ""}</svg>`;
}

function themeMoleAsset(theme = document.documentElement.dataset.theme, scene = "library") {
  return themeArt(theme, scene);
}

function keeperAsset() {
  return themeMoleAsset();
}

function themeDisplayName(theme) {
  return THEMES.find((item) => item.id === normalizeTheme(theme))?.name || "Sage";
}

function problemReportUrl() {
  const version = browser.runtime.getManifest().version || "Unknown";
  const url = new URL("https://barryanders.github.io/report/");
  url.searchParams.set("app", "burrowmarks");
  url.searchParams.set("name", "Burrow");
  url.searchParams.set("version", version);
  url.searchParams.set("os", navigator.platform || "Unknown");
  return url.href;
}

function themeChoices(selectedTheme = DEFAULT_THEME, { compact = false } = {}) {
  const selected = normalizeTheme(selectedTheme);
  return `<div class="theme-choices${compact ? " compact" : ""}">${THEMES.map((theme) => `
    <label class="theme-choice" data-theme-preview="${theme.id}">
      <input type="radio" name="theme" value="${theme.id}" ${selected === theme.id ? "checked" : ""}>
      <span class="theme-swatch" aria-hidden="true"><i></i><b></b><em></em></span>
      <span class="theme-copy"><strong>${theme.name}</strong><small>${theme.description}${theme.id !== DEFAULT_THEME ? " · Free" : " · Free"}</small></span>
    </label>`).join("")}</div>`;
}

function escapeHtml(value = "") {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function setMarkup(target, markup) {
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  target.replaceChildren(...parsed.body.childNodes);
}

async function renderGate({ setup = false, adding = false, selectedTheme = DEFAULT_THEME } = {}) {
  currentVault = null;
  windowQuery = "";
  currentFolderId = null;
  currentView = "windows";
  const state = await getStoredState();
  applyTheme(setup ? selectedTheme : state?.settings?.theme);
  const vaults = state?.vaults || [];
  const gateForm = `
    <form id="gate-form">
      ${setup ? `<details class="simple-details"><summary>Appearance</summary><fieldset class="theme-fieldset"><legend>Vault theme</legend><p>You can change this later in Settings.</p>${themeChoices(selectedTheme)}</fieldset></details>` : ""}
      ${setup ? `<div class="field"><label for="vault-name">Vault name</label><input id="vault-name" maxlength="60" placeholder="${adding ? `Vault ${vaults.length + 1}` : "Primary vault"}"><small>Vault names are visible while locked so you can choose the right one.</small></div>` : ""}
      ${setup ? `<div class="field"><label for="gate-secret">Create a vault password</label><input id="gate-secret" type="password" autocomplete="new-password" required><small>Use any password you will remember. Longer, unique passwords provide stronger protection.</small></div>` : `<div class="field unlock-field"><label for="gate-secret">Vault password</label><div class="unlock-row"><input id="gate-secret" type="password" autocomplete="current-password" required autofocus><button class="button primary" type="submit">Unlock vault</button></div></div>`}
      ${setup ? '<div class="field"><label for="gate-confirm">Confirm password</label><input id="gate-confirm" type="password" autocomplete="new-password" required></div>' : ""}
      <p class="error" id="gate-error"></p>
      ${setup ? `<div class="actions"><button class="button primary gate-submit" type="submit">Create encrypted vault</button>${adding ? '<button class="button quiet" type="button" id="cancel-new-vault">Back to vaults</button>' : ""}</div>` : ""}
    </form>`;
  setMarkup(app, setup ? `
    <main class="gate"><section class="gate-card setup-card card">
      <header class="setup-hero">
        <img class="gate-mark" src="${themeMoleAsset(selectedTheme)}" alt="Burrow mole">
        <h1>${adding ? "Create another vault" : "Create your vault"}</h1>
        <p class="subtitle">${adding ? "This vault gets its own password and recovery key. Tabs and bookmarks are unlimited." : "Keep selected tabs and bookmarks in a local, encrypted vault. Save a recovery key so you can always get back in."}</p>
      </header>${gateForm}
    </section></main>` : `
    <main class="gate locked-gate"><section class="gate-card locked-card card">
      <div class="locked-copy">${new URLSearchParams(location.search).get("windowResult") === "saved" ? '<p class="notice" role="status">Window saved. Web tabs closed. Vault locked.</p>' : new URLSearchParams(location.search).has("windowResult") ? '<p class="notice" role="status">Your snapshot is saved. Some tabs may still be open; check the window before stepping away.</p>' : ""}<div class="locked-brand"><img src="${iconStyleAsset(effectiveIconStyle(state?.settings?.theme), 128)}" alt=""><strong>Burrow</strong></div><h1>Unlock your vault</h1><p class="subtitle">Your saved tabs and bookmarks are waiting.</p>${vaults.length > 1 ? `<div class="field"><label for="vault-picker">Vault</label><select id="vault-picker">${vaults.map((vault) => `<option value="${vault.id}" ${vault.id === state.activeVaultId ? "selected" : ""}>${escapeHtml(vault.name)}</option>`).join("")}</select></div>` : `<p class="active-vault-name"><strong>${escapeHtml(vaults[0]?.name || "Primary vault")}</strong></p>`}${gateForm}<div class="actions gate-actions"><button class="button quiet" id="recovery-toggle">Use recovery key</button><button class="button quiet" id="automatic-recovery" hidden>Restore automatic backup</button><button class="button quiet" id="create-another-vault">Create another vault</button></div></div>
      <aside class="locked-art"><img src="${themeMoleAsset(state?.settings?.theme, "locked")}" alt="Burrow mole"><p class="art-caption">Saved on your device. Protected by your password.</p></aside>
    </section></main>`);

  document.querySelector("#gate-form").onsubmit = async (event) => {
    event.preventDefault();
    const secret = document.querySelector("#gate-secret").value;
    try {
      if (setup) {
        if (secret !== document.querySelector("#gate-confirm").value) throw new Error("The passwords do not match.");
        const requestedTheme = document.querySelector('input[name="theme"]:checked')?.value || DEFAULT_THEME;
        if (!canSelectTheme(requestedTheme, await isPaid())) throw new Error("Choose a theme for your vault.");
        const recoveryCode = await createVault(secret, document.querySelector('input[name="theme"]:checked')?.value || state?.settings?.theme, document.querySelector("#vault-name").value);
        renderRecovery(recoveryCode);
      } else {
        await unlockVault(secret);
        await renderManager();
      }
    } catch (error) {
      document.querySelector("#gate-error").textContent = error.message;
    }
  };

  document.querySelector("#recovery-toggle")?.addEventListener("click", renderRecoveryUnlock);
  document.querySelector("#cancel-new-vault")?.addEventListener("click", () => renderGate({ selectedTheme: state?.settings?.theme }));
  document.querySelector("#create-another-vault")?.addEventListener("click", () => renderGate({ setup: true, adding: true, selectedTheme: state?.settings?.theme }));
  document.querySelector("#vault-picker")?.addEventListener("change", async (event) => {
    const nextState = await selectVault(event.target.value);
    await renderGate({ selectedTheme: nextState.settings?.theme });
  });
  const automaticRecovery = document.querySelector("#automatic-recovery");
  if (automaticRecovery) {
    getAutomaticBackups().then((backups) => { automaticRecovery.hidden = backups.length === 0; });
    automaticRecovery.addEventListener("click", renderAutomaticRecovery);
  }
  document.querySelectorAll('input[name="theme"]').forEach((input) => input.addEventListener("change", async () => {
    if (!canSelectTheme(input.value, await isPaid(), DEFAULT_THEME)) {
      document.querySelector('input[name="theme"][value="firefox"]').checked = true;
      document.querySelector("#gate-error").textContent = "All themes are included.";
      applyTheme(DEFAULT_THEME);
      return;
    }
    applyTheme(input.value);
    const gateMark = document.querySelector(".gate-mark");
    if (gateMark) {
      gateMark.src = themeMoleAsset(input.value);
      gateMark.alt = "Burrow mole holding browser tabs";
    }
  }));
}

async function renderAutomaticRecovery() {
  const backups = await getAutomaticBackups();
  setMarkup(app, `
    <main class="gate"><section class="gate-card card">
      <img class="gate-mark" src="assets/burrow-backup-success.png" alt="">
      <h1>Restore an automatic backup</h1>
      <p class="subtitle">Burrow keeps up to three encrypted copies before your vault changes. Choose one, then unlock it with the password or recovery key it used at that time.</p>
      <div class="safety-copy-list">${backups.map((backup, index) => `<button class="button safety-copy" data-backup-id="${backup.id}"><strong>${index === 0 ? "Most recent automatic backup" : `Automatic backup ${index + 1}`}</strong><small>${new Date(backup.savedAt).toLocaleString()}</small></button>`).join("")}</div>
      <p class="subtitle">These automatic backups protect against an accidental edit or damaged save. They stay in this browser profile, so keep a downloaded encrypted backup for protection from profile loss or uninstalling.</p>
      <button class="button quiet" id="automatic-recovery-back">Back</button>
    </section></main>`);
  document.querySelector("#automatic-recovery-back").onclick = () => renderGate();
  document.querySelectorAll("[data-backup-id]").forEach((button) => {
    button.onclick = () => renderAutomaticRecoveryUnlock(button.dataset.backupId);
  });
}

function renderAutomaticRecoveryUnlock(backupId) {
  setMarkup(app, `
    <main class="gate"><section class="gate-card card">
      <img class="gate-mark" src="assets/burrow-backup-success.png" alt="">
      <h1>Unlock this automatic backup</h1>
      <form id="automatic-recovery-form">
        <div class="field"><label for="automatic-recovery-secret">Master password or recovery key</label><input id="automatic-recovery-secret" type="password" autocomplete="off" required></div>
        <p class="error" id="automatic-recovery-error"></p>
        <button class="button primary" type="submit">Verify and restore</button>
        <button class="button quiet" type="button" id="automatic-recovery-list">Back</button>
      </form>
    </section></main>`);
  document.querySelector("#automatic-recovery-list").onclick = renderAutomaticRecovery;
  document.querySelector("#automatic-recovery-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const backup = (await getAutomaticBackups()).find((item) => item.id === backupId);
      if (!backup) throw new Error("That automatic backup is no longer available.");
      const secret = document.querySelector("#automatic-recovery-secret").value;
      let unlocked;
      try { unlocked = await unlockWithPassword(backup.state.envelope, secret); }
      catch { unlocked = await unlockWithRecoveryCode(backup.state.envelope, secret); }
      await restoreAutomaticBackup(backupId, unlocked.dataKey);
      await renderManager();
    } catch (error) {
      document.querySelector("#automatic-recovery-error").textContent = error.message;
    }
  };
}

function renderRecovery(recoveryCode) {
  setMarkup(app, `
    <main class="gate"><section class="gate-card card">
      <img class="gate-mark" src="assets/burrow-recovery-key.png" alt="">

      <h1>Save your recovery key</h1>
      <p class="subtitle">This key can restore access if you forget your password. Burrow cannot recreate it.</p>
      <p class="recovery-code" id="recovery-code">${recoveryCode}</p>
      <div class="actions">
        <button class="button" id="copy-recovery">Copy key</button>
        <button class="button" id="download-recovery">Download recovery card</button>
      </div>
      <label class="recovery-acknowledgment"><input id="recovery-confirm" type="checkbox"><span><strong>Yes, I understand.</strong> If I don’t save this recovery key, I could lose access to my bookmarks.</span></label>
      <button class="button primary" id="finish-setup" disabled>I saved it. Open my vault</button>
    </section></main>`);
  document.querySelector("#copy-recovery").onclick = () => navigator.clipboard.writeText(recoveryCode);
  document.querySelector("#download-recovery").onclick = () =>
    downloadText("burrow-recovery-key.txt", `BURROW RECOVERY KEY\n\n${recoveryCode}\n\nKeep this private. It can unlock your bookmark vault.\n`);
  const confirmation = document.querySelector("#recovery-confirm");
  const finish = document.querySelector("#finish-setup");
  confirmation.onchange = () => { finish.disabled = !confirmation.checked; };
  finish.onclick = () => renderManager();
}

function renderRecoveryUnlock() {
  setMarkup(app, `
    <main class="gate"><section class="gate-card card">
      <img class="gate-mark" src="assets/burrow-recovery-key.png" alt="">
      <h1>Set a new password</h1>
      <form id="recovery-form">
        <div class="field"><label for="recovery-key">Recovery key</label><textarea id="recovery-key" required></textarea></div>
        <div class="field"><label for="new-password">New master password</label><input id="new-password" type="password" required><small>Use any password you will remember. Longer, unique passwords provide stronger protection.</small></div>
        <p class="error" id="recovery-error"></p>
        <button class="button primary" type="submit">Recover vault</button>
        <button class="button quiet" type="button" id="recovery-back">Back</button>
      </form>
    </section></main>`);
  document.querySelector("#recovery-back").onclick = () => renderGate();
  document.querySelector("#recovery-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      await resetPasswordWithRecovery(
        document.querySelector("#recovery-key").value,
        document.querySelector("#new-password").value,
      );
      await renderManager();
    } catch (error) {
      document.querySelector("#recovery-error").textContent = error.message;
    }
  };
}

function renderBookmarkItems(bookmarks) {
  if (!bookmarks.length) {
    return `<section class="empty card"><img src="${themeMoleAsset(undefined, "empty")}" alt=""><h2>Nothing saved yet</h2><p>Save a page, add a link, or bring selected bookmarks over from a standard browser export.</p><div class="actions empty-actions"><button class="button primary" data-action="add">Add a private link</button><button class="button" data-action="backup">Import bookmark file</button></div></section>`;
  }
  return `<section class="bookmark-list">${bookmarks.map((bookmark) => `
    <article class="bookmark" data-id="${bookmark.id}">
      <label class="bookmark-select" title="Select ${escapeHtml(bookmark.title)}"><input type="checkbox" data-select-id="${bookmark.id}" ${selectedBookmarkIds.has(bookmark.id) ? "checked" : ""}></label>
      <div class="bookmark-copy"><h3>${escapeHtml(bookmark.title)}</h3><p>${escapeHtml(bookmark.url)}</p></div>
      <div class="actions">
        <button class="button quiet" data-action="open" data-id="${bookmark.id}">Open</button>
        <button class="button quiet" data-action="edit" data-id="${bookmark.id}">Edit</button>
        <button class="button quiet danger" data-action="delete" data-id="${bookmark.id}">Delete</button>
      </div>
    </article>`).join("")}</section>`;
}

function topbarMarkup(title, subtitle = "", actions = "") {
  return `<header class="topbar"><div><h1>${title}</h1>${subtitle ? `<p class="subtitle">${subtitle}</p>` : ""}</div><div class="actions">${actions}<button class="button quiet with-icon" data-action="lock">${uiIcon("lock")}<span>Lock vault</span></button></div></header>`;
}

function bookmarksPageMarkup(vault, visible, backupHealth, folderName, query) {
  return `
    ${topbarMarkup(folderName ? escapeHtml(folderName) : "Private bookmarks", "", `<button class="button primary with-icon" data-action="add">${uiIcon("add")}<span>Add link</span></button>`)}
    <div class="collection-tools"><input class="search" id="search" type="search" placeholder="Search private bookmarks" value="${escapeHtml(query)}"><div class="bulk-actions" ${selectedBookmarkIds.size ? "" : "hidden"}><span>${selectedBookmarkIds.size} selected</span><button class="button danger" data-action="delete-selected">Delete selected</button><button class="button quiet" data-action="clear-selection">Clear</button></div></div>
    ${backupHealth.due && vault.bookmarks.length ? `<section class="notice backup-reminder"><span><strong>Keep a copy outside this browser.</strong><br>${escapeHtml(backupHealth.label)}. Save an encrypted backup to iCloud Drive or another backed-up folder.</span><button class="button" data-action="backup">Back up now</button></section>` : ""}
    <div id="bookmark-region">${renderBookmarkItems(visible)}</div>`;
}

function windowsPageMarkup(vault, state) {
  const historyMode = currentView === "sessions";
  const allWindows = (vault.windows || []).filter(item => Boolean(item.autoSaveId) === historyMode);
  const windows = searchWindows(allWindows, windowQuery);
  const total = windows.reduce((sum, item) => sum + item.tabs.length, 0);
  return `${topbarMarkup(historyMode ? "Session history" : "Saved windows", historyMode ? "A way back to the tabs you had open." : "Restore a window when you need it.", `<button class="button primary with-icon" data-action="tuck-window">${uiIcon("lock")}<span>Save & close window</span></button>`)}
    ${historyMode ? sessionControlsMarkup(vault) : ""}
    <section class="window-hero" ${historyMode || allWindows.length ? "hidden" : ""}><div><h2>Some tabs<br>are just for you.</h2><p>Keep selected windows and bookmarks in a local, encrypted vault, separate from your everyday browsing.</p><div class="window-stats"><span><strong>${windows.length}</strong> saved ${windows.length === 1 ? "window" : "windows"}</span><span><strong>${total}</strong> saved tabs</span></div></div><img src="${keeperAsset(state.settings?.theme)}" alt="Burrow mole"></section>
    <label class="sr-only" for="window-search">Search window names, tab titles, or addresses</label><input id="window-search" class="search" type="search" placeholder="Search windows, tabs, and addresses" value="${escapeHtml(windowQuery)}"><p class="shelf-note" id="window-result-count" role="status"></p><div id="window-results"><div class="section-heading"><div><h2>${historyMode ? "Recent windows" : "Your windows"}</h2></div><span class="shelf-note">Restoring keeps your saved copy</span></div>
    ${windows.length ? `<div class="window-grid">${windows.map(item => `<article class="window-card"><div class="window-chrome" aria-hidden="true"><i></i><i></i><i></i><span>${item.tabs.length} tabs</span></div><div class="window-card-body"><h3>${escapeHtml(item.name)}</h3><p class="window-date">Saved ${escapeHtml(new Date(item.savedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</p><ul class="tab-preview">${item.tabs.slice(0, 3).map(tab => `<li><span aria-hidden="true">${tab.pinned ? "⌖" : "↗"}</span>${escapeHtml(tab.title || tab.url)}</li>`).join("")}</ul>${item.tabs.length > 3 ? `<p class="shelf-note">+ ${item.tabs.length - 3} more tabs</p>` : ""}<div class="window-card-actions"><button class="button primary" data-action="restore-window" data-id="${escapeHtml(item.id)}">View tabs</button>${item.autoSaveId ? `<button class="button quiet" data-action="keep-session-window" data-id="${escapeHtml(item.id)}">Keep</button>` : ""}<details class="simple-details window-more"><summary>More</summary><button class="button quiet" data-action="rename-window" data-id="${escapeHtml(item.id)}">Rename</button><button class="button quiet" data-action="delete-window" data-id="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)}">Remove</button></details></div></div></article>`).join("")}</div>` : `<section class="window-empty"><span class="empty-window-icon" aria-hidden="true">${uiIcon("vault")}</span><div><h3>${windowQuery ? "No matching windows" : historyMode ? "Your next session starts here" : "No saved windows yet"}</h3><p>${windowQuery ? "Try a different name, page title, or web address." : historyMode ? "Turn on automatic saves to keep a history of your open windows." : "Open Burrow in the window you want to save and choose Save & close window."}</p></div></section>`}
    </div><p class="window-footnote">${uiIcon("lock")} Encrypted snapshots, not a Firefox lock. History and Recently Closed may still contain your pages. <button class="button quiet" data-action="backup">Backup & export ${uiIcon("export")}</button></p>`;
}

function sessionControlsMarkup(vault) {
  const settings = sessionSettings(vault);
  return `<section class="page-card session-controls"><h2>Automatic saves</h2><p>Save your open Firefox windows while this vault is unlocked. Tabs stay open. Saves pause when you lock Burrow and resume after you unlock it.</p>
    <details class="simple-details" ${settings.enabled ? "" : "open"}><summary>Automatic save settings</summary><form id="session-settings"><label class="toggle-setting"><input type="checkbox" id="session-enabled" ${settings.enabled ? "checked" : ""}><span><strong>Automatic session saving</strong><small>Free · Saved only on this device, in this vault.</small></span></label><div class="actions"><label for="session-interval">Save changes every</label><select id="session-interval">${SESSION_INTERVALS.map(minutes => `<option value="${minutes}" ${settings.intervalMinutes === minutes ? "selected" : ""}>${minutes < 60 ? `${minutes} minutes` : "hour"}</option>`).join("")}</select><button class="button primary" type="submit">Save settings</button><button class="button" id="session-save-now" type="button" ${settings.enabled && currentPaid ? "" : "disabled"}>Save now</button></div></form>
    <p class="shelf-note">Keeps the latest 30 changed sessions, up to 5,000 tabs in history. Choose Keep on any window to move a copy to Saved windows. Automatic capture supports up to 500 open web tabs at a time; unsupported windows are skipped. Your history is included in encrypted backups and export.</p></details>
    <p id="session-status" role="status">${escapeHtml(settings.status || (settings.enabled ? (currentPaid ? "Automatic saves are on. Unchanged sessions are skipped." : "Automatic saves are paused.") : "Automatic saves are off. Existing history stays available."))}</p>
    </section>`;
}

function bindSessionControls() {
  const showStatus = text => { const node = document.querySelector("#session-status"); if (node) node.textContent = text; };
  document.querySelector("#session-settings").onsubmit = async event => {
    event.preventDefault();
    const enabled = document.querySelector("#session-enabled").checked;
    if (enabled && !currentPaid) { showUpgrade(); return; }
    const intervalMinutes = Number(document.querySelector("#session-interval").value);
    const button = event.submitter;
    try {
      const access = enabled ? requestWindowAccess(browser) : Promise.resolve();
      button.disabled = true; await access;
      await sendWindowAction(browser, { type: "configure-session-saving", enabled, intervalMinutes });
      if (enabled) await sendWindowAction(browser, { type: "capture-session" });
      await renderManager();
    } catch (error) { showStatus(error.message); }
    finally { button.disabled = false; }
  };
  document.querySelector("#session-save-now").onclick = async event => {
    const button = event.currentTarget; button.disabled = true;
    try {
      const result = await sendWindowAction(browser, { type: "capture-session" });
      await renderManager();
      showStatus(result.saved ? `Saved ${result.windows} windows (${result.saved} tabs).` : result.status || "No changed session to save. Automatic saves require an unlocked vault.");
    } catch (error) { showStatus(error.message); }
    finally { button.disabled = false; }
  };
}

function showTuckWindow() {
  showDialog(`<h2>Save and close this window?</h2><p>${WINDOW_EXPLANATION}</p><div class="field"><label for="window-name">Window name</label><input id="window-name" maxlength="80" placeholder="Saved window"></div><p class="error" id="window-error" role="status"></p><div class="dialog-actions"><button class="button" data-close>Keep browsing</button><button class="button primary" id="confirm-tuck">Save window & lock vault</button></div>`);
  document.querySelector("#confirm-tuck").onclick = async (event) => {
    const button = event.currentTarget;
    try {
      const access = requestWindowAccess(browser);
      button.disabled = true;
      await access;
      const tab = await browser.tabs.getCurrent();
      await sendWindowAction(browser, { type: "tuck-window", windowId: tab.windowId, name: document.querySelector("#window-name").value });
    } catch (error) {
      const status = document.querySelector("#window-error");
      if (status) { status.textContent = error.message; button.disabled = false; }
    }
  };
}

function showRestoreWindow(id) {
  const item = currentVault.windows.find(window => window.id === id);
  if (!item) return;
  showDialog(`<h2>${escapeHtml(item.name)}</h2><p>Open ${item.tabs.length} tabs in a new window? Sites will load again using your current browser sign-ins. Your saved copy stays in the vault. You can also open just one tab below.</p><div class="saved-tab-list">${item.tabs.map((tab, index) => `<button class="saved-tab" data-open-saved-tab="${index}"><strong>${escapeHtml(tab.title || tab.url)}</strong><small>${escapeHtml(tab.url)}</small><span>Open tab ↗</span></button>`).join("")}</div><p class="error" id="window-error" role="status"></p><div class="dialog-actions"><button class="button" data-close>Not yet</button><button class="button primary" id="confirm-restore">Restore ${item.tabs.length} tabs</button></div>`);
  document.querySelectorAll("[data-open-saved-tab]").forEach(button => button.onclick = async () => {
    button.disabled = true;
    try { await sendWindowAction(browser, { type: "restore-tab", id, index: Number(button.dataset.openSavedTab) }); button.querySelector("span").textContent = "Opened"; }
    catch (error) { const status = document.querySelector("#window-error"); if (status) status.textContent = error.message; }
    finally { button.disabled = false; }
  });
  document.querySelector("#confirm-restore").onclick = async (event) => {
    event.currentTarget.disabled = true;
    try {
      await sendWindowAction(browser, { type: "restore-window", id });
      closeDialog();
    } catch (error) { const status = document.querySelector("#window-error"); if (status) { status.textContent = error.message; document.querySelector("#confirm-restore").disabled = false; } }
  };
}

function showRenameWindow(id) {
  const item = currentVault.windows.find(window => window.id === id);
  if (!item) return;
  showDialog(`<h2>Rename window</h2><form id="rename-window-form"><div class="field"><label for="rename-window-name">Window name</label><input id="rename-window-name" value="${escapeHtml(item.name)}" maxlength="80" required></div><p class="error" id="window-error" role="status"></p><div class="dialog-actions"><button class="button" type="button" data-close>Cancel</button><button class="button primary" type="submit">Save name</button></div></form>`);
  document.querySelector("#rename-window-form").onsubmit = async event => {
    event.preventDefault();
    try {
      const { vault, state } = await readUnlockedVault();
      await writeUnlockedVault(renameSavedWindow(vault, id, document.querySelector("#rename-window-name").value), { windowsChanged: true, expectedEnvelope: state.envelope });
      closeDialog(); await renderManager();
    } catch (error) { const status = document.querySelector("#window-error"); if (status) status.textContent = error.message; }
  };
}

function showDeleteWindow(id) {
  showDialog(`<h2>Remove this saved window?</h2><p>This removes its snapshot from this vault. Open tabs stay open. Export a backup first if you might want it later.</p><p class="error" id="window-error" role="status"></p><div class="dialog-actions"><button class="button" data-close>Keep it</button><button class="button danger" id="confirm-remove-window">Remove saved window</button></div>`);
  document.querySelector("#confirm-remove-window").onclick = async (event) => {
    event.currentTarget.disabled = true;
    try {
      const { vault, state } = await readUnlockedVault();
      await writeUnlockedVault({ ...vault, updatedAt: new Date().toISOString(), windows: vault.windows.filter(item => item.id !== id) }, { windowsChanged: true, expectedEnvelope: state.envelope });
      closeDialog();
      await renderManager();
    } catch (error) { const status = document.querySelector("#window-error"); if (status) { status.textContent = error.message; document.querySelector("#confirm-remove-window").disabled = false; } }
  };
}

function foldersPageMarkup(vault) {
  return `
    ${topbarMarkup("Folders", "Keep your bookmarks organized. Folders and bookmarks are unlimited.", `<button class="button primary with-icon" data-action="add">${uiIcon("add")}<span>Add link</span></button>`)}
    <div class="page-stack">
      <section class="page-card folder-create-card">
        <div><h2>Create a folder</h2><p>Organize your bookmarks into as many folders as you need.</p></div>
        <form class="inline-form" id="folder-form"><label class="sr-only" for="folder-name">Folder name</label><input id="folder-name" placeholder="Folder name" required><button class="button primary" type="submit">Add folder</button></form>
        <p class="error" id="folder-error"></p>
      </section>
      <section><div class="section-heading"><div><h2>${vault.folders.length} ${vault.folders.length === 1 ? "folder" : "folders"}</h2></div></div>
        <div class="folder-grid">${vault.folders.map((folder) => `<article class="folder-card"><span class="folder-glyph" aria-hidden="true"></span><span><strong>${escapeHtml(folder.name)}</strong><small>${vault.bookmarks.filter((item) => item.folderId === folder.id).length} bookmarks${folder.id === "inbox" ? " · Default folder" : ""}</small></span><div class="folder-actions"><button class="button quiet" data-action="folder-select" data-id="${folder.id}">Open</button><button class="button quiet" data-action="folder-rename" data-id="${folder.id}">Rename</button>${folder.id === "inbox" ? "" : `<button class="button quiet danger" data-action="folder-delete" data-id="${folder.id}">Delete</button>`}</div></article>`).join("")}</div>
      </section>
    </div>`;
}

function backupToolsMarkup(automaticBackups) {
  return `
    <div class="backup-tools" id="data-tools">
      <section class="format-card recovery-check-format">
        <div class="format-icon check-icon" aria-hidden="true">${uiIcon("check")}</div><div class="format-copy"><h2>Recovery checkup</h2><p>Confirm that this vault's recovery key or an exported encrypted backup can be opened. The check runs locally and never replaces or changes your data.</p></div>
        <div class="format-actions"><button class="button primary" id="check-recovery-key">Test recovery key</button><button class="button" id="check-backup">Test backup file</button></div>
      </section>
      <section class="format-card encrypted-format">
        <div class="format-icon" aria-hidden="true">${uiIcon("lock")}</div><div class="format-copy"><h2>Encrypted Burrow backup</h2><p>Keeps saved windows, bookmark details, folders, and vault protection together. Use this to restore Burrow on another profile or after data loss.</p></div>
        <div class="format-actions"><button class="button primary" id="encrypted-backup">Export encrypted backup</button><button class="button" id="restore-backup">Import encrypted backup</button></div>
      </section>
      <section class="format-card">
        <div class="format-icon html-icon" aria-hidden="true">${uiIcon("export")}</div><div class="format-copy"><h2>Plain bookmark HTML</h2><p>Use standard HTML to bring ordinary browser bookmarks into Burrow or export links for Firefox and other browsers. Saved window tabs are included as folders. This file is not encrypted.</p></div>
        <div class="format-actions"><button class="button" id="html-export">Export plain HTML</button><button class="button" id="import-html">Import plain HTML</button></div>
      </section>
      <section class="automatic-backup-card"><span><strong>${automaticBackups.length ? `${automaticBackups.length} automatic ${automaticBackups.length === 1 ? "backup" : "backups"} available` : "Automatic backups are ready"}</strong><small>Burrow keeps up to three encrypted copies before changes. They protect against accidental edits inside this profile, but disappear if the Firefox profile is removed.</small></span></section>
      <input id="import-html-file" type="file" accept=".html,text/html" hidden><input id="restore-backup-file" type="file" accept=".burrowmarks,application/json" hidden><input id="check-backup-file" type="file" accept=".burrowmarks,application/json" hidden>
      <p class="notice" id="backup-status" hidden aria-live="polite"></p>
    </div>`;
}

function settingsPageMarkup(state, automaticBackups) {
  const minutes = state.settings?.lockMinutes ?? 10;
  const theme = normalizeTheme(state.settings?.theme);
  const contextMenuEnabled = state.settings?.contextMenuEnabled ?? true;
  const activeVaultName = state.vaults.find((vault) => vault.id === state.activeVaultId)?.name || "this vault";
  const lockOptions = [
    { value: 1, label: "After 1 minute" }, { value: 5, label: "After 5 minutes" },
    { value: 10, label: "After 10 minutes" }, { value: 30, label: "After 30 minutes" },
    { value: 60, label: "After 1 hour" }, { value: 0, label: "Never while the browser is open" },
  ];
  const activeTab = ["main", "data", "about"].includes(currentSettingsTab) ? currentSettingsTab : "main";
  const tab = (id, label, icon) => `<button class="settings-tab" id="settings-tab-${id}" type="button" role="tab" data-settings-tab="${id}" aria-controls="settings-panel-${id}" aria-selected="${activeTab === id}" tabindex="${activeTab === id ? "0" : "-1"}">${uiIcon(icon)}<span>${label}</span></button>`;
  return `
    ${topbarMarkup("Settings", `Appearance is saved for ${escapeHtml(activeVaultName)}. Other settings apply to Burrow.`)}
    <div class="settings-page page-stack">
      <nav class="settings-tabs" role="tablist" aria-label="Settings sections">
        ${tab("main", "Main", "settings")}
        ${tab("data", "Import, export & backup", "export")}
        ${tab("about", "About", "help")}
      </nav>
      <div class="settings-panels">
        <section class="settings-panel settings-main-panel" id="settings-panel-main" role="tabpanel" aria-labelledby="settings-tab-main" data-settings-panel="main" ${activeTab === "main" ? "" : "hidden"}>
          <section class="page-card"><fieldset class="theme-fieldset settings-themes"><legend>Appearance</legend><p>Pick the atmosphere that feels right. Protection is identical in every theme.</p>${themeChoices(theme)}</fieldset></section>
          <section class="page-card settings-security"><div class="field"><label for="lock-minutes">Lock the vault</label><select id="lock-minutes">${lockOptions.map((option) => `<option value="${option.value}" ${minutes === option.value ? "selected" : ""}>${option.label}</option>`).join("")}</select><small>The “Never” option still locks the vault when the browser closes.</small></div><label class="toggle-setting"><input id="context-menu-enabled" type="checkbox" ${contextMenuEnabled ? "checked" : ""}><span><strong>Show the right-click save option</strong><small>Add “Add this page to Burrow” and “Add this link to Burrow” to Firefox’s right-click menus.</small></span></label><div class="setting-row"><span><strong>Master password</strong><small>Change it without replacing your recovery key.</small></span><button class="button" id="change-password">Change password</button></div><div class="notice">Burrow encrypts the collection stored in your vault. Firefox clears the unlocked session when it closes.</div></section>
          <p class="settings-saved" id="settings-saved" aria-live="polite"></p>
        </section>
        <section class="settings-panel" id="settings-panel-data" role="tabpanel" aria-labelledby="settings-tab-data" data-settings-panel="data" ${activeTab === "data" ? "" : "hidden"}>
          <section class="page-card settings-section-heading"><span class="section-icon">${uiIcon("export")}</span><div><h2>Import, export, and backups</h2><p>Move a vault, bring bookmarks in, or keep a copy outside this Firefox profile.</p></div></section>
          ${backupToolsMarkup(automaticBackups)}
        </section>
        <section class="settings-panel" id="settings-panel-about" role="tabpanel" aria-labelledby="settings-tab-about" data-settings-panel="about" ${activeTab === "about" ? "" : "hidden"}>
          <section class="page-card settings-about"><img src="${themeMoleAsset(theme)}" alt="Burrow mole"><div><h2>Burrow ${escapeHtml(browser.runtime.getManifest().version || "")}</h2><p>Create multiple independently locked local vaults, each with its own password, recovery key, backup history, and theme. Tabs, bookmarks, and everyday tools are free.</p><div class="actions"><a class="button with-icon" href="https://barryanders.github.io/" target="_blank" rel="noopener">${uiIcon("vault")}<span>Anders</span></a><button class="button with-icon" data-action="report">${uiIcon("help")}<span>Report a problem</span></button></div></div></section>
        </section>
      </div>
    </div>`;
}

async function renderManager(query = "", { touch = true } = {}) {
  const [{ vault, state }, paid] = await Promise.all([readUnlockedVault({ touch }), isPaid()]);
  if (vault.pendingBookmark) {
    await writeUnlockedVault(savePendingBookmark(vault));
    return renderManager();
  }
  currentVault = vault;
  currentPaid = paid;
  currentTotalBookmarks = await getTotalBookmarkCount(vault);
  const bookmarkIds = new Set(vault.bookmarks.map((bookmark) => bookmark.id));
  selectedBookmarkIds = new Set([...selectedBookmarkIds].filter((id) => bookmarkIds.has(id)));
  const backupHealth = getBackupHealth(state, vault);
  const visible = searchBookmarks(vault, query).filter((bookmark) => !currentFolderId || bookmark.folderId === currentFolderId);
  const folderName = currentFolderId ? vault.folders.find((folder) => folder.id === currentFolderId)?.name : null;
  const capacity = "Unlimited tabs & bookmarks";
  const activeVaultName = state.vaults.find((item) => item.id === state.activeVaultId)?.name || "Primary vault";
  let mainMarkup = bookmarksPageMarkup(vault, visible, backupHealth, folderName, query);
  if (["windows", "sessions"].includes(currentView)) mainMarkup = windowsPageMarkup(vault, state);
  if (currentView === "folders") mainMarkup = foldersPageMarkup(vault);
  if (currentView === "settings") mainMarkup = settingsPageMarkup(state, await getAutomaticBackups());
  setMarkup(app, `
    <div class="shell">
      <aside class="sidebar">
        <header class="brand"><img src="${iconStyleAsset(effectiveIconStyle(state.settings?.theme), 128)}" alt=""><span><strong>Burrow</strong><button class="vault-switcher" data-action="vault-menu" aria-label="Switch or create a vault"><span>${escapeHtml(activeVaultName)}</span>${uiIcon("chevron")}</button></span></header>
        <nav class="nav"><button data-action="windows" ${currentView === "windows" ? 'aria-current="page"' : ""}><span class="nav-label">${uiIcon("vault")}<span>Saved windows</span></span><small class="nav-count">${(vault.windows || []).filter(item => !item.autoSaveId).length}</small></button><button data-action="sessions" ${currentView === "sessions" ? 'aria-current="page"' : ""}><span class="nav-label">${uiIcon("restore")}<span>Session history</span></span></button><button data-action="folder-select" data-id="" ${currentView === "bookmarks" && !currentFolderId ? 'aria-current="page"' : ""}><span class="nav-label">${uiIcon("bookmarks")}<span>Bookmarks</span></span></button>${vault.folders.map((folder) => `<button class="nav-folder" data-action="folder-select" data-id="${folder.id}" ${currentView === "bookmarks" && currentFolderId === folder.id ? 'aria-current="page"' : ""}><span class="nav-label">${uiIcon("folder")}<span>${escapeHtml(folder.name)}</span></span><small class="nav-count" aria-label="${vault.bookmarks.filter((item) => item.folderId === folder.id).length} bookmarks">${vault.bookmarks.filter((item) => item.folderId === folder.id).length}</small></button>`).join("")}<button data-action="folders" ${currentView === "folders" ? 'aria-current="page"' : ""}><span class="nav-label">${uiIcon("folders")}<span>Manage folders</span></span></button><button data-action="backup"><span class="nav-label">${uiIcon("export")}<span>Backup & export</span></span></button><button data-action="settings" ${currentView === "settings" ? 'aria-current="page"' : ""}><span class="nav-label">${uiIcon("settings")}<span>Settings</span></span></button>${paid ? "" : `<button class="nav-upgrade" data-action="upgrade"><span class="nav-label">${uiIcon("add")}<span>Get Burrow Lifetime</span></span></button>`}</nav>
        <div class="sidebar-footer"><div class="plan-summary"><span><strong>${paid ? "Free — all features" : "Free plan"}</strong><small>${capacity}</small></span>${paid ? "" : '<button class="plan-upgrade" data-action="upgrade">Upgrade</button>'}</div></div>
      </aside>
      <main class="main">${mainMarkup}</main>
    </div>
    <div class="overlay" id="dialog-overlay" hidden><section class="dialog card" id="dialog" role="dialog" aria-modal="true" aria-label="Burrow action"></section></div>`);
  bindManagerEvents();
  document.querySelector("#window-search")?.addEventListener("input", event => {
    windowQuery = event.target.value;
    const parsed = new DOMParser().parseFromString(windowsPageMarkup(currentVault, state), "text/html");
    document.querySelector("#window-results").replaceChildren(...parsed.querySelector("#window-results").childNodes);
    document.querySelector("#window-result-count").textContent = `${searchWindows((currentVault.windows || []).filter(item => Boolean(item.autoSaveId) === (currentView === "sessions")), windowQuery).length} matching windows`;
  });
  if (currentView === "sessions") bindSessionControls();
  if (currentView === "folders") bindFolderPage();
  if (currentView === "settings") bindSettingsPage();

  const params = new URLSearchParams(location.search);
  if (params.get("view") === "windows" || params.has("windowResult")) history.replaceState({}, "", "manager.html");
  if (params.get("view") === "upgrade") showUpgrade();
  if (params.get("action") === "save" && params.get("url")) {
    const existing = findBookmarkByUrl(currentVault, params.get("url"));
    if (existing) showAlreadySavedDialog(existing);
    else showBookmarkDialog({ title: params.get("title") || "", url: params.get("url") });
    history.replaceState({}, "", "manager.html");
  }
}

function showAlreadySavedDialog(bookmark) {
  showDialog(`<h2>${escapeHtml(bookmark.title)}</h2><p>This page is already in Burrow.</p><div class="dialog-actions"><button class="button danger" id="remove-existing">Remove bookmark</button><button class="button" data-close>Keep it</button><button class="button primary" id="edit-existing">Edit bookmark</button></div>`);
  document.querySelector("#edit-existing").onclick = () => showBookmarkDialog(bookmark);
  document.querySelector("#remove-existing").onclick = () => showDeleteConfirmation([bookmark.id]);
}

function bindManagerEvents() {
  document.querySelector("#search")?.addEventListener("input", (event) => {
    setMarkup(document.querySelector("#bookmark-region"), renderBookmarkItems(searchBookmarks(currentVault, event.target.value).filter((bookmark) => !currentFolderId || bookmark.folderId === currentFolderId)));
  });
  document.querySelectorAll("[data-select-id]").forEach((input) => input.addEventListener("change", () => {
    if (input.checked) selectedBookmarkIds.add(input.dataset.selectId);
    else selectedBookmarkIds.delete(input.dataset.selectId);
    renderManager(document.querySelector("#search")?.value || "");
  }));
  app.onclick = (event) => {
    const button = event.target.closest("[data-action]");
    if (button) handleAction(button.dataset.action, button.dataset.id);
  };
}

function closeDialog() {
  document.querySelector("#dialog-overlay").hidden = true;
  dialogCloseCallback?.();
  dialogCloseCallback = null;
  dialogReturnFocus?.focus();
}

function showDialog(content) {
  dialogReturnFocus = document.activeElement;
  dialogCloseCallback = null;
  const overlay = document.querySelector("#dialog-overlay");
  overlay.hidden = false;
  setMarkup(document.querySelector("#dialog"), content);
  const dialog = document.querySelector("#dialog");
  dialog.querySelector("input, button, textarea, select, a[href]")?.focus();
  dialog.onkeydown = (event) => {
    if (event.key === "Escape") { event.preventDefault(); closeDialog(); }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea, select, a[href]")];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  overlay.onclick = (event) => { if (event.target === overlay) closeDialog(); };
  document.querySelectorAll("[data-close]").forEach((button) => button.onclick = closeDialog);
}

function showBookmarkDialog(bookmark = {}) {
  const editing = Boolean(bookmark.id);
  showDialog(`
    <h2>${editing ? "Edit private link" : "Add a private link"}</h2>
    <p>Its title and address will be encrypted inside your vault.</p>
    <form id="bookmark-form">
      <div class="field"><label for="bookmark-title">Title</label><input id="bookmark-title" value="${escapeHtml(bookmark.title || "")}" required></div>
      <div class="field"><label for="bookmark-url">Web address</label><input id="bookmark-url" type="text" inputmode="url" placeholder="example.com" value="${escapeHtml(bookmark.url || "")}" required></div>
      <div class="field"><label for="bookmark-notes">Private note (optional)</label><textarea id="bookmark-notes">${escapeHtml(bookmark.notes || "")}</textarea></div>
      <div class="field"><label for="bookmark-folder">Folder</label><select id="bookmark-folder">${currentVault.folders.map((folder) => `<option value="${folder.id}" ${folder.id === (bookmark.folderId || "inbox") ? "selected" : ""}>${escapeHtml(folder.name)}</option>`).join("")}</select></div>
      <p class="error" id="bookmark-error"></p>
      <div class="dialog-actions">${editing ? '<button class="button danger" type="button" id="delete-bookmark">Delete</button>' : ""}<button class="button" type="button" data-close>Cancel</button><button class="button primary" type="submit">${editing ? "Save changes" : "Save privately"}</button></div>
    </form>`);
  document.querySelector("#bookmark-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const values = {
        title: document.querySelector("#bookmark-title").value,
        url: document.querySelector("#bookmark-url").value,
        notes: document.querySelector("#bookmark-notes").value,
        folderId: document.querySelector("#bookmark-folder")?.value || bookmark.folderId || "inbox",
      };
      currentVault = editing
        ? updateBookmark(currentVault, bookmark.id, values)
        : addBookmark(currentVault, values, { paid: currentPaid, totalBookmarks: currentTotalBookmarks });
      await writeUnlockedVault(currentVault);
      closeDialog();
      await renderManager(document.querySelector("#search")?.value || "");
    } catch (error) {
      document.querySelector("#bookmark-error").textContent = error.message;
    }
  };
  document.querySelector("#delete-bookmark")?.addEventListener("click", async () => {
    currentVault = removeBookmark(currentVault, bookmark.id);
    await writeUnlockedVault(currentVault);
    closeDialog();
    await renderManager();
  });
}

function showUpgrade() {
  showDialog(`<h2>All features are free</h2><p>Automatic session saving and every theme are included. No license key is needed.</p><div class="dialog-actions"><button class="button primary" data-close>Done</button></div>`);
}

async function showBackup() {
  currentView = "settings";
  currentSettingsTab = "data";
  currentFolderId = null;
  await renderManager();
}

async function showVaultMenu() {
  const state = await getStoredState();
  showDialog(`
    <h2>Switch or create a vault</h2>
    <p>Switching locks the current vault. Each vault opens with its own password or recovery key.</p>
    <div class="vault-options">${state.vaults.map((vault) => `<button class="vault-option" data-vault-id="${vault.id}" ${vault.id === state.activeVaultId ? 'aria-current="true"' : ""}><span class="vault-option-icon">${uiIcon("vault")}</span><span><strong>${escapeHtml(vault.name)}</strong><small>${themeDisplayName(vault.theme)} · ${vault.id === state.activeVaultId ? "Current vault" : "Switch and unlock"}</small></span>${uiIcon("chevron")}</button>`).join("")}</div>
    <div class="dialog-actions"><button class="button" data-close>Cancel</button><button class="button primary with-icon" id="create-vault-from-menu">${uiIcon("add")}<span>Create new vault</span></button></div>`);
  document.querySelectorAll("[data-vault-id]").forEach((button) => button.addEventListener("click", async () => {
    if (button.dataset.vaultId === state.activeVaultId) { closeDialog(); return; }
    await lockVault();
    const nextState = await selectVault(button.dataset.vaultId);
    closeDialog();
    await renderGate({ selectedTheme: nextState.settings?.theme });
  }));
  document.querySelector("#create-vault-from-menu").onclick = async () => {
    await lockVault();
    closeDialog();
    await renderGate({ setup: true, adding: true, selectedTheme: state.settings?.theme });
  };
}

function bindBackupPage() {
  document.querySelector("#check-recovery-key").onclick = showRecoveryKeyCheck;
  document.querySelector("#check-backup").onclick = () => {
    const input = document.querySelector("#check-backup-file");
    input.value = "";
    input.click();
  };
  document.querySelector("#check-backup-file").onchange = async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      showBackupCheck(validateEncryptedBackup(await readJsonFile(file)));
    } catch (error) {
      const status = document.querySelector("#backup-status");
      status.hidden = false;
      status.textContent = error.message;
    }
  };
  document.querySelector("#encrypted-backup").onclick = async () => {
    const state = await getActiveVaultBackupState();
    await downloadText(`burrow-backup-${new Date().toISOString().slice(0, 10)}.burrowmarks`, JSON.stringify({ format: "burrowmarks-backup", version: 1, state }, null, 2), "application/json");
    await recordEncryptedBackupDownload();
    const status = document.querySelector("#backup-status");
    status.hidden = false;
    status.textContent = "Encrypted backup saved. Keep it somewhere protected, such as iCloud Drive.";
  };
  document.querySelector("#html-export").onclick = () => downloadText("burrow-export.html", vaultToBookmarkHtml(currentVault), "text/html");
  document.querySelector("#import-html").onclick = () => document.querySelector("#import-html-file").click();
  document.querySelector("#import-html-file").onchange = async (event) => {
    const result = importBookmarkHtml(currentVault, await readTextFile(event.target.files[0]), { paid: currentPaid, totalBookmarks: currentTotalBookmarks });
    currentVault = result.vault;
    await writeUnlockedVault(currentVault);
    const status = document.querySelector("#backup-status");
    status.hidden = false;
    status.textContent = `Imported ${result.imported} links${result.skipped ? `; skipped ${result.skipped} duplicate, unsupported, or over-capacity links` : ""}.`;
  };
  document.querySelector("#restore-backup").onclick = () => document.querySelector("#restore-backup-file").click();
  document.querySelector("#restore-backup-file").onchange = async (event) => {
    try {
      const backup = await readJsonFile(event.target.files[0]);
      if (backup.format !== "burrowmarks-backup" || !backup.state?.envelope) throw new Error("That is not a Burrow backup.");
      showRestoreBackup(backup);
    } catch (error) { const status = document.querySelector("#backup-status"); status.hidden = false; status.textContent = error.message; }
  };
}

function checkupSummary(result) {
  const bookmarks = `${result.bookmarkCount} ${result.bookmarkCount === 1 ? "bookmark" : "bookmarks"}`;
  const folders = `${result.folderCount} ${result.folderCount === 1 ? "folder" : "folders"}`;
  return `${bookmarks} across ${folders}, plus ${result.windowCount} saved windows (${result.tabCount} tabs)`;
}

function showRecoveryKeyCheck() {
  showDialog(`<h2>Test this vault's recovery key</h2><p>Enter the recovery key you saved when creating this vault. Burrow will decrypt a temporary copy in memory without changing the vault.</p><form id="recovery-check-form"><div class="field"><label for="recovery-check-secret">Recovery key</label><textarea id="recovery-check-secret" autocomplete="off" required></textarea></div><p class="error" id="recovery-check-error"></p><div class="dialog-actions"><button class="button" type="button" data-close>Cancel</button><button class="button primary" type="submit">Test recovery key</button></div></form>`);
  document.querySelector("#recovery-check-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const state = await getStoredState();
      const result = await verifyRecoveryKey(state.envelope, document.querySelector("#recovery-check-secret").value);
      showDialog(`<h2>Your recovery key works.</h2><p>It successfully opened ${checkupSummary(result)}. Nothing in the vault was changed.</p><div class="notice">Keep the recovery key somewhere private and separate from this Firefox profile.</div><div class="dialog-actions"><button class="button primary" data-close>Done</button></div>`);
    } catch (error) {
      document.querySelector("#recovery-check-error").textContent = error.message;
    }
  };
}

function showBackupCheck(backup) {
  showDialog(`<h2>Test this encrypted backup</h2><p>Enter the master password or recovery key that belonged to this file. The backup will be checked in memory and will not replace your current vault.</p><form id="backup-check-form"><div class="field"><label for="backup-check-secret">Master password or recovery key</label><input id="backup-check-secret" type="password" autocomplete="off" required></div><p class="error" id="backup-check-error"></p><div class="dialog-actions"><button class="button" type="button" data-close>Cancel</button><button class="button primary" type="submit">Test backup</button></div></form>`);
  document.querySelector("#backup-check-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const result = await verifyEncryptedBackup(backup, document.querySelector("#backup-check-secret").value);
      showDialog(`<h2>This backup can be recovered.</h2><p>It opened with the ${result.unlockMethod} and contains ${checkupSummary(result)}. Your current vault was not changed.</p><div class="dialog-actions"><button class="button primary" data-close>Done</button></div>`);
    } catch (error) {
      document.querySelector("#backup-check-error").textContent = error.message;
    }
  };
}

function showRestoreBackup(backup) {
  showDialog(`<h2>Unlock this backup</h2><p>Enter the master password or recovery key that belonged to the backup. Nothing is replaced until the file unlocks successfully.</p><form id="restore-backup-form"><div class="field"><label for="backup-secret">Master password or recovery key</label><input id="backup-secret" type="password" autocomplete="off" required></div><p class="error" id="restore-error"></p><div class="dialog-actions"><button class="button" type="button" id="restore-back">Back</button><button class="button primary" type="submit">Verify and restore</button></div></form>`);
  document.querySelector("#restore-back").onclick = () => { closeDialog(); showBackup(); };
  document.querySelector("#restore-backup-form").onsubmit = async (event) => {
    event.preventDefault();
    const secret = document.querySelector("#backup-secret").value;
    try {
      let unlocked;
      try { unlocked = await unlockWithPassword(backup.state.envelope, secret); }
      catch { unlocked = await unlockWithRecoveryCode(backup.state.envelope, secret); }
      await restoreBackupState(backup.state, unlocked.dataKey);
      closeDialog();
      await renderManager();
    } catch (error) {
      document.querySelector("#restore-error").textContent = error.message;
    }
  };
}

async function handleAction(action, id) {
  if (action === "sessions") { currentView = "sessions"; currentFolderId = null; windowQuery = ""; await renderManager(); }
  if (action === "keep-session-window") {
    try {
      const { vault, state } = await readUnlockedVault();
      const item = vault.windows.find(item => item.id === id);
      if (!item?.autoSaveId) return;
      const copy = { ...item, id: `window_${crypto.randomUUID()}` }; delete copy.autoSaveId;
      await writeUnlockedVault({ ...vault, windows: [copy, ...vault.windows] }, { windowsChanged: true, expectedEnvelope: state.envelope });
      currentView = "windows"; windowQuery = ""; await renderManager();
    } catch (error) { showDialog(`<h2>Window not saved</h2><p>${escapeHtml(error.message)}</p><button class="button" data-close>Close</button>`); }
  }
  if (action === "windows") { currentView = "windows"; currentFolderId = null; await renderManager(); }
  if (action === "tuck-window") showTuckWindow();
  if (action === "restore-window") showRestoreWindow(id);
  if (action === "rename-window") showRenameWindow(id);
  if (action === "delete-window") showDeleteWindow(id);
  if (action === "add") showBookmarkDialog();
  if (action === "edit") showBookmarkDialog(currentVault.bookmarks.find((item) => item.id === id));
  if (action === "delete") showDeleteConfirmation([id]);
  if (action === "delete-selected") showDeleteConfirmation([...selectedBookmarkIds]);
  if (action === "clear-selection") { selectedBookmarkIds.clear(); await renderManager(document.querySelector("#search")?.value || ""); }
  if (action === "open") browser.tabs.create({ url: currentVault.bookmarks.find((item) => item.id === id).url });
  if (action === "backup") await showBackup();
  if (action === "upgrade") showUpgrade();
  if (action === "lock") { currentVault = null; await lockVault(); renderGate(); }
  if (action === "vault-menu") await showVaultMenu();
  if (action === "folders") { currentView = "folders"; currentFolderId = null; await renderManager(); }
  if (action === "settings") { currentView = "settings"; currentSettingsTab = "main"; currentFolderId = null; await renderManager(); }
  if (action === "report") browser.tabs.create({ url: problemReportUrl() });
  if (action === "folder-select") { currentView = "bookmarks"; currentFolderId = id || null; await renderManager(); }
  if (action === "folder-rename") showFolderRenameDialog(id);
  if (action === "folder-delete") showFolderDeleteConfirmation(id);
}

function showDeleteConfirmation(ids) {
  const count = ids.length;
  showDialog(`<h2>Delete ${count === 1 ? "this bookmark" : `${count} bookmarks`}?</h2><p>${count === 1 ? "It will be removed from your private vault." : "The selected bookmarks will be removed together."}</p><div class="dialog-actions"><button class="button" data-close>Cancel</button><button class="button danger" id="confirm-delete">Delete</button></div>`);
  document.querySelector("#confirm-delete").onclick = async () => {
    currentVault = removeBookmarks(currentVault, ids);
    selectedBookmarkIds.clear();
    await writeUnlockedVault(currentVault);
    closeDialog();
    await renderManager();
  };
}

function bindFolderPage() {
  document.querySelector("#folder-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      currentVault = addFolder(currentVault, document.querySelector("#folder-name").value);
      await writeUnlockedVault(currentVault);
      await renderManager();
    } catch (error) { document.querySelector("#folder-error").textContent = error.message; }
  };
}

function showFolderRenameDialog(id) {
  const folder = currentVault.folders.find((item) => item.id === id);
  if (!folder) return;
  showDialog(`<h2>Rename folder</h2><form id="folder-rename-form"><div class="field"><label for="folder-rename-name">Folder name</label><input id="folder-rename-name" value="${escapeHtml(folder.name)}" required></div><p class="error" id="folder-rename-error"></p><div class="dialog-actions"><button class="button" type="button" data-close>Cancel</button><button class="button primary" type="submit">Save name</button></div></form>`);
  const input = document.querySelector("#folder-rename-name");
  input.focus();
  input.select();
  document.querySelector("#folder-rename-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      currentVault = renameFolder(currentVault, id, input.value);
      await writeUnlockedVault(currentVault);
      closeDialog();
      await renderManager();
    } catch (error) {
      document.querySelector("#folder-rename-error").textContent = error.message;
    }
  };
}

function showFolderDeleteConfirmation(id) {
  const folder = currentVault.folders.find((item) => item.id === id);
  if (!folder || folder.id === "inbox") return;
  const count = currentVault.bookmarks.filter((bookmark) => bookmark.folderId === id).length;
  const fallbackName = currentVault.folders.find((item) => item.id === "inbox")?.name || "Unfiled";
  showDialog(`<h2>Delete “${escapeHtml(folder.name)}”?</h2><p>${count ? `${count} ${count === 1 ? "bookmark" : "bookmarks"} will move to ${escapeHtml(fallbackName)}. No bookmarks will be deleted.` : "The empty folder will be removed."}</p><div class="dialog-actions"><button class="button" data-close>Cancel</button><button class="button danger" id="confirm-folder-delete">Delete folder</button></div>`);
  document.querySelector("#confirm-folder-delete").onclick = async () => {
    currentVault = removeFolder(currentVault, id);
    if (currentFolderId === id) currentFolderId = null;
    await writeUnlockedVault(currentVault);
    closeDialog();
    await renderManager();
  };
}

function bindSettingsPage() {
  bindBackupPage();

  const settingsTabs = [...document.querySelectorAll("[data-settings-tab]")];
  const selectSettingsTab = (tabName, { focus = false } = {}) => {
    if (!["main", "data", "about"].includes(tabName)) return;
    currentSettingsTab = tabName;
    settingsTabs.forEach((tabButton) => {
      const selected = tabButton.dataset.settingsTab === tabName;
      tabButton.setAttribute("aria-selected", String(selected));
      tabButton.tabIndex = selected ? 0 : -1;
      if (selected && focus) tabButton.focus();
    });
    document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.settingsPanel !== tabName;
    });
  };
  settingsTabs.forEach((tabButton, index) => {
    tabButton.addEventListener("click", () => selectSettingsTab(tabButton.dataset.settingsTab));
    tabButton.addEventListener("keydown", (event) => {
      let nextIndex = null;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % settingsTabs.length;
      if (event.key === "ArrowLeft") nextIndex = (index - 1 + settingsTabs.length) % settingsTabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = settingsTabs.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      selectSettingsTab(settingsTabs[nextIndex].dataset.settingsTab, { focus: true });
    });
  });

  const saveImmediately = async () => {
    const latestState = await getStoredState();
    const lockMinutes = Number(document.querySelector("#lock-minutes").value);
    const nextTheme = normalizeTheme(document.querySelector('input[name="theme"]:checked')?.value);
    if (!canSelectTheme(nextTheme, await isPaid(), latestState.settings.theme)) {
      document.querySelector(`input[name="theme"][value="${normalizeTheme(latestState.settings.theme)}"]`).checked = true;
      showUpgrade();
      return false;
    }
    const nextIconStyle = effectiveIconStyle(nextTheme);
    const nextContextMenuEnabled = document.querySelector("#context-menu-enabled").checked;
    const dataKey = await getSessionKey({ touch: false });
    const nextVaults = latestState.vaults.map((vault) => vault.id === latestState.activeVaultId
      ? { ...vault, theme: nextTheme, iconStyle: nextIconStyle }
      : vault);
    await saveStoredState({ ...latestState, vaults: nextVaults, settings: { ...latestState.settings, lockMinutes, theme: nextTheme, iconStyle: nextIconStyle, contextMenuEnabled: nextContextMenuEnabled } });
    if (dataKey) await setSessionKey(dataKey, lockMinutes);
    await browser.runtime.sendMessage({ type: "context-menu-setting", enabled: nextContextMenuEnabled });
    applyTheme(nextTheme);
    const brandIcon = document.querySelector(".brand img");
    if (brandIcon) brandIcon.src = iconStyleAsset(effectiveIconStyle(nextTheme), 128);
    document.querySelector("#settings-saved").textContent = "Saved";
  };

  document.querySelectorAll('input[name="theme"]').forEach((input) => input.addEventListener("change", async () => {
    if (await saveImmediately() === false) return;
    await renderManager();
  }));
  document.querySelector("#lock-minutes").addEventListener("change", saveImmediately);
  document.querySelector("#context-menu-enabled").addEventListener("change", saveImmediately);
  document.querySelector("#change-password").onclick = showChangePassword;
}

function showChangePassword() {
  showDialog(`<h2>Change master password</h2><p>Your bookmarks and recovery key stay the same. The old password stops working as soon as this change succeeds.</p><form id="password-change-form"><div class="field"><label for="current-password">Current master password</label><input id="current-password" type="password" autocomplete="current-password" required></div><div class="field"><label for="next-password">New master password</label><input id="next-password" type="password" autocomplete="new-password" required><small>Use any password you will remember. Longer, unique passwords provide stronger protection.</small></div><div class="field"><label for="confirm-next-password">Confirm new password</label><input id="confirm-next-password" type="password" autocomplete="new-password" required></div><p class="error" id="password-change-error"></p><div class="dialog-actions"><button class="button" type="button" id="password-change-back">Back</button><button class="button primary" type="submit">Change password</button></div></form>`);
  document.querySelector("#password-change-back").onclick = () => { closeDialog(); currentView = "settings"; renderManager(); };
  document.querySelector("#password-change-form").onsubmit = async (event) => {
    event.preventDefault();
    const currentPassword = document.querySelector("#current-password").value;
    const newPassword = document.querySelector("#next-password").value;
    const confirmation = document.querySelector("#confirm-next-password").value;
    try {
      if (newPassword !== confirmation) throw new Error("The new passwords do not match.");
      await changeVaultPassword(currentPassword, newPassword);
      showDialog(`<h2>Password updated.</h2><p>The old master password no longer works. Your existing recovery key remains valid.</p><div class="dialog-actions"><button class="button primary" data-close>Done</button></div>`);
    } catch (error) {
      document.querySelector("#password-change-error").textContent = error.message;
    }
  };
}

async function start() {
  await browser.runtime.sendMessage?.({ type: "manager-ready" });
  const state = await getStoredState();
  if (!state?.envelope) {
    applyTheme(DEFAULT_THEME);
    renderGate({ setup: true, selectedTheme: DEFAULT_THEME });
    return;
  }
  applyTheme(state.settings?.theme);
  if (!(await getSessionKey({ touch: false }))) { renderGate(); return; }
  await renderManager();
}

start().catch((error) => {
  setMarkup(app, `<main class="gate"><section class="gate-card card"><h1>Burrow needs attention</h1><p class="error">${escapeHtml(error.message)}</p></section></main>`);
});

browser.storage.onChanged?.addListener((changes, areaName) => {
  if (areaName === "session" && changes.burrowmarksSession && !changes.burrowmarksSession.newValue) {
    clearTimeout(liveRefreshTimer);
    currentVault = null;
    selectedBookmarkIds.clear();
    renderGate();
    return;
  }
  if (areaName !== "local" || !changes.burrowmarksState || !currentVault) return;
  if (!document.querySelector("#dialog-overlay")?.hidden) return;
  clearTimeout(liveRefreshTimer);
  liveRefreshTimer = setTimeout(() => renderManager(document.querySelector("#search")?.value || "", { touch: false }).catch(() => renderGate()), 25);
});
