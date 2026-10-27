import {
  changePassword,
  createVaultEnvelope,
  unlockWithPassword,
  unlockWithRecoveryCode,
} from "./crypto.js";
import { createEmptyVault } from "./vault.js";
import {
  clearSession,
  getStoredState,
  recordActiveVaultBookmarkCount,
  saveStoredState,
  setSessionKey,
} from "./storage.js";
import { normalizeTheme } from "./theme.js";
import { DEFAULT_ICON_STYLE, themeIconStyle } from "./icon-style.js";

export async function hasVault() {
  return Boolean((await getStoredState())?.envelope);
}

export async function createVault(password, theme = "firefox", name = "") {
  const existing = await getStoredState();
  const created = await createVaultEnvelope(password, createEmptyVault());
  const id = crypto.randomUUID();
  const vaults = existing?.vaults || [];
  const cleanName = String(name || "").trim() || (vaults.length ? `Vault ${vaults.length + 1}` : "Primary vault");
  const normalizedTheme = normalizeTheme(theme);
  const record = {
    id,
    name: cleanName,
    theme: normalizedTheme,
    iconStyle: themeIconStyle(normalizedTheme),
    createdAt: new Date().toISOString(),
    bookmarkCount: 0,
    envelope: created.envelope,
    previousEnvelope: null,
  };
  const state = await saveStoredState({
    ...existing,
    activeVaultId: id,
    vaults: [...vaults, record],
    envelope: created.envelope,
    previousEnvelope: null,
    settings: {
      ...(existing?.settings || { lockMinutes: 10, iconStyle: DEFAULT_ICON_STYLE, contextMenuEnabled: true }),
      theme: record.theme,
      iconStyle: record.iconStyle,
    },
    entitlement: existing?.entitlement || { kind: "free", active: true },
  }, { retainPreviousEnvelope: false, createAutomaticBackup: false });
  await setSessionKey(created.dataKey, state.settings?.lockMinutes ?? 10, id);
  return created.recoveryCode;
}

export async function unlockVault(secret, mode = "password") {
  const state = await getStoredState();
  if (!state?.envelope) throw new Error("No vault exists yet.");
  const result =
    mode === "recovery"
      ? await unlockWithRecoveryCode(state.envelope, secret)
      : await unlockWithPassword(state.envelope, secret);
  await recordActiveVaultBookmarkCount(result.payload.bookmarks.length);
  await setSessionKey(result.dataKey, state.settings?.lockMinutes ?? 10, state.activeVaultId);
  return result.payload;
}

export async function resetPasswordWithRecovery(recoveryCode, newPassword) {
  const state = await getStoredState();
  const recovered = await unlockWithRecoveryCode(state.envelope, recoveryCode);
  const envelope = await changePassword(state.envelope, recovered.dataKey, newPassword);
  await saveStoredState({ ...state, envelope }, { retainPreviousEnvelope: false });
  await setSessionKey(recovered.dataKey, state.settings?.lockMinutes ?? 10, state.activeVaultId);
}

export async function changeVaultPassword(currentPassword, newPassword) {
  const state = await getStoredState();
  if (!state?.envelope) throw new Error("No vault exists yet.");
  const unlocked = await unlockWithPassword(state.envelope, currentPassword);
  const envelope = await changePassword(state.envelope, unlocked.dataKey, newPassword);
  await saveStoredState({ ...state, envelope }, { retainPreviousEnvelope: false });
  await setSessionKey(unlocked.dataKey, state.settings?.lockMinutes ?? 10, state.activeVaultId);
  return unlocked.payload;
}

export async function lockVault() {
  await clearSession();
}
