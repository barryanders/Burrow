export const VAULT_SCHEMA_VERSION = 1;

export function createEmptyVault() {
  const now = new Date().toISOString();
  return {
    schemaVersion: VAULT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    folders: [{ id: "inbox", name: "Unfiled", parentId: null, order: 0 }],
    bookmarks: [],
    windows: [],
  };
}

export function migrateVault(input) {
  if (!input || typeof input !== "object") throw new Error("This vault has an invalid format.");
  if (input.schemaVersion > VAULT_SCHEMA_VERSION) throw new Error("This backup was made by a newer Burrow version.");
  const folders = Array.isArray(input.folders) && input.folders.length
    ? input.folders
    : [{ id: "inbox", name: "Unfiled", parentId: null, order: 0 }];
  return {
    ...input,
    schemaVersion: VAULT_SCHEMA_VERSION,
    folders: folders.map(folder => folder.id === "inbox" && folder.name === "Tucked away"
      ? { ...folder, name: "Unfiled" } : folder),
    bookmarks: Array.isArray(input.bookmarks) ? input.bookmarks : [],
    windows: Array.isArray(input.windows) ? input.windows : [],
  };
}

export function createId(prefix = "item") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function normalizeUrl(value) {
  const input = String(value || "").trim();
  if (!input) throw new Error("Enter a web address.");
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Enter a valid web address, such as example.com.");
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("Only http and https links can be saved.");
  }
  return url.href;
}

export function findBookmarkByUrl(vault, value, { excludeId = null } = {}) {
  let normalized;
  try { normalized = bookmarkUrlKey(value); }
  catch { return null; }
  return vault.bookmarks.find((bookmark) => {
    if (bookmark.id === excludeId) return false;
    try { return bookmarkUrlKey(bookmark.url) === normalized; }
    catch { return false; }
  }) || null;
}

function bookmarkUrlKey(value) {
  const url = new URL(normalizeUrl(value));
  url.hash = "";
  url.hostname = url.hostname.replace(/^www\./i, "");
  return url.href;
}

export function addBookmark(vault, bookmark, { paid = false, totalBookmarks = vault.bookmarks.length } = {}) {
  const duplicate = findBookmarkByUrl(vault, bookmark.url);
  if (duplicate) {
    const error = new Error("That link is already saved.");
    error.code = "DUPLICATE";
    error.bookmarkId = duplicate.id;
    throw error;
  }
  const now = new Date().toISOString();
  const item = {
    id: bookmark.id || createId("bookmark"),
    title: bookmark.title.trim() || "Untitled link",
    url: normalizeUrl(bookmark.url),
    folderId: bookmark.folderId || "inbox",
    notes: bookmark.notes?.trim() || "",
    createdAt: bookmark.createdAt || now,
    updatedAt: now,
  };
  return {
    ...vault,
    updatedAt: now,
    bookmarks: [item, ...vault.bookmarks],
  };
}

export function queuePendingBookmark(vault, bookmark) {
  const now = new Date().toISOString();
  return {
    ...vault,
    updatedAt: now,
    pendingBookmark: {
      title: String(bookmark.title || "").trim() || "Untitled link",
      url: normalizeUrl(bookmark.url),
      folderId: bookmark.folderId || "inbox",
      notes: String(bookmark.notes || "").trim(),
      queuedAt: now,
    },
  };
}

export function savePendingBookmark(vault) {
  if (!vault.pendingBookmark) return vault;
  const pending = vault.pendingBookmark;
  const withoutPending = { ...vault };
  delete withoutPending.pendingBookmark;
  return addBookmark(withoutPending, pending, { paid: true });
}

export function updateBookmark(vault, id, changes) {
  if (changes.url) {
    const duplicate = findBookmarkByUrl(vault, changes.url, { excludeId: id });
    if (duplicate) {
      const error = new Error("That link is already saved.");
      error.code = "DUPLICATE";
      error.bookmarkId = duplicate.id;
      throw error;
    }
  }
  const now = new Date().toISOString();
  return {
    ...vault,
    updatedAt: now,
    bookmarks: vault.bookmarks.map((bookmark) =>
      bookmark.id === id
        ? {
            ...bookmark,
            ...changes,
            ...(changes.url ? { url: normalizeUrl(changes.url) } : {}),
            updatedAt: now,
          }
        : bookmark,
    ),
  };
}

export function removeBookmark(vault, id) {
  return {
    ...vault,
    updatedAt: new Date().toISOString(),
    bookmarks: vault.bookmarks.filter((bookmark) => bookmark.id !== id),
  };
}

export function removeBookmarks(vault, ids) {
  const selected = new Set(ids);
  return {
    ...vault,
    updatedAt: new Date().toISOString(),
    bookmarks: vault.bookmarks.filter((bookmark) => !selected.has(bookmark.id)),
  };
}

export function addFolder(vault, name, parentId = null) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Folder name is required.");
  const siblings = vault.folders.filter((folder) => folder.parentId === parentId);
  return {
    ...vault,
    updatedAt: new Date().toISOString(),
    folders: [
      ...vault.folders,
      { id: createId("folder"), name: cleanName, parentId, order: siblings.length },
    ],
  };
}

export function renameFolder(vault, id, name) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Folder name is required.");
  if (!vault.folders.some((folder) => folder.id === id)) throw new Error("That folder no longer exists.");
  return {
    ...vault,
    updatedAt: new Date().toISOString(),
    folders: vault.folders.map((folder) => folder.id === id ? { ...folder, name: cleanName } : folder),
  };
}

export function removeFolder(vault, id) {
  if (id === "inbox") throw new Error("Unfiled is the default folder and cannot be deleted.");
  if (!vault.folders.some((folder) => folder.id === id)) throw new Error("That folder no longer exists.");
  const now = new Date().toISOString();
  return {
    ...vault,
    updatedAt: now,
    folders: vault.folders.filter((folder) => folder.id !== id),
    bookmarks: vault.bookmarks.map((bookmark) =>
      bookmark.folderId === id ? { ...bookmark, folderId: "inbox", updatedAt: now } : bookmark,
    ),
  };
}

function decodeBookmarkHtmlText(value) {
  const document = new DOMParser().parseFromString(`<span>${value}</span>`, "text/html");
  return document.querySelector("span")?.textContent || value;
}

function bookmarkFolderNames(html) {
  const stack = [];
  const folders = [];
  let pendingFolder = null;
  const tokens = html.match(/<\/?DL\b[^>]*>|<H3\b[^>]*>[\s\S]*?<\/H3>|<A\b[^>]*>[\s\S]*?<\/A>/gi) || [];
  for (const token of tokens) {
    if (/^<H3\b/i.test(token)) {
      pendingFolder = decodeBookmarkHtmlText(token.replace(/^<H3\b[^>]*>|<\/H3>$/gi, "")).trim() || null;
    } else if (/^<DL\b/i.test(token)) {
      stack.push(pendingFolder || stack.at(-1) || null);
      pendingFolder = null;
    } else if (/^<\/DL/i.test(token)) {
      stack.pop();
    } else if (/^<A\b/i.test(token)) {
      folders.push(stack.at(-1) || null);
    }
  }
  return folders;
}

export function importBookmarkHtml(vault, html, { paid = false, totalBookmarks = vault.bookmarks.length } = {}) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const folderNames = bookmarkFolderNames(html);
  const anchors = [...document.querySelectorAll("a")]
    .map((anchor, index) => ({ anchor, href: anchor.getAttribute("href") || anchor.getAttribute("HREF"), folderName: folderNames[index] }))
    .filter(({ href }) => href);
  const existingIds = new Set(vault.bookmarks.map((bookmark) => bookmark.id));
  const available = anchors.length;
  let next = vault;
  let imported = 0;
  let skipped = 0;
  const folderIds = new Map(next.folders.map((folder) => [folder.name.toLocaleLowerCase(), folder.id]));
  for (const { anchor, href, folderName } of anchors) {
    if (imported >= available) { skipped += 1; continue; }
    try {
      let folderId = "inbox";
      if (folderName) {
        const folderKey = folderName.toLocaleLowerCase();
        if (!folderIds.has(folderKey)) {
          next = addFolder(next, folderName);
          folderIds.set(folderKey, next.folders.at(-1).id);
        }
        folderId = folderIds.get(folderKey);
      }
      next = addBookmark(next, {
        title: anchor.textContent?.trim() || href,
        url: href,
        folderId,
      }, { paid, totalBookmarks: totalBookmarks + imported });
      imported += 1;
    } catch { skipped += 1; }
  }
  const importedBookmarks = next.bookmarks.filter((bookmark) => !existingIds.has(bookmark.id)).reverse();
  const existingBookmarks = next.bookmarks.filter((bookmark) => existingIds.has(bookmark.id));
  next = { ...next, bookmarks: [...importedBookmarks, ...existingBookmarks] };
  return { vault: next, imported, skipped };
}

export function searchBookmarks(vault, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return vault.bookmarks;
  return vault.bookmarks.filter((bookmark) =>
    [bookmark.title, bookmark.url, bookmark.notes].some((value) =>
      value.toLocaleLowerCase().includes(needle),
    ),
  );
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function vaultToBookmarkHtml(vault) {
  const folderMap = new Map(vault.folders.map((folder) => [folder.id, folder]));
  const grouped = new Map();
  for (const bookmark of vault.bookmarks) {
    const key = bookmark.folderId || "inbox";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(bookmark);
  }
  for (const window of vault.windows || []) {
    const key = `window:${window.id}`;
    folderMap.set(key, { name: `Window: ${window.name}` });
    grouped.set(key, window.tabs);
  }
  const sections = [...grouped.entries()]
    .map(([folderId, bookmarks]) => {
      const folder = folderMap.get(folderId);
      const links = bookmarks
        .map(
          (bookmark) =>
            `        <DT><A HREF="${escapeHtml(bookmark.url)}">${escapeHtml(bookmark.title)}</A>`,
        )
        .join("\n");
      return `    <DT><H3>${escapeHtml(folder?.name || "Unfiled")}</H3>\n    <DL><p>\n${links}\n    </DL><p>`;
    })
    .join("\n");
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Burrow Export</TITLE>\n<H1>Burrow Export</H1>\n<DL><p>\n${sections}\n</DL><p>\n`;
}
