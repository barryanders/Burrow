import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { normalizePurchaseUrl } from "../src/lib/purchase.js";
import { injectPurchaseUrl } from "./build-support.mjs";

const root = new URL("../", import.meta.url);
const source = new URL("src/", root);
const firefoxOutput = new URL("dist/firefox/", root);
const chromiumOutput = new URL("dist/chromium/", root);
const recoveryOutput = new URL("dist/recovery-kit/", root);

for (const output of [firefoxOutput, chromiumOutput]) {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(source, output, { recursive: true });
}

const launchAssets = new Set([
  "mole-tabs-studio.png", "burrow-walking.png", "burrow-reading.png", "burrow-sleeping.png", "burrow-jumping.png", "burrow-retro.png",
  "burrow-recovery-key.png", "burrow-backup-success.png", "icon-128.png",
  ...[48, 96, 128].map(size => `icon-burrowmark-${size}.png`),
  ...["light", "dark"].flatMap(tone => [16, 32, 64].map(size => `icon-toolbar-on-${tone}-${size}.png`)),
  ...["stone-bookmark", "firemole", "abstract-burrowmark", "retro-mole"].flatMap(style => [16, 32, 48, 128].map(size => `icon-style-${style}-${size}.png`)),
]);
for (const output of [firefoxOutput, chromiumOutput]) {
  for (const asset of await readdir(new URL("assets/", output))) {
    if (!launchAssets.has(asset)) await rm(new URL(`assets/${asset}`, output), { recursive: true, force: true });
  }
}

const purchaseUrl = normalizePurchaseUrl(process.env.BURROWMARKS_PURCHASE_URL);
if (process.env.BURROWMARKS_REQUIRE_PURCHASE_URL === "1" && !purchaseUrl) {
  throw new Error("A release package requires BURROWMARKS_PURCHASE_URL.");
}
for (const output of [firefoxOutput, chromiumOutput]) {
  const purchaseModule = new URL("lib/purchase.js", output);
  const purchaseSource = await readFile(purchaseModule, "utf8");
  await writeFile(purchaseModule, injectPurchaseUrl(purchaseSource, purchaseUrl));
}

const chromiumManifestUrl = new URL("manifest.json", chromiumOutput);
const chromiumManifest = JSON.parse(await readFile(chromiumManifestUrl, "utf8"));
delete chromiumManifest.browser_specific_settings;
chromiumManifest.minimum_chrome_version = "122";
chromiumManifest.background = { service_worker: "background.js", type: "module" };
await writeFile(chromiumManifestUrl, `${JSON.stringify(chromiumManifest, null, 2)}\n`);
await rm(recoveryOutput, { recursive: true, force: true });
await mkdir(new URL("assets/", recoveryOutput), { recursive: true });
for (const relative of ["recovery.html", "recovery-standalone.js", "styles.css"]) {
  await cp(new URL(relative, source), new URL(relative, recoveryOutput));
}
await cp(new URL("assets/icon-128.png", source), new URL("assets/icon-128.png", recoveryOutput));
console.log(`Built Firefox, Chromium, and recovery-kit outputs with the ${purchaseUrl ? "injected" : "built-in"} purchase URL`);
