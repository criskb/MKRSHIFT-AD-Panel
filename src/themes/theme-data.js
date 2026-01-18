export const THEMES = [
  {
    id: "dark",
    label: "Midnight Drift",
    glyphs: ["✦", "✶", "✺", "◌"],
  },
  {
    id: "light",
    label: "Studio Daylight",
    glyphs: ["◍", "◐", "✷", "✧"],
  },
  {
    id: "aurora",
    label: "Aurora Glass",
    glyphs: ["✷", "❖", "◈", "✺"],
  },
  {
    id: "ember",
    label: "Solar Ember",
    glyphs: ["✹", "✧", "◉", "✦"],
  },
  {
    id: "graphite",
    label: "Graphite Lab",
    glyphs: ["◼", "◻", "✣", "✥"],
  },
  {
    id: "oasis",
    label: "Oasis Pulse",
    glyphs: ["✤", "✦", "◑", "✶"],
  },
];

export const THEME_OPTIONS = Object.fromEntries(
  THEMES.map((theme) => [theme.label, theme.id]),
);

export function normalizeTheme(value){
  const match = THEMES.find((theme) => theme.id === value);
  return match ? match.id : "dark";
}

export function getThemeGlyphs(themeId){
  return THEMES.find((theme) => theme.id === themeId)?.glyphs ?? [];
}
