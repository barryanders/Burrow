import assert from "node:assert/strict";
import test from "node:test";

const {
  addBookmark,
  addFolder,
  createEmptyVault,
  findBookmarkByUrl,
  importBookmarkHtml,
  migrateVault,
  normalizeUrl,
  queuePendingBookmark,
  removeBookmark,
  removeBookmarks,
  removeFolder,
  renameFolder,
  searchBookmarks,
  savePendingBookmark,
  vaultToBookmarkHtml,
} = await import("../src/lib/vault.js");

test("web addresses work without an explicit protocol", () => {
  assert.equal(normalizeUrl("google.com"), "https://google.com/");
  assert.equal(normalizeUrl("  example.com/path  "), "https://example.com/path");
  assert.equal(normalizeUrl("http://example.com"), "http://example.com/");
});

test("duplicate URLs are detected and cannot be saved twice", () => {
  const vault = addBookmark(createEmptyVault(), { title: "First", url: "example.com" });
  assert.equal(findBookmarkByUrl(vault, "https://example.com/")?.title, "First");
  assert.throws(
    () => addBookmark(vault, { title: "Again", url: "https://example.com" }),
    (error) => error.code === "DUPLICATE",
  );
});

test("duplicate detection treats a common www redirect as the same page", () => {
  const vault = addBookmark(createEmptyVault(), { title: "Google", url: "google.com" });
  assert.equal(findBookmarkByUrl(vault, "https://www.google.com/")?.title, "Google");
});

test("free users can save hundreds of bookmarks without an entitlement", () => {
  let vault = createEmptyVault();
  for (let index = 0; index < 250; index++) vault = addBookmark(vault, { title: `Link ${index}`, url: `https://example.com/${index}` }, { paid: false, totalBookmarks: 1000 + index });
  assert.equal(vault.bookmarks.length, 250);
});

test("paid users can exceed the free limit", () => {
  let vault = createEmptyVault();
  for (let index = 0; index < 8; index += 1) {
    vault = addBookmark(
      vault,
      { title: `Link ${index}`, url: `https://example.com/${index}` },
      { paid: true },
    );
  }
  assert.equal(vault.bookmarks.length, 8);
});

test("legacy pending bookmarks can be recovered without an upgrade", () => {
  let vault = createEmptyVault();
  for (let index = 0; index < 5; index += 1) {
    vault = addBookmark(vault, { title: `Link ${index}`, url: `https://example.com/${index}` });
  }
  vault = queuePendingBookmark(vault, {
    title: "Keep this ready",
    url: "https://example.com/sixth",
    notes: "Saved after activation",
  });
  assert.equal(vault.bookmarks.length, 5);
  assert.equal(vault.pendingBookmark.title, "Keep this ready");

  vault = savePendingBookmark(vault);
  assert.equal(vault.bookmarks.length, 6);
  assert.equal(vault.bookmarks[0].url, "https://example.com/sixth");
  assert.equal(vault.pendingBookmark, undefined);
});

test("a newer sixth-link attempt replaces the previous pending bookmark", () => {
  let vault = queuePendingBookmark(createEmptyVault(), { title: "Earlier", url: "earlier.example" });
  vault = queuePendingBookmark(vault, { title: "Latest", url: "latest.example" });
  assert.equal(vault.pendingBookmark.title, "Latest");
  assert.equal(vault.pendingBookmark.url, "https://latest.example/");
});

test("removing an item restores free capacity", () => {
  let vault = createEmptyVault();
  for (let index = 0; index < 5; index += 1) {
    vault = addBookmark(vault, { title: `${index}`, url: `https://example.com/${index}` });
  }
  vault = removeBookmark(vault, vault.bookmarks[0].id);
  vault = addBookmark(vault, { title: "Replacement", url: "https://example.com/new" });
  assert.equal(vault.bookmarks.length, 5);
});

test("multiple bookmarks can be removed in one vault update", () => {
  let vault = createEmptyVault();
  vault = addBookmark(vault, { title: "One", url: "one.example" });
  vault = addBookmark(vault, { title: "Two", url: "two.example" });
  vault = addBookmark(vault, { title: "Three", url: "three.example" });
  vault = removeBookmarks(vault, [vault.bookmarks[0].id, vault.bookmarks[2].id]);
  assert.deepEqual(vault.bookmarks.map((bookmark) => bookmark.title), ["Two"]);
});

test("search covers title, URL, and notes", () => {
  let vault = createEmptyVault();
  vault = addBookmark(vault, {
    title: "Career planning",
    url: "https://example.com/jobs",
    notes: "Review quietly",
  });
  assert.equal(searchBookmarks(vault, "career").length, 1);
  assert.equal(searchBookmarks(vault, "jobs").length, 1);
  assert.equal(searchBookmarks(vault, "quietly").length, 1);
  assert.equal(searchBookmarks(vault, "missing").length, 0);
});

test("standard HTML export escapes content", () => {
  let vault = createEmptyVault();
  vault = addBookmark(vault, {
    title: "A & B <private>",
    url: "https://example.com/?a=1&b=2",
  });
  const html = vaultToBookmarkHtml(vault);
  assert.match(html, /A &amp; B &lt;private&gt;/);
  assert.match(html, /a=1&amp;b=2/);
});

test("standard HTML export imports back with content and order intact", () => {
  const decode = (value) => value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
  globalThis.DOMParser = class {
    parseFromString(html) {
      const span = html.match(/^<span>([\s\S]*)<\/span>$/i);
      if (span) return { querySelector: () => ({ textContent: decode(span[1]) }) };
      const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((match) => ({
        textContent: decode(match[2]),
        getAttribute(name) {
          const href = match[1].match(/\bHREF="([^"]*)"/);
          return name === "HREF" ? decode(href?.[1] || "") || null : null;
        },
      }));
      return { querySelectorAll: (selector) => selector === "a" ? anchors : [] };
    }
  };

  let source = createEmptyVault();
  source = addBookmark(source, { title: "A & B <private>", url: "https://example.com/?a=1&b=2" });
  source = addBookmark(source, { title: "Research", url: "research.example/path" });
  const result = importBookmarkHtml(createEmptyVault(), vaultToBookmarkHtml(source));

  assert.equal(result.imported, 2);
  assert.equal(result.skipped, 0);
  assert.deepEqual(
    result.vault.bookmarks.map(({ title, url }) => ({ title, url })),
    source.bookmarks.map(({ title, url }) => ({ title, url })),
  );
});

test("standard HTML round trips folder names and bookmark assignments for free vaults", () => {
  const decode = (value) => value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
  globalThis.DOMParser = class {
    parseFromString(html) {
      const span = html.match(/^<span>([\s\S]*)<\/span>$/i);
      if (span) return { querySelector: () => ({ textContent: decode(span[1]) }) };
      const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((match) => ({
        textContent: decode(match[2]),
        getAttribute(name) {
          const href = match[1].match(/\bHREF="([^"]*)"/i);
          return name.toLowerCase() === "href" ? decode(href?.[1] || "") || null : null;
        },
      }));
      return { querySelectorAll: (selector) => selector === "a" ? anchors : [] };
    }
  };

  let source = createEmptyVault();
  source = addFolder(source, "Gift research");
  const giftFolder = source.folders.find((folder) => folder.name === "Gift research");
  source = addBookmark(source, { title: "Private gift", url: "https://example.com/gift", folderId: giftFolder.id }, { paid: true });
  source = addBookmark(source, { title: "Inbox link", url: "https://example.com/inbox" }, { paid: true });

  const result = importBookmarkHtml(createEmptyVault(), vaultToBookmarkHtml(source));
  const restoredGiftFolder = result.vault.folders.find((folder) => folder.name === "Gift research");
  assert.ok(restoredGiftFolder);
  assert.equal(result.vault.bookmarks.find((bookmark) => bookmark.title === "Private gift").folderId, restoredGiftFolder.id);
  assert.equal(result.vault.bookmarks.find((bookmark) => bookmark.title === "Inbox link").folderId, "inbox");
});

test("standard HTML import has identical free and paid capacity", () => {
  globalThis.DOMParser = class {
    parseFromString(html) {
      const anchors = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
        textContent: match[2],
        getAttribute(name) {
          return name.toLowerCase() === "href" ? match[1] : null;
        },
      }));
      return { querySelectorAll: (selector) => selector === "a" ? anchors : [] };
    }
  };

  const html = `<DL>${Array.from({ length: 8 }, (_, index) =>
    `<DT><A HREF="https://example.com/${index}">Link ${index}</A>`).join("")}</DL>`;
  const freeResult = importBookmarkHtml(createEmptyVault(), html);
  const paidResult = importBookmarkHtml(createEmptyVault(), html, { paid: true });

  assert.equal(freeResult.vault.bookmarks.length, 8);
  assert.equal(freeResult.imported, 8);
  assert.equal(freeResult.skipped, 0);
  assert.equal(paidResult.vault.bookmarks.length, 8);
  assert.equal(paidResult.skipped, 0);
});

test("free vaults can create folders and keep saving bookmarks", () => {
  let vault = addFolder(createEmptyVault(), "Trip ideas");
  const folder = vault.folders.find((item) => item.name === "Trip ideas");
  for (let index = 0; index < 5; index += 1) {
    vault = addBookmark(vault, {
      title: `Trip ${index}`,
      url: `https://example.com/trip-${index}`,
      folderId: folder.id,
    });
  }
  assert.equal(vault.bookmarks.length, 5);
  assert.ok(vault.bookmarks.every((bookmark) => bookmark.folderId === folder.id));
  assert.equal(addBookmark(vault, { title: "Another", url: "https://example.com/six" }).bookmarks.length, 6);
});

test("deleting a folder moves its bookmarks to Tucked away", () => {
  let vault = addFolder(createEmptyVault(), "Temporary");
  const folder = vault.folders.find((item) => item.name === "Temporary");
  vault = addBookmark(vault, {
    title: "Keep this",
    url: "https://example.com/keep",
    folderId: folder.id,
  });
  vault = removeFolder(vault, folder.id);
  assert.equal(vault.folders.some((item) => item.id === folder.id), false);
  assert.equal(vault.bookmarks[0].folderId, "inbox");
  assert.throws(() => removeFolder(vault, "inbox"), /cannot be deleted/);
});

test("folders, including the default folder, can be renamed", () => {
  let vault = addFolder(createEmptyVault(), "Trip ideas");
  const folder = vault.folders.find((item) => item.name === "Trip ideas");
  vault = renameFolder(vault, folder.id, "Future trips");
  vault = renameFolder(vault, "inbox", "Unsorted");
  assert.equal(vault.folders.find((item) => item.id === folder.id).name, "Future trips");
  assert.equal(vault.folders.find((item) => item.id === "inbox").name, "Unsorted");
  assert.throws(() => renameFolder(vault, folder.id, "   "), /required/);
  assert.throws(() => renameFolder(vault, "missing", "Nope"), /no longer exists/);
});

test("older vault shapes migrate without losing bookmarks", () => {
  const migrated = migrateVault({ schemaVersion: 0, bookmarks: [{ id: "old", title: "Kept" }] });
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.bookmarks[0].title, "Kept");
  assert.equal(migrated.folders[0].id, "inbox");
});

test("newer unknown vault versions fail closed", () => {
  assert.throws(() => migrateVault({ schemaVersion: 99, bookmarks: [] }), /newer Burrow version/);
});
