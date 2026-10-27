const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBytes(value) {
  return typeof value === "string" ? encoder.encode(value) : value;
}

export function fromBytes(value) {
  return decoder.decode(value);
}

export function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function bytesToRecoveryCode(bytes) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += RECOVERY_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += RECOVERY_ALPHABET[(value << (5 - bits)) & 31];
  return output.match(/.{1,5}/g).join("-");
}

export function normalizeRecoveryCode(value) {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, "");
}

