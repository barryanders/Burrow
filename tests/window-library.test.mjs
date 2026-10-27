import test from "node:test";
import assert from "node:assert/strict";
import { searchWindows, renameSavedWindow } from "../src/lib/window-library.js";
const windows = [{ id: "a", name: "Reading", tabs: [{ title: "Daily story", url: "https://news.example/hidden-keyword" }] }, { id: "b", name: "Travel", tabs: [{ title: "A cabin", url: "https://stay.example" }] }];
test("window search finds names, titles, and URLs including otherwise invisible terms", () => {
  for (const query of ["reading", "DAILY", "hidden-keyword", "news.example"]) assert.deepEqual(searchWindows(windows, query).map(item => item.id), ["a"]);
  assert.equal(searchWindows(windows, " ").length, 2);
  assert.equal(searchWindows(windows, "missing").length, 0);
});
test("renaming keeps saved tabs intact and rejects invalid names or missing IDs", () => {
  const vault = { windows };
  const result = renameSavedWindow(vault, "a", " Research ");
  assert.equal(result.windows[0].name, "Research");
  assert.equal(vault.windows[0].name, "Reading");
  assert.deepEqual(result.windows[0].tabs, windows[0].tabs);
  for (const name of ["", " ", "x".repeat(81)]) assert.throws(() => renameSavedWindow(vault, "a", name));
  assert.throws(() => renameSavedWindow(vault, "missing", "Valid"));
});
