import { mkdir, rm } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const root = new URL("../", import.meta.url);
const artifactDir = new URL("artifacts/", root);
const { version } = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const firefoxArtifact = new URL(`artifacts/burrow-firefox-${version}.zip`, root);
const chromiumArtifact = new URL(`artifacts/burrow-chromium-${version}.zip`, root);
const recoveryArtifact = new URL(`artifacts/burrow-recovery-kit-${version}.zip`, root);

await mkdir(artifactDir, { recursive: true });
await rm(firefoxArtifact, { force: true });
await rm(chromiumArtifact, { force: true });
await rm(recoveryArtifact, { force: true });

async function zip(source, destination) {
  await new Promise((resolve, reject) => {
    const process = spawn("zip", ["-qr", destination.pathname, "."], {
      cwd: source,
      stdio: "inherit",
    });
    process.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`zip exited ${code}`))));
  });
}

await zip(new URL("dist/firefox/", root), firefoxArtifact);
await zip(new URL("dist/chromium/", root), chromiumArtifact);
await zip(new URL("dist/recovery-kit/", root), recoveryArtifact);
console.log("Packaged Firefox, Chromium, and recovery-kit artifacts");
