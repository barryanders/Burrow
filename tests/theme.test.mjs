import assert from "node:assert/strict";
import test from "node:test";

const { applyTheme, DEFAULT_THEME, getSystemTheme, normalizeTheme, THEMES } = await import("../src/lib/theme.js");

test("all product themes are available without a recommendation badge", () => {
  assert.deepEqual(THEMES.map(({ id }) => id), ["firefox", "firefox-burrow", "lockbox", "retro"]);
  assert.equal(DEFAULT_THEME, "firefox");
  assert.equal(THEMES.some((theme) => "recommended" in theme), false);
});

test("first-run appearance defaults to Mossy Burrow", () => {
  assert.equal(getSystemTheme(false), "firefox");
  assert.equal(getSystemTheme(true), "firefox");
});

test("unknown or missing themes safely fall back to Mossy Burrow", () => {
  assert.equal(normalizeTheme("warm"), "firefox");
  assert.equal(normalizeTheme("firefox"), "firefox");
  assert.equal(normalizeTheme("firefox-burrow"), "firefox-burrow");
  assert.equal(normalizeTheme("retro"), "retro");
  assert.equal(normalizeTheme("anything-else"), "firefox");
  assert.equal(normalizeTheme(undefined), "firefox");
});

test("applying a theme only writes a validated theme id", () => {
  const root = { dataset: {} };
  assert.equal(applyTheme("firefox", root), "firefox");
  assert.equal(root.dataset.theme, "firefox");
  assert.equal(applyTheme("not-real", root), "firefox");
  assert.equal(root.dataset.theme, "firefox");
});

test("all themes are free, including for existing vaults", async () => {
  const { canSelectTheme } = await import("../src/lib/theme.js");
  assert.equal(canSelectTheme("firefox", false), true);
  for (const theme of ["firefox-burrow", "lockbox", "retro"]) {
    assert.equal(canSelectTheme(theme, false), true);
    assert.equal(canSelectTheme(theme, true), true);
    assert.equal(canSelectTheme(theme, false, theme), true);
  }
});
