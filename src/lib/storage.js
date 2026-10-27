import {
  decryptPayload,
  exportDataKey,
  importExportedDataKey,
  updateEncryptedPayload,
} from "./crypto.js";
import { migrateVault } from "./vault.js";
import { normalizeTheme } from "./theme.js";
import { themeIconStyle } from "./icon-style.js";

const LOCAL_KEY = "burrowmarksState";
const AUTOMATIC_BACKUPS_KEY = "burrowmarksAutomaticBackups";
const SESSION_KEY = "burrowmarksSession";
const DEFAULT_LOCK_MINUTES = 10;
export const MAX_AUTOMATIC_BACKUPS = 3;

function api() {
  if (!globalThis.browser?.storage) throw new Error("Browser storage is unavailable.");
  return globalThis.browser;
}

function normalizeState(input) {
  if (!input) return null;
  const legacyTheme = normalizeTheme(input.settings?.theme);
  let vaults = Array.isArray(input.vaults) ? input.vaults.filter((vault) => vault?.envelope) : [];
  if (!vaults.length && input.envelope) {
    vaults = [{
      id: input.activeVaultId || "primary",
      name: "Primary vault",
      createdAt: input.createdAt || null,
      bookmarkCount: Number.isFinite(input.bookmarkCount) ? input.bookmarkCount : null,
      envelope: input.envelope,
      previousEnvelope: input.previousEnvelope || null,
    }];
  }
  vaults = vaults.map((vault, index) => {
    const theme = normalizeTheme(vault.theme || legacyTheme);
    return {
      ...vault,
      id: vault.id || (index === 0 ? "primary" : `vault-${index + 1}`),
      name: String(vault.name || "").trim() || (index === 0 ? "Primary vault" : `Vault ${index + 1}`),
      theme,
      iconStyle: themeIconStyle(theme),
      bookmarkCount: Number.isFinite(vault.bookmarkCount) ? vault.bookmarkCount : null,
      previousEnvelope: vault.previousEnvelope || null,
    };
  });
  const activeVaultId = vaults.some((vault) => vault.id === input.activeVaultId)
    ? input.activeVaultId
    : vaults[0]?.id || null;
  const active = vaults.find((vault) => vault.id === activeVaultId);
  return {
    ...input,
    settings: {
      ...input.settings,
      theme: active?.theme || legacyTheme,
      iconStyle: themeIconStyle(active?.theme || legacyTheme),
    },
    activeVaultId,
    vaults,
    envelope: active?.envelope || null,
    previousEnvelope: active?.previousEnvelope || null,
  };
}

function updateActiveRecord(state, changes) {
  const rootEnvelope = state?.envelope;
  const rootPreviousEnvelope = state?.previousEnvelope;
  const normalized = normalizeState(state);
  if (!normalized?.activeVaultId) return normalized;
  const vaults = normalized.vaults.map((vault) =>
    vault.id === normalized.activeVaultId
      ? {
          ...vault,
          ...(rootEnvelope ? { envelope: rootEnvelope } : {}),
          ...(rootPreviousEnvelope !== undefined ? { previousEnvelope: rootPreviousEnvelope } : {}),
          ...changes,
        }
      : vault,
  );
  const active = vaults.find((vault) => vault.id === normalized.activeVaultId);
  return {
    ...normalized,
    vaults,
    envelope: active?.envelope || null,
    previousEnvelope: active?.previousEnvelope || null,
  };
}

export async function getStoredState() {
  return normalizeState((await api().storage.local.get(LOCAL_KEY))[LOCAL_KEY] || null);
}

async function getAllAutomaticBackups() {
  const stored = (await api().storage.local.get(AUTOMATIC_BACKUPS_KEY))[AUTOMATIC_BACKUPS_KEY];
  return Array.isArray(stored) ? stored : [];
}

export async function getAutomaticBackups() {
  const state = await getStoredState();
  return (await getAllAutomaticBackups())
    .filter((backup) => !backup.vaultId || backup.vaultId === state?.activeVaultId);
}

function envelopeFingerprint(envelope) {
  if (!envelope) return "";
  return [
    envelope.payload?.nonce,
    envelope.payload?.ciphertext,
    envelope.passwordWrapper?.nonce,
    envelope.passwordWrapper?.ciphertext,
  ].join(":");
}

function makeAutomaticBackup(state) {
  return {
    id: crypto.randomUUID(),
    vaultId: state.activeVaultId,
    vaultName: state.vaults.find((vault) => vault.id === state.activeVaultId)?.name,
    savedAt: new Date().toISOString(),
    state: { ...state, previousEnvelope: null },
  };
}

export async function saveStoredState(
  nextState,
  { retainPreviousEnvelope = true, createAutomaticBackup = true } = {},
) {
  const current = await getStoredState();
  let normalized = normalizeState(nextState);
  if (!normalized) throw new Error("The vault state is invalid.");
  if (nextState.envelope) {
    normalized = updateActiveRecord(normalized, {
      envelope: nextState.envelope,
      previousEnvelope: nextState.previousEnvelope || null,
    });
  }
  const sameActiveVault = current?.activeVaultId === normalized.activeVaultId;
  const previousEnvelope = retainPreviousEnvelope && sameActiveVault
    ? current?.envelope || normalized.previousEnvelope || null
    : normalized.previousEnvelope || null;
  normalized = updateActiveRecord(normalized, {
    envelope: normalized.envelope,
    previousEnvelope,
  });
  const shouldBackUp = createAutomaticBackup
    && sameActiveVault
    && current?.envelope
    && envelopeFingerprint(current.envelope) !== envelopeFingerprint(normalized.envelope);
  if (shouldBackUp) {
    const existing = await getAllAutomaticBackups();
    const currentFingerprint = envelopeFingerprint(current.envelope);
    const otherVaultBackups = existing.filter((backup) =>
      backup.vaultId && backup.vaultId !== current.activeVaultId);
    const activeBackups = [
      makeAutomaticBackup(current),
      ...existing.filter((backup) =>
        (!backup.vaultId || backup.vaultId === current.activeVaultId)
        && envelopeFingerprint(backup.state?.envelope) !== currentFingerprint),
    ].slice(0, MAX_AUTOMATIC_BACKUPS);
    await api().storage.local.set({
      [LOCAL_KEY]: normalized,
      [AUTOMATIC_BACKUPS_KEY]: [...activeBackups, ...otherVaultBackups],
    });
  } else {
    await api().storage.local.set({ [LOCAL_KEY]: normalized });
  }
  return normalized;
}

export async function setSessionKey(dataKey, lockMinutes = DEFAULT_LOCK_MINUTES, vaultId = null) {
  const now = Date.now();
  const state = vaultId ? null : await getStoredState();
  const minutes = Number.isFinite(lockMinutes) && lockMinutes >= 0 ? lockMinutes : DEFAULT_LOCK_MINUTES;
  await api().storage.session.set({
    [SESSION_KEY]: {
      dataKey: await exportDataKey(dataKey),
      vaultId: vaultId || state?.activeVaultId || null,
      touchedAt: now,
      lockAt: minutes === 0 ? null : now + minutes * 60_000,
    },
  });
}

export async function clearSession() {
  await api().storage.session.remove(SESSION_KEY);
}

export async function getSessionKey({ touch = true } = {}) {
  const result = (await api().storage.session.get(SESSION_KEY))[SESSION_KEY];
  if (!result) return null;
  const state = await getStoredState();
  if (result.vaultId && result.vaultId !== state?.activeVaultId) {
    await clearSession();
    return null;
  }
  if (result.lockAt !== null && Date.now() >= result.lockAt) {
    await clearSession();
    return null;
  }
  const dataKey = await importExportedDataKey(result.dataKey);
  if (touch) {
    await setSessionKey(dataKey, state?.settings?.lockMinutes ?? DEFAULT_LOCK_MINUTES, state?.activeVaultId);
  }
  return dataKey;
}

export async function listVaults() {
  const state = await getStoredState();
  return (state?.vaults || []).map(({ id, name, theme, iconStyle, createdAt, bookmarkCount }) => ({
    id, name, theme, iconStyle, createdAt, bookmarkCount, active: id === state.activeVaultId,
  }));
}

export async function selectVault(vaultId) {
  const state = await getStoredState();
  const active = state?.vaults.find((vault) => vault.id === vaultId);
  if (!active) throw new Error("That vault is no longer available.");
  await clearSession();
  return saveStoredState({
    ...state,
    activeVaultId: active.id,
    envelope: active.envelope,
    previousEnvelope: active.previousEnvelope || null,
    settings: { ...state.settings, theme: active.theme, iconStyle: active.iconStyle },
  }, { retainPreviousEnvelope: false, createAutomaticBackup: false });
}

export async function getTotalBookmarkCount(activeVault = null) {
  const state = await getStoredState();
  return (state?.vaults || []).reduce((total, vault) => {
    if (activeVault && vault.id === state.activeVaultId) return total + activeVault.bookmarks.length;
    return total + (Number.isFinite(vault.bookmarkCount) ? vault.bookmarkCount : 0);
  }, 0);
}

export async function recordActiveVaultBookmarkCount(bookmarkCount) {
  const state = await getStoredState();
  if (!state?.activeVaultId) return state;
  return saveStoredState(updateActiveRecord(state, { bookmarkCount }), {
    retainPreviousEnvelope: false,
    createAutomaticBackup: false,
  });
}

export async function readUnlockedVault({ touch = true } = {}) {
  const [state, dataKey] = await Promise.all([getStoredState(), getSessionKey({ touch })]);
  if (!state?.envelope) throw new Error("No Burrow vault exists yet.");
  if (!dataKey) {
    const error = new Error("The vault is locked.");
    error.code = "LOCKED";
    throw error;
  }
  return { state, dataKey, vault: migrateVault(await decryptPayload(state.envelope.payload, dataKey)) };
}

export async function writeUnlockedVault(vault, { windowsChanged = false, autoSaveChanged = false, expectedEnvelope = null, touch = true } = {}) {
  const write = async () => {
    const { state, dataKey, vault: latest } = await readUnlockedVault({ touch });
    if (expectedEnvelope && envelopeFingerprint(expectedEnvelope) !== envelopeFingerprint(state.envelope)) {
      throw new Error("Your vault changed. Try again; nothing was closed.");
    }
    // Bookmark edits from an older manager view must never erase a new window snapshot.
    const payload = { ...vault, windows: windowsChanged ? vault.windows : latest.windows || [], autoSave: autoSaveChanged ? vault.autoSave : latest.autoSave };
    const envelope = await updateEncryptedPayload(state.envelope, dataKey, payload);
    await decryptPayload(envelope.payload, dataKey);
    const live = await getStoredState();
    if (live.activeVaultId !== state.activeVaultId || envelopeFingerprint(live.envelope) !== envelopeFingerprint(state.envelope)) {
      throw new Error("Your vault changed while saving. Please try again.");
    }
    if (!(await getSessionKey({ touch: false }))) throw new Error("The vault is locked.");
    return saveStoredState(updateActiveRecord({ ...live, envelope }, { bookmarkCount: payload.bookmarks.length }));
  };
  return globalThis.navigator?.locks ? navigator.locks.request("burrowmarks-vault-write", write) : write();
}

export async function getActiveVaultBackupState() {
  const state = await getStoredState();
  if (!state?.envelope) throw new Error("Create a vault before downloading a backup.");
  return {
    envelope: state.envelope,
    previousEnvelope: state.previousEnvelope,
    settings: state.settings,
    entitlement: state.entitlement,
  };
}

export async function restoreBackupState(backupState, dataKey) {
  if (!backupState?.envelope) throw new Error("That backup has no encrypted vault.");
  const payload = migrateVault(await decryptPayload(backupState.envelope.payload, dataKey));
  const current = await getStoredState();
  const restored = updateActiveRecord({
    ...current,
    envelope: backupState.envelope,
    previousEnvelope: backupState.previousEnvelope || null,
  }, { bookmarkCount: payload.bookmarks.length });
  await saveStoredState(restored, { retainPreviousEnvelope: false });
  await setSessionKey(dataKey, current.settings?.lockMinutes ?? DEFAULT_LOCK_MINUTES, current.activeVaultId);
  return restored;
}

export async function restoreAutomaticBackup(backupId, dataKey) {
  const backup = (await getAutomaticBackups()).find((item) => item.id === backupId);
  if (!backup?.state?.envelope) throw new Error("That automatic backup is no longer available.");
  await decryptPayload(backup.state.envelope.payload, dataKey);
  return restoreBackupState(backup.state, dataKey);
}

export async function recoverPreviousEnvelope() {
  const state = await getStoredState();
  const dataKey = await getSessionKey();
  if (!state?.previousEnvelope || !dataKey) throw new Error("No verified previous copy is available.");
  const vault = migrateVault(await decryptPayload(state.previousEnvelope.payload, dataKey));
  return saveStoredState(updateActiveRecord({
    ...state,
    envelope: state.previousEnvelope,
    previousEnvelope: null,
  }, { bookmarkCount: vault.bookmarks.length }));
}

export async function setEntitlement(entitlement) {
  const state = await getStoredState();
  if (!state) throw new Error("Create a vault before activating a license.");
  return saveStoredState({ ...state, entitlement });
}

export async function isPaid() {
  // All features are free; keep the API for existing vault consumers.
  return true;
}

export async function recordEncryptedBackupDownload(downloadedAt = new Date().toISOString()) {
  const state = await getStoredState();
  if (!state?.envelope) throw new Error("Create a vault before downloading a backup.");
  return saveStoredState({
    ...state,
    settings: { ...state.settings, lastEncryptedBackupAt: downloadedAt },
  });
}
