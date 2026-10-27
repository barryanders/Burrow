export const WINDOW_EXPLANATION = "Saves web addresses, tab order, pins, and mute state, then closes those tabs. Unsaved forms, page history, and scroll positions are not saved. Firefox history and Recently Closed can still contain these pages. This does not lock Firefox itself.";
export async function requestWindowAccess(api) {
  // Call directly from a click handler so Firefox recognizes the user gesture.
  const allowed = await api.permissions.request({ permissions: ["tabs"] });
  if (!allowed) throw new Error("Tab access was declined. Your tabs are still open.");
}
export async function sendWindowAction(api, message) {
  const result = await api.runtime.sendMessage(message);
  if (!result?.ok) { const error = new Error(result?.error || "The window operation could not finish. Your saved copies remain in the vault."); error.code = result?.code; throw error; }
  return result;
}
