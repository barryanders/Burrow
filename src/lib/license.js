import { base64ToBytes } from "./encoding.js";

// Replace only when rotating the production signing key. Existing releases keep
// accepting keys made by the key embedded in that release, even if checkout ends.
export const LICENSE_PUBLIC_KEY_JWK = {
  kty: "EC",
  crv: "P-256",
  x: "Z3ugdTqV-hIJ--zvqXTRU2yCOdkoHhPe_xWiiB2jEhc",
  y: "-i3RQkH4xTo5kPcYM9TqlB-2u6wjy4Sk3zq0P70XEbo",
  ext: true,
};

function decodeUrlBase64(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return base64ToBytes(normalized);
}

export async function verifyLicenseToken(token, publicKey = LICENSE_PUBLIC_KEY_JWK) {
  const clean = token.trim();
  const [payloadPart, signaturePart, extra] = clean.split(".");
  if (!payloadPart || !signaturePart || extra) throw new Error("That license key is not valid.");
  try {
    const key = await crypto.subtle.importKey("jwk", publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, decodeUrlBase64(signaturePart), new TextEncoder().encode(payloadPart));
    if (!valid) throw new Error("invalid signature");
    const license = JSON.parse(new TextDecoder().decode(decodeUrlBase64(payloadPart)));
    if (license.product !== "burrowmarks" || license.kind !== "lifetime" || !license.licenseId) throw new Error("wrong product");
    return license;
  } catch { throw new Error("That license key could not be verified."); }
}
