const PURCHASE_EXPORT = 'export const PURCHASE_URL = "__BURROWMARKS_PURCHASE_URL__";';

export function injectPurchaseUrl(source, purchaseUrl) {
  if (!source.includes(PURCHASE_EXPORT)) {
    throw new Error("The purchase URL build marker is missing.");
  }
  return source.replace(
    PURCHASE_EXPORT,
    `export const PURCHASE_URL = ${JSON.stringify(purchaseUrl)};`,
  );
}
