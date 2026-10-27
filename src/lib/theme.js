export const DEFAULT_THEME = "firefox";

export const THEMES = Object.freeze([
  {
    id: "firefox",
    name: "Sage",
    description: "Soft greens and warm white.",
  },
  {
    id: "firefox-burrow",
    name: "Warm",
    description: "Apricot, cream, and a little lavender.",
  },
  {
    id: "lockbox",
    name: "Midnight",
    description: "Deep charcoal and soft lilac.",
  },
  {
    id: "retro",
    name: "8-bit",
    description: "Pixel art, warm neutrals, and olive accents.",
  },
]);

const THEME_IDS = new Set(THEMES.map((theme) => theme.id));

export function normalizeTheme(value) {
  return THEME_IDS.has(value) ? value : DEFAULT_THEME;
}

export function getSystemTheme() {
  return DEFAULT_THEME;
}

export function applyTheme(value, root = document.documentElement) {
  const theme = normalizeTheme(value);
  root.dataset.theme = theme;
  return theme;
}

export function themeArt(theme, scene = "library") {
  const normalized = normalizeTheme(theme);
  if (scene === "locked") return normalized === "retro" ? "assets/burrow-retro.png" : "assets/burrow-sleeping.png";
  if (scene === "empty") return normalized === "retro" ? "assets/burrow-jumping.png" : "assets/burrow-reading.png";
  return { firefox: "assets/mole-tabs-studio.png", "firefox-burrow": "assets/burrow-walking.png", lockbox: "assets/burrow-reading.png", retro: "assets/burrow-jumping.png" }[normalized];
}

// All themes are free.
export function canSelectTheme(theme, paid, currentTheme = DEFAULT_THEME) {
  return true;
}
