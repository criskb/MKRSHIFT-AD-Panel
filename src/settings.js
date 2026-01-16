export const DEFAULTS = {
  autoplay: true,
  interval: 8,
  transition: 2.2,
  maxParticles: 18000,
  dotSize: 2.2,
  softness: 0.13,
  threshold: 0.62,
  swirl: 2.2,
  jitter: 0.55,
  mode: "auto",
  blend: "add",
};

export function loadSettings(){
  try{
    const raw = localStorage.getItem("mkrshift_dotscreen_settings");
    if(!raw) return { ...DEFAULTS };
    const obj = JSON.parse(raw);
    return { ...DEFAULTS, ...obj };
  } catch(_){
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings){
  try{
    localStorage.setItem("mkrshift_dotscreen_settings", JSON.stringify(settings));
  } catch(_){
    // ignore
  }
}
