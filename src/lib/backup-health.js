export const BACKUP_REMINDER_DAYS = 30;

function validTime(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : null;
}

export function getBackupHealth(state, vault, now = Date.now()) {
  const lastBackupAt = validTime(state?.settings?.lastEncryptedBackupAt);
  const changedAt = validTime(vault?.updatedAt);
  if (!lastBackupAt) {
    return {
      due: true,
      current: false,
      label: "No downloaded backup yet",
    };
  }

  const ageDays = Math.max(0, Math.floor((now - lastBackupAt) / 86_400_000));
  const current = !changedAt || lastBackupAt >= changedAt;
  const due = ageDays >= BACKUP_REMINDER_DAYS;
  const ageLabel = ageDays === 0 ? "today" : `${ageDays} day${ageDays === 1 ? "" : "s"} ago`;
  return {
    due,
    current,
    label: current
      ? `Encrypted backup saved ${ageLabel}`
      : `Backup saved ${ageLabel} · newer changes are only local`,
  };
}
