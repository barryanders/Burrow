const PURCHASE_URL_PLACEHOLDER = "__BURROWMARKS_PURCHASE_URL__";
export const DEFAULT_PURCHASE_URL = "";

export const PURCHASE_URL = "__BURROWMARKS_PURCHASE_URL__";
export const LIFETIME_PRICE_DISPLAY = "Free";

export function normalizePurchaseUrl(value) {
  const candidate = String(value || "").trim();
  if (!candidate || candidate === PURCHASE_URL_PLACEHOLDER) return "";

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("The Burrow purchase URL is invalid.");
  }

  const localDevelopment = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new Error("The Burrow purchase URL must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("The Burrow purchase URL cannot contain credentials.");
  }
  return url.href;
}

export function hasPurchaseUrl(value = PURCHASE_URL) {
  return Boolean(getPurchaseUrl(value));
}

export function getPurchaseUrl(value = PURCHASE_URL) {
  return normalizePurchaseUrl(value) || DEFAULT_PURCHASE_URL;
}
