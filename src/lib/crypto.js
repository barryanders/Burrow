import {
  base64ToBytes,
  bytesToBase64,
  bytesToRecoveryCode,
  fromBytes,
  normalizeRecoveryCode,
  toBytes,
} from "./encoding.js";

export const CRYPTO_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;

function cryptoApi() {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable");
  return globalThis.crypto;
}

function randomBytes(length) {
  return cryptoApi().getRandomValues(new Uint8Array(length));
}

async function deriveWrappingKey(secret, salt, iterations = PBKDF2_ITERATIONS) {
  const material = await cryptoApi().subtle.importKey(
    "raw",
    toBytes(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return cryptoApi().subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function importDataKey(raw, usages) {
  return cryptoApi().subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    true,
    usages,
  );
}

async function wrapDataKey(rawDataKey, secret) {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(secret, salt);
  const ciphertext = await cryptoApi().subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    wrappingKey,
    rawDataKey,
  );
  return {
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iterations: PBKDF2_ITERATIONS,
  };
}

async function unwrapDataKey(wrapper, secret) {
  const wrappingKey = await deriveWrappingKey(
    secret,
    base64ToBytes(wrapper.salt),
    wrapper.iterations,
  );
  try {
    const raw = await cryptoApi().subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(wrapper.nonce) },
      wrappingKey,
      base64ToBytes(wrapper.ciphertext),
    );
    return new Uint8Array(raw);
  } catch {
    throw new Error("That password or recovery key did not unlock this vault.");
  }
}

export async function encryptPayload(payload, dataKey) {
  const nonce = randomBytes(12);
  const ciphertext = await cryptoApi().subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    dataKey,
    toBytes(JSON.stringify(payload)),
  );
  return {
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptPayload(encrypted, dataKey) {
  try {
    const plaintext = await cryptoApi().subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(encrypted.nonce) },
      dataKey,
      base64ToBytes(encrypted.ciphertext),
    );
    return JSON.parse(fromBytes(new Uint8Array(plaintext)));
  } catch {
    throw new Error("This vault is damaged or the unlock key is incorrect.");
  }
}

export async function createVaultEnvelope(password, initialPayload) {
  if (typeof password !== "string" || password.length === 0) throw new Error("Enter a master password.");
  const rawDataKey = randomBytes(32);
  const recoveryCode = bytesToRecoveryCode(randomBytes(20));
  const dataKey = await importDataKey(rawDataKey, ["encrypt", "decrypt"]);
  const [passwordWrapper, recoveryWrapper, payload] = await Promise.all([
    wrapDataKey(rawDataKey, password),
    wrapDataKey(rawDataKey, normalizeRecoveryCode(recoveryCode)),
    encryptPayload(initialPayload, dataKey),
  ]);
  return {
    recoveryCode,
    dataKey,
    envelope: {
      format: "burrowmarks",
      version: CRYPTO_VERSION,
      createdAt: new Date().toISOString(),
      passwordWrapper,
      recoveryWrapper,
      payload,
    },
  };
}

export async function unlockWithPassword(envelope, password) {
  const raw = await unwrapDataKey(envelope.passwordWrapper, password);
  const dataKey = await importDataKey(raw, ["encrypt", "decrypt"]);
  return { dataKey, payload: await decryptPayload(envelope.payload, dataKey) };
}

export async function unlockWithRecoveryCode(envelope, recoveryCode) {
  const normalized = normalizeRecoveryCode(recoveryCode);
  const raw = await unwrapDataKey(envelope.recoveryWrapper, normalized);
  const dataKey = await importDataKey(raw, ["encrypt", "decrypt"]);
  return { dataKey, payload: await decryptPayload(envelope.payload, dataKey) };
}

export async function changePassword(envelope, dataKey, newPassword) {
  if (typeof newPassword !== "string" || newPassword.length === 0) throw new Error("Enter a master password.");
  const raw = new Uint8Array(await cryptoApi().subtle.exportKey("raw", dataKey));
  return { ...envelope, passwordWrapper: await wrapDataKey(raw, newPassword) };
}

export async function updateEncryptedPayload(envelope, dataKey, payload) {
  return { ...envelope, payload: await encryptPayload(payload, dataKey) };
}

export async function exportDataKey(dataKey) {
  const raw = await cryptoApi().subtle.exportKey("raw", dataKey);
  return bytesToBase64(new Uint8Array(raw));
}

export async function importExportedDataKey(value) {
  return importDataKey(base64ToBytes(value), ["encrypt", "decrypt"]);
}
