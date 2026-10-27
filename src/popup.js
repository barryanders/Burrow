import { themeArt } from "./lib/theme.js";
import { WINDOW_EXPLANATION, requestWindowAccess, sendWindowAction } from "./lib/window-ui.js";
import { hasVault, unlockVault, lockVault } from "./lib/service.js";
import { getSessionKey, getStoredState, getTotalBookmarkCount, isPaid, readUnlockedVault, writeUnlockedVault, selectVault } from "./lib/storage.js";
import { addBookmark, findBookmarkByUrl, removeBookmark } from "./lib/vault.js";
import { applyTheme } from "./lib/theme.js";

const browser = globalThis.browser ?? globalThis.chrome;
const content = document.querySelector("#popup-content");

function escapeHtml(value = "") {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function setMarkup(target, markup) {
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  target.replaceChildren(...parsed.body.childNodes);
}

async function openManager(parameters = "") {
  await browser.runtime.sendMessage({ type: "open-manager", parameters });
  window.close();
}

async function activeTab() {
  return (await browser.tabs.query({ active: true, currentWindow: true }))[0];
}

async function render() {
  const state = await getStoredState();
  applyTheme(state?.settings?.theme);
  if (!(await hasVault())) {
    setMarkup(content, `
      <h1>Some tabs and bookmarks are just for you.</h1>
      <p class="subtitle">Save tabs and bookmarks behind a password. They stay on this device.</p>
      <button class="button primary" id="open-setup">Create my vault</button>`);
    document.querySelector("#open-setup").onclick = () => openManager();
    return;
  }

  if (!(await getSessionKey({ touch: false }))) {
    const vaults = state.vaults || [];
    setMarkup(content, `
      <img class="popup-mascot" src="${themeArt(document.documentElement.dataset.theme, "locked")}" alt="Burrow mole resting"><h1>Vault locked.</h1>
      ${vaults.length > 1 ? `<div class="field"><label for="popup-vault">Vault</label><select id="popup-vault">${vaults.map(vault => `<option value="${escapeHtml(vault.id)}" ${vault.id === state.activeVaultId ? "selected" : ""}>${escapeHtml(vault.name)}</option>`).join("")}</select></div>` : `<p class="subtitle">${escapeHtml(vaults[0]?.name || "Your vault")}</p>`}
      <form id="unlock-form">
        <div class="field"><label for="password">Vault password</label><input id="password" type="password" autocomplete="current-password" required autofocus></div>
        <p class="error" id="unlock-error"></p>
        <button class="button primary" type="submit">Unlock</button>
      </form>
      <button class="button quiet" id="open-manager">Use recovery key or manage vault</button>`);
    document.querySelector("#popup-vault")?.addEventListener("change", async event => {
      try { await selectVault(event.target.value); await render(); }
      catch (error) { document.querySelector("#unlock-error").textContent = error.message; }
    });
    document.querySelector("#unlock-form").onsubmit = async (event) => {
      event.preventDefault();
      try {
        await unlockVault(document.querySelector("#password").value);
        await render();
      } catch (error) {
        document.querySelector("#unlock-error").textContent = error.message;
      }
    };
    document.querySelector("#open-manager").onclick = () => openManager();
    return;
  }

  const [{ vault }, paid, tab] = await Promise.all([readUnlockedVault(), isPaid(), activeTab()]);
  const totalBookmarks = await getTotalBookmarkCount(vault);
  const canSave = /^https?:/.test(tab?.url || "");
  const existing = canSave ? findBookmarkByUrl(vault, tab.url) : null;
  setMarkup(content, `
    <div class="popup-vault-heading"><strong>${escapeHtml(state.vaults?.find(item => item.id === state.activeVaultId)?.name || "Your vault")}</strong><button class="button quiet" id="lock-vault">Lock vault</button></div>
    <section class="popup-window"><h1>Save this window</h1><p>Save its tabs, close them, and lock your vault.</p><button class="button primary" id="tuck-window">Save & close window</button><button class="button quiet" id="saved-windows">Open saved windows</button></section>
    <h2 class="popup-section-title">${existing ? "This page is already saved." : canSave ? "Add this page to Burrow?" : "Your vault is open."}</h2>
    <p class="subtitle">${canSave ? escapeHtml(tab.title || tab.url) : "Open the manager to search your private links."}</p>
    ${canSave && !existing ? '<button class="button" id="save-page">Save this tab</button>' : ""}
    ${existing ? '<details class="simple-details"><summary>Saved bookmark options</summary><button class="button danger" id="remove-page">Remove bookmark</button></details>' : ""}
    <div class="popup-footer-actions"><button class="button" id="open-manager">Open Burrow</button></div>
    <p class="popup-meta">Locking protects saved items. Open Firefox tabs stay accessible.</p>
    <p class="error" id="save-error"></p>`);
  document.querySelector("#open-manager").onclick = () => openManager();
  document.querySelector("#lock-vault").onclick = async () => { await lockVault(); await render(); };
  document.querySelector("#saved-windows").onclick = () => openManager("?view=windows");
  document.querySelector("#tuck-window").onclick = () => {
    setMarkup(content, `<h1>Save and close this window?</h1><p class="subtitle">${WINDOW_EXPLANATION}</p><div class="field"><label for="window-name">Window name</label><input id="window-name" maxlength="80" placeholder="Saved window"></div><p class="error" id="window-error" role="status"></p><button class="button primary" id="confirm-tuck">Save window & lock vault</button><button class="button quiet" id="cancel-tuck">Keep browsing</button>`);
    document.querySelector("#cancel-tuck").onclick = render;
    document.querySelector("#confirm-tuck").onclick = async (event) => {
      const button = event.currentTarget;
      try {
        const access = requestWindowAccess(browser);
        button.disabled = true;
        await access;
        const result = await sendWindowAction(browser, { type: "tuck-window", windowId: tab.windowId, name: document.querySelector("#window-name").value });
        if (result.remaining) throw new Error("Saved and locked, but some tabs stayed open. Check your window.");
        window.close();
      } catch (error) { const status = document.querySelector("#window-error"); if (status) { status.textContent = error.message; button.disabled = false; } }
    };
  };
  document.querySelector("#remove-page")?.addEventListener("click", async () => {
    await writeUnlockedVault(removeBookmark(vault, existing.id));
    await render();
  });
  document.querySelector("#save-page")?.addEventListener("click", async () => {
    try {
      const next = addBookmark(vault, { title: tab.title, url: tab.url }, { paid, totalBookmarks });
      await writeUnlockedVault(next);
      content.querySelector("#save-page").textContent = "Added to Burrow";
      content.querySelector("#save-page").disabled = true;
    } catch (error) {
      document.querySelector("#save-error").textContent = error.message;
    }
  });
}

render().catch((error) => {
  content.replaceChildren();
  const message = document.createElement("p");
  message.className = "error";
  message.textContent = error.message;
  content.append(message);
});

// An open popup must stop displaying decrypted details when another surface locks.
browser.storage.onChanged?.addListener((changes, area) => {
  if (area === "session" && changes.burrowmarksSession && !changes.burrowmarksSession.newValue) {
    render().catch(() => { content.textContent = "Your vault is locked. Reopen Burrow to unlock it."; });
  }
});
