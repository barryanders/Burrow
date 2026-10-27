export function searchWindows(windows, query = "") {
  const needle = query.trim().toLocaleLowerCase();
  return windows.filter(item => !needle || [item.name, ...item.tabs.flatMap(tab => [tab.title, tab.url])]
    .some(value => String(value || "").toLocaleLowerCase().includes(needle)));
}

export function renameSavedWindow(vault, id, name) {
  const clean = String(name || "").trim();
  if (!clean || clean.length > 80) throw new Error("Enter a window name of 1–80 characters.");
  if (!vault.windows?.some(item => item.id === id)) throw new Error("That saved window is unavailable.");
  return { ...vault, updatedAt: new Date().toISOString(), windows: vault.windows.map(item => item.id === id ? { ...item, name: clean } : item) };
}
