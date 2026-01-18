const retroOled = {
  id: "RetroOLED",
  label: "Retro OLED",
  tags: ["oled", "neon", "dark"],
  glyphs: ["▣", "◈", "✶", "✷", "◉"],
  font: "\"JetBrains Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  vars: {
    "--bg": "#000000",
    "--panel": "#050607",
    "--panel2": "#0a0c0e",
    "--text": "#eaffff",
    "--muted": "#7aa7a7",
    "--accent": "#00ffd1",
    "--accent2": "#00aaff",
    "--ok": "#4ee1a0",
    "--warn": "#ffd166",
    "--danger": "#ff4d6d",
    "--outline": "rgba(255,255,255,.1)",
    "--shadow": "0 16px 40px rgba(0,0,0,.75)",
    "--font": "\"JetBrains Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  sw: ["#00ffd1", "#00aaff", "#ff4d6d"],
};

export default retroOled;
