export const DEFAULT_ICON_STYLE = "stone-bookmark";

export const ICON_STYLES = Object.freeze([
  { id: "stone-bookmark", name: "Sage", file: "icon-style-stone-bookmark" },
  { id: "firemole", name: "Warm", file: "icon-style-firemole" },
  { id: "abstract-burrowmark", name: "Midnight", file: "icon-style-abstract-burrowmark" },
  { id: "retro-mole", name: "8-bit", file: "icon-style-retro-mole" },
]);

const ICON_STYLE_IDS = new Set(ICON_STYLES.map((style) => style.id));

export function normalizeIconStyle(value) {
  return ICON_STYLE_IDS.has(value) ? value : DEFAULT_ICON_STYLE;
}

export function iconStyleAsset(value, size = 128) {
  const id = normalizeIconStyle(value);
  const style = ICON_STYLES.find((item) => item.id === id);
  return `assets/${style.file}-${size}.png`;
}

export function themeIconStyle(theme) {
  if (theme === "firefox-burrow") return "firemole";
  if (theme === "lockbox") return "abstract-burrowmark";
  if (theme === "retro") return "retro-mole";
  return "stone-bookmark";
}

export function effectiveIconStyle(theme) {
  return themeIconStyle(theme);
}
