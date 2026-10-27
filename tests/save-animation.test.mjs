import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("bookmark saves complete without a decorative overlay", async () => {
  const [popup, manager, styles] = await Promise.all([
    readFile(new URL("../src/popup.js", import.meta.url), "utf8"),
    readFile(new URL("../src/manager.js", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(popup, /playBookmarkSavedAnimation|bookmark-save-animation/);
  assert.doesNotMatch(manager, /playBookmarkSavedAnimation|bookmark-save-animation/);
  assert.doesNotMatch(styles, /bookmark-save-animation|bookmark-to-burrow|bookmark-mole-step/);
  assert.match(manager, /themeMoleAsset/);
});
