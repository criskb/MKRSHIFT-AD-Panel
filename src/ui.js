export function bindRange(rangeEl, outEl, settings, key, saveSettings, onChange, markInteraction){
  rangeEl.value = settings[key];
  outEl.textContent = String(settings[key]);
  rangeEl.addEventListener("input", ()=>{
    settings[key] = parseFloat(rangeEl.value);
    outEl.textContent = String(settings[key]);
    saveSettings(settings);
    onChange?.();
    markInteraction();
  });
}

export function updateHalftoneVisibility(ui, settings){
  if(!ui?.halftoneSettings) return;
  const isGrid = (settings.mode === "grid");
  ui.halftoneSettings.classList.toggle("is-hidden", !isGrid);
}

export function updateMotionVisibility(ui, settings){
  const effect = settings.animEffect ?? "all";
  if(ui?.motionSwirl){
    ui.motionSwirl.classList.toggle("is-hidden", !(effect === "all" || effect === "swirl"));
  }
  if(ui?.motionJitter){
    ui.motionJitter.classList.toggle("is-hidden", !(effect === "all" || effect === "jitter"));
  }
  if(ui?.motionOsc){
    ui.motionOsc.classList.toggle("is-hidden", !(effect === "all" || effect === "oscillation"));
  }
}

export function syncUIFromSettings(ui, settings){
  ui.autoplay.value = settings.autoplay ? "1" : "0";
  ui.interval.value = settings.interval;
  ui.transition.value = settings.transition;
  ui.particles.value = settings.maxParticles;
  ui.mode.value = settings.mode;
  ui.blend.value = settings.blend;
  ui.dither.value = settings.dither;
  ui.shape.value = settings.shape;
  ui.animEffect.value = settings.animEffect;
  ui.dotsize.value = settings.dotSize;
  ui.dotsizeVal.textContent = String(settings.dotSize);
  ui.sizeVariance.value = settings.sizeVariance;
  ui.sizeVarianceVal.textContent = String(settings.sizeVariance);
  ui.softness.value = settings.softness;
  ui.softnessVal.textContent = String(settings.softness);
  ui.threshold.value = settings.threshold;
  ui.thresholdVal.textContent = String(settings.threshold);
  ui.swirl.value = settings.swirl;
  ui.swirlVal.textContent = String(settings.swirl);
  ui.jitter.value = settings.jitter;
  ui.jitterVal.textContent = String(settings.jitter);
  ui.ditherStrength.value = settings.ditherStrength;
  ui.ditherStrengthVal.textContent = String(settings.ditherStrength);
  ui.brightness.value = settings.brightness;
  ui.brightnessVal.textContent = String(settings.brightness);
  ui.contrast.value = settings.contrast;
  ui.contrastVal.textContent = String(settings.contrast);
  ui.saturation.value = settings.saturation;
  ui.saturationVal.textContent = String(settings.saturation);
  ui.gamma.value = settings.gamma;
  ui.gammaVal.textContent = String(settings.gamma);
  ui.gridSize.value = settings.gridSize;
  ui.smoothing.value = settings.smoothing;
  ui.ditherType.value = settings.ditherType;
  ui.oscMode.value = settings.oscMode;
  ui.oscAmplitude.value = settings.oscAmplitude;
  ui.oscAmplitudeVal.textContent = String(settings.oscAmplitude);
  ui.oscFrequency.value = settings.oscFrequency;
  ui.oscFrequencyVal.textContent = String(settings.oscFrequency);
  ui.oscSpeed.value = settings.oscSpeed;
  ui.oscSpeedVal.textContent = String(settings.oscSpeed);
}
