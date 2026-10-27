import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ICON_STYLE,
  ICON_STYLES,
  effectiveIconStyle,
  iconStyleAsset,
  normalizeIconStyle,
  themeIconStyle,
} from "../src/lib/icon-style.js";

test("Stone Bookmark is the default Mossy Burrow icon", () => {
  assert.equal(DEFAULT_ICON_STYLE, "stone-bookmark");
  assert.equal(normalizeIconStyle(), "stone-bookmark");
  assert.equal(iconStyleAsset(undefined, 48), "assets/icon-style-stone-bookmark-48.png");
});

test("all theme icon assets resolve at supported sizes", () => {
  assert.deepEqual(
    ICON_STYLES.map((style) => style.id),
    ["stone-bookmark", "firemole", "abstract-burrowmark", "retro-mole"],
  );
  for (const style of ICON_STYLES) {
    assert.equal(normalizeIconStyle(style.id), style.id);
    assert.match(iconStyleAsset(style.id, 128), new RegExp(`${style.file}-128\\.png$`));
  }
});

test("unknown legacy icon settings safely fall back to Stone Bookmark", () => {
  assert.equal(normalizeIconStyle("not-a-real-style"), "stone-bookmark");
});

test("each theme owns exactly one icon", () => {
  assert.equal(themeIconStyle("firefox"), "stone-bookmark");
  assert.equal(themeIconStyle("firefox-burrow"), "firemole");
  assert.equal(themeIconStyle("lockbox"), "abstract-burrowmark");
  assert.equal(themeIconStyle("retro"), "retro-mole");
  assert.equal(effectiveIconStyle("firefox", "premium-peek"), "stone-bookmark");
  assert.equal(effectiveIconStyle("lockbox", "stone-bookmark"), "abstract-burrowmark");
});
