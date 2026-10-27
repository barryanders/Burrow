import { unlockWithPassword, unlockWithRecoveryCode } from "./crypto.js";
import { migrateVault } from "./vault.js";

function recoverySummary(payload, unlockMethod) {
  const vault = migrateVault(payload);
  return {
    unlockMethod,
    bookmarkCount: vault.bookmarks.length,
    folderCount: vault.folders.length,
    windowCount: vault.windows.length,
    tabCount: vault.windows.reduce((sum, item) => sum + item.tabs.length, 0),
  };
}

export function validateEncryptedBackup(backup) {
  if (backup?.format !== "burrowmarks-backup" || backup?.version !== 1 || !backup.state?.envelope) {
    throw new Error("That is not a supported Burrow backup.");
  }
  return backup;
}

export async function verifyRecoveryKey(envelope, recoveryCode) {
  if (!envelope) throw new Error("This vault has no encrypted data to check.");
  if (!String(recoveryCode || "").trim()) throw new Error("Enter your recovery key.");
  const unlocked = await unlockWithRecoveryCode(envelope, recoveryCode);
  return recoverySummary(unlocked.payload, "recovery key");
}

export async function verifyEncryptedBackup(backup, secret) {
  validateEncryptedBackup(backup);
  if (!String(secret || "").trim()) throw new Error("Enter the backup's password or recovery key.");
  let unlocked;
  try {
    unlocked = await unlockWithPassword(backup.state.envelope, secret);
  } catch {
    unlocked = await unlockWithRecoveryCode(backup.state.envelope, secret);
    return recoverySummary(unlocked.payload, "recovery key");
  }
  return recoverySummary(unlocked.payload, "master password");
}
