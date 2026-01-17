export const DEFAULTS = {
  autoplay: true,
  interval: 8,
  transition: 2.2,
  maxParticles: 18000,
  dotSize: 2.2,
  sizeVariance: 0.45,
  shape: "dot",
  softness: 0.13,
  threshold: 0.62,
  swirl: 2.2,
  jitter: 0,
  mode: "auto",
  blend: "add",
  dither: "none",
  ditherStrength: 0.35,
  brightness: 0,
  contrast: 1,
  saturation: 1,
  gamma: 1,
  gridSize: 16,
  smoothing: 0.35,
  ditherType: "none",
  oscMode: "none",
  oscAmplitude: 0,
  oscFrequency: 3,
  oscSpeed: 1.2,
  animEffect: "all",
  renderMode: "particles",
  pipeline: "none",
  bloomStrength: 0.7,
  trailDamp: 0.9,
  grain: 0.12,
  vignette: 0.3,
  sharpen: 0.15,
  chromSplit: 0.0015,
  transitionSoftness: 0.2,
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
