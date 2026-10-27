import assert from "node:assert/strict";
import test from "node:test";

const { verifyLicenseToken } = await import("../src/lib/license.js");

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

test("a signed lifetime license verifies entirely offline", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    product: "burrowmarks",
    kind: "lifetime",
    licenseId: "test-order-1",
  })));
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(payload));
  const verified = await verifyLicenseToken(`${payload}.${base64Url(signature)}`, publicKey);
  assert.equal(verified.licenseId, "test-order-1");
});

test("a modified license is rejected", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
  await assert.rejects(verifyLicenseToken("bm9wZQ.bm9wZQ", publicKey), /could not be verified/);
});
