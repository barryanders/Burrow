import assert from "node:assert/strict";
import test from "node:test";

const { DEFAULT_PURCHASE_URL, getPurchaseUrl, hasPurchaseUrl, LIFETIME_PRICE_DISPLAY, normalizePurchaseUrl } = await import("../src/lib/purchase.js");
const { injectPurchaseUrl } = await import("../scripts/build-support.mjs");

test("release purchase links require a safe web address", () => {
  assert.equal(normalizePurchaseUrl("https://burrowmarks.example/buy"), "https://burrowmarks.example/buy");
  assert.equal(normalizePurchaseUrl(" http://localhost:3000/ "), "http://localhost:3000/");
  assert.throws(() => normalizePurchaseUrl("http://example.com/buy"), /HTTPS/);
  assert.throws(() => normalizePurchaseUrl("https://user:secret@example.com/buy"), /credentials/);
  assert.throws(() => normalizePurchaseUrl("not a url"), /invalid/);
});

test("free builds have no checkout", () => {
  assert.equal(normalizePurchaseUrl(""), "");
  assert.equal(normalizePurchaseUrl("__BURROWMARKS_PURCHASE_URL__"), "");
  assert.equal(getPurchaseUrl(""), DEFAULT_PURCHASE_URL);
  assert.equal(hasPurchaseUrl(""), false);
  assert.equal(hasPurchaseUrl("https://burrowmarks.example/"), true);
});

test("the extension presents the selected lifetime price", () => {
  assert.equal(LIFETIME_PRICE_DISPLAY, "Free");
});

test("the build injects only the exported purchase destination", () => {
  const source = `const PURCHASE_URL_PLACEHOLDER = "__BURROWMARKS_PURCHASE_URL__";\n\nexport const PURCHASE_URL = "__BURROWMARKS_PURCHASE_URL__";`;
  const built = injectPurchaseUrl(source, "https://burrowmarks.example/buy");
  assert.match(built, /PURCHASE_URL_PLACEHOLDER = "__BURROWMARKS_PURCHASE_URL__"/);
  assert.match(built, /PURCHASE_URL = "https:\/\/burrowmarks\.example\/buy"/);
  assert.throws(() => injectPurchaseUrl("no marker", "https://example.com"), /marker is missing/);
});
