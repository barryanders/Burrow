(function () {
  "use strict";
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  function bytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function normalizeRecovery(value) {
    return value.toUpperCase().replace(/[^A-Z2-9]/g, "");
  }

  async function derive(secret, wrapper) {
    const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: bytes(wrapper.salt), iterations: wrapper.iterations },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
  }

  async function unlock(envelope, secret, recovery) {
    const wrapper = recovery ? envelope.recoveryWrapper : envelope.passwordWrapper;
    const wrappingKey = await derive(recovery ? normalizeRecovery(secret) : secret, wrapper);
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(wrapper.nonce) }, wrappingKey, bytes(wrapper.ciphertext));
    const dataKey = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(envelope.payload.nonce) }, dataKey, bytes(envelope.payload.ciphertext));
    return JSON.parse(decoder.decode(clear));
  }

  function escape(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  function bookmarkHtml(vault) {
    const links = [...vault.bookmarks, ...(vault.windows || []).flatMap(item => item.tabs)].map((item) => `    <DT><A HREF="${escape(item.url)}">${escape(item.title)}</A>`).join("\n");
    return `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Recovered Burrow</TITLE>\n<H1>Recovered Burrow</H1>\n<DL><p>\n${links}\n</DL><p>\n`;
  }

  async function unlockBackup(backup, secret, recovery = false) {
    if (backup?.format !== "burrowmarks-backup" || !backup.state?.envelope) throw new Error("That is not a supported Burrow backup.");
    return unlock(backup.state.envelope, secret, recovery);
  }

  async function recover(recovery) {
    const error = document.querySelector("#recovery-error");
    error.textContent = "";
    try {
      const file = document.querySelector("#backup-file").files[0];
      if (!file) throw new Error("Choose a Burrow backup first.");
      const backup = JSON.parse(await file.text());
      const vault = await unlockBackup(backup, document.querySelector("#recovery-secret").value, recovery);
      const url = URL.createObjectURL(new Blob([bookmarkHtml(vault)], { type: "text/html" }));
      const result = document.querySelector("#recovery-result");
      result.replaceChildren();
      const notice = document.createElement("p");
      notice.className = "notice";
      notice.textContent = `Recovered ${vault.bookmarks.length} bookmarks and ${(vault.windows || []).reduce((sum, item) => sum + item.tabs.length, 0)} saved tabs.`;
      const link = document.createElement("a");
      link.className = "button primary";
      link.href = url;
      link.download = "burrow-recovered.html";
      link.textContent = "Download standard bookmark HTML";
      result.append(notice, link);
    } catch { error.textContent = "That password or recovery key did not unlock this backup."; }
  }

  globalThis.BurrowmarksRecovery = { bookmarkHtml, unlockBackup };
  if (typeof document !== "undefined") {
    document.querySelector("#recover-password").onclick = () => recover(false);
    document.querySelector("#recover-key").onclick = () => recover(true);
  }
})();
