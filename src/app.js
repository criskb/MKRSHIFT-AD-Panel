import * as THREE from "three";
import { clamp, lerp, ease, nowS, mulberry32 } from "./utils.js";
import { loadSettings, saveSettings, DEFAULTS } from "./settings.js";
import { VERT, FRAG } from "./shaders.js";
import { sampleCanvasToParticles } from "./sampling.js";
import { makeTextCanvas, makeImageCanvas, makeVideoCanvas } from "./slideCanvas.js";

export function initApp(){
  const settings = loadSettings();

  const el = (id) => document.getElementById(id);
  const panel = el("panel");
  const mediaPool = el("mediaPool");
  const btnClose = el("btnClose");
  const btnFullscreen = el("btnFullscreen");
  const btnHide = el("btnHide");
  const dz = el("dropzone");

  const toastEl = el("toast");
  let toastTimer = null;
  function toast(msg){
    if(!toastEl) return;
    toastEl.textContent = String(msg || "");
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>toastEl.classList.remove("show"), 2400);
  }

  function setPanelVisible(v){
    panel.classList.toggle("hidden", !v);
    if(v) markInteraction();
  }

  btnClose.addEventListener("click", () => setPanelVisible(false));
  btnFullscreen.addEventListener("click", () => toggleFullscreen());
  btnHide.addEventListener("click", () => toggleUI());

  const ui = {
    autoplay: el("autoplay"),
    interval: el("interval"),
    transition: el("transition"),
    particles: el("particles"),
    dotsize: el("dotsize"),
    dotsizeVal: el("dotsizeVal"),
    sizeVariance: el("sizeVariance"),
    sizeVarianceVal: el("sizeVarianceVal"),
    shape: el("shape"),
    softness: el("softness"),
    softnessVal: el("softnessVal"),
    mode: el("mode"),
    dither: el("dither"),
    ditherStrength: el("ditherStrength"),
    ditherStrengthVal: el("ditherStrengthVal"),
    threshold: el("threshold"),
    thresholdVal: el("thresholdVal"),
    swirl: el("swirl"),
    swirlVal: el("swirlVal"),
    jitter: el("jitter"),
    jitterVal: el("jitterVal"),
    blend: el("blend"),
    brightness: el("brightness"),
    brightnessVal: el("brightnessVal"),
    contrast: el("contrast"),
    contrastVal: el("contrastVal"),
    saturation: el("saturation"),
    saturationVal: el("saturationVal"),
    gamma: el("gamma"),
    gammaVal: el("gammaVal"),
    gridSize: el("gridSize"),
    smoothing: el("smoothing"),
    ditherType: el("ditherType"),
    halftoneSettings: el("halftoneSettings"),
    oscMode: el("oscMode"),
    oscAmplitude: el("oscAmplitude"),
    oscAmplitudeVal: el("oscAmplitudeVal"),
    oscFrequency: el("oscFrequency"),
    oscFrequencyVal: el("oscFrequencyVal"),
    oscSpeed: el("oscSpeed"),
    oscSpeedVal: el("oscSpeedVal"),
    file: el("file"),
    btnAdd: el("btnAdd"),
    textTitle: el("textTitle"),
    textSub: el("textSub"),
    btnAddText: el("btnAddText"),
    btnPrev: el("btnPrev"),
    btnNext: el("btnNext"),
    btnRemove: el("btnRemove"),
    resetButton: el("resetButton"),
    saveButton: el("saveButton"),
    btnLoadProject: el("btnLoadProject"),
    projectFile: el("projectFile"),
    timeline: el("timelineDock"),
  };

  const SLIDE_OVERRIDE_KEYS = [
    "dotSize",
    "softness",
    "threshold",
    "mode",
    "dither",
    "ditherStrength",
    "brightness",
    "contrast",
    "saturation",
    "gamma",
    "blend",
    "shape",
    "swirl",
    "jitter",
    "oscMode",
    "oscAmplitude",
    "oscFrequency",
    "oscSpeed",
  ];

  const ANIM_SAMPLE_FPS = 12;
  let lastAnimSample = 0;
  let currentSlide = null;
  let nextAuto = 0;

  ui.btnAdd.addEventListener("click", ()=> ui.file.click());
  ui.file.addEventListener("change", async () => {
    const files = [...ui.file.files].filter(isSupportedFile);
    if (!files.length) return;
    toast(`Loading ${files.length} file(s)...`);
    try{
      await addFilesAsSlides(files);
    }catch(err){
      console.error(err);
      toast("Could not load one or more images - see console");
    }
    ui.file.value = "";
    markInteraction();
  });

  ui.btnAddText.addEventListener("click", ()=>{
    const title = (ui.textTitle.value || "MKRShift").trim();
    const sub = (ui.textSub.value || "").trim();
    const slide = { type:"text", title, sub };
    ensureSlideId(slide);
    slides.push(slide);
    currentSlideIndex = slides.length - 1;
    setCurrentSlide(currentSlideIndex);
    renderTimeline();
    markInteraction();
  });

  ui.btnPrev.addEventListener("click", ()=>{ prevSlide(); markInteraction(); });
  ui.btnNext.addEventListener("click", ()=>{ nextSlide(); markInteraction(); });
  ui.btnRemove.addEventListener("click", ()=>{
    if(slides.length <= 1) return;
    slides.splice(currentSlideIndex,1);
    currentSlideIndex = (currentSlideIndex + slides.length) % slides.length;
    setCurrentSlide(currentSlideIndex);
    renderTimeline();
    markInteraction();
  });

  ui.saveButton.addEventListener("click", ()=>{ void saveProject(); });
  ui.btnLoadProject.addEventListener("click", ()=> ui.projectFile.click());
  ui.projectFile.addEventListener("change", ()=> {
    const file = ui.projectFile.files?.[0];
    if(!file) return;
    void loadProjectFromFile(file);
    ui.projectFile.value = "";
  });

  ui.resetButton.addEventListener("click", ()=>{
    Object.assign(settings, DEFAULTS);
    saveSettings(settings);
    syncUIFromSettings();
    updateSizeVariance();
    rebuildParticles();
    renderTimeline();
    nextAuto = nowS() + getSlideDuration(slides[currentSlideIndex]);
    markInteraction();
  });

  // Drag & drop
  ["dragenter","dragover"].forEach(ev=>{
    window.addEventListener(ev, (e)=>{
      e.preventDefault();
      dz.classList.add("drag");
    });
  });
  ["dragleave","drop"].forEach(ev=>{
    window.addEventListener(ev, (e)=>{
      e.preventDefault();
      dz.classList.remove("drag");
    });
  });
  window.addEventListener("drop", async (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter(isSupportedFile);
    if (!files.length) return;
    toast(`Loading ${files.length} file(s)...`);
    try{
      await addFilesAsSlides(files);
    }catch(err){
      console.error(err);
      toast("Could not load one or more images - see console");
    }
    markInteraction();
  });

  // Hotkeys
  window.addEventListener("keydown", (e)=>{
    if(e.key === "h" || e.key === "H") toggleUI();
    if(e.key === "s" || e.key === "S") setPanelVisible(panel.classList.contains("hidden"));
    if(e.key === "f" || e.key === "F") toggleFullscreen();
    if(e.key === "ArrowRight") nextSlide();
    if(e.key === "ArrowLeft") prevSlide();
  });

  // Auto-hide panel after inactivity
  let lastInteraction = performance.now();
  function markInteraction(){ lastInteraction = performance.now(); }
  window.addEventListener("pointerdown", markInteraction, {passive:true});
  window.addEventListener("pointermove", markInteraction, {passive:true});

  function maybeAutoHideUI(){
    if(document.body.classList.contains("kiosk")) return;
    const idleMs = performance.now() - lastInteraction;
    if(!panel.classList.contains("hidden") && idleMs > 14000) setPanelVisible(false);
  }

  function toggleUI(){
    const kiosk = document.body.classList.toggle("kiosk");
    if(!kiosk) setPanelVisible(true);
    else setPanelVisible(false);
  }

  async function toggleFullscreen(){
    try{
      if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch(err){
      console.warn("Fullscreen failed", err);
    }
  }

  const params = new URLSearchParams(location.search);
  if(params.get("kiosk") === "1") document.body.classList.add("kiosk");

  const container = document.getElementById("app");
  const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:"high-performance" });
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1,1,1,-1,-1000,1000);

  function updateCamera(){
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.left = -w/2;
    camera.right = w/2;
    camera.top = h/2;
    camera.bottom = -h/2;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    material.uniforms.uDpr.value = renderer.getPixelRatio();
    updateScaleUniform();
  }

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uMorph: { value: 1 },
      uScale: { value: 1 },
      uPointSize: { value: settings.dotSize },
      uDpr: { value: renderer.getPixelRatio() },
      uSoftness: { value: settings.softness },
      uShape: { value: settings.shape === "square" ? 1 : settings.shape === "diamond" ? 2 : settings.shape === "pixel" ? 3 : 0 },
      uSwirl: { value: settings.swirl },
      uJitter: { value: settings.jitter },
      uOscAmplitude: { value: settings.oscAmplitude },
      uOscFrequency: { value: settings.oscFrequency },
      uOscSpeed: { value: settings.oscSpeed },
      uOscMode: { value: settings.oscMode === "grid" ? 1 : settings.oscMode === "radial" ? 2 : 0 },
    }
  });

  function applyBlend(blendMode = settings.blend){
    material.blending = (blendMode === "add") ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.needsUpdate = true;
  }

  function applyRenderSettings(activeSettings){
    material.uniforms.uPointSize.value = activeSettings.dotSize;
    material.uniforms.uSoftness.value = activeSettings.softness;
    material.uniforms.uSwirl.value = activeSettings.swirl;
    material.uniforms.uJitter.value = activeSettings.jitter;
    material.uniforms.uOscAmplitude.value = activeSettings.oscAmplitude;
    material.uniforms.uOscFrequency.value = activeSettings.oscFrequency;
    material.uniforms.uOscSpeed.value = activeSettings.oscSpeed;
    material.uniforms.uOscMode.value = activeSettings.oscMode === "grid"
      ? 1
      : activeSettings.oscMode === "radial"
        ? 2
        : 0;
    material.uniforms.uShape.value = activeSettings.shape === "square"
      ? 1
      : activeSettings.shape === "diamond"
        ? 2
        : activeSettings.shape === "pixel"
          ? 3
          : 0;
    applyBlend(activeSettings.blend);
  }

  function bindRange(rangeEl, outEl, key, onChange){
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

  function getEffectiveSettings(slide){
    if(!slide?.overrides) return settings;
    return { ...settings, ...slide.overrides };
  }

  function getSlideDuration(slide){
    return clamp(parseFloat(slide?.duration ?? settings.interval) || settings.interval, 2, 60);
  }

  function getSlideTransition(slide){
    return clamp(parseFloat(slide?.transition ?? settings.transition) || settings.transition, 0.6, 10);
  }

  function syncUIFromSettings(){
    ui.autoplay.value = settings.autoplay ? "1" : "0";
    ui.interval.value = settings.interval;
    ui.transition.value = settings.transition;
    ui.particles.value = settings.maxParticles;
    ui.mode.value = settings.mode;
    ui.blend.value = settings.blend;
    ui.dither.value = settings.dither;
    ui.shape.value = settings.shape;
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
    updateHalftoneVisibility();
  }

  bindRange(ui.dotsize, ui.dotsizeVal, "dotSize", ()=>{
    applyRenderSettings(getEffectiveSettings(currentSlide));
    syncParticlesToDotSize();
  });
  bindRange(ui.sizeVariance, ui.sizeVarianceVal, "sizeVariance", ()=>{
    updateSizeVariance();
    markInteraction();
  });
  bindRange(ui.softness, ui.softnessVal, "softness", ()=> applyRenderSettings(getEffectiveSettings(currentSlide)));
  bindRange(ui.threshold, ui.thresholdVal, "threshold", ()=>{});
  bindRange(ui.swirl, ui.swirlVal, "swirl", ()=> applyRenderSettings(getEffectiveSettings(currentSlide)));
  bindRange(ui.jitter, ui.jitterVal, "jitter", ()=> applyRenderSettings(getEffectiveSettings(currentSlide)));
  ui.shape.addEventListener("change", ()=>{
    settings.shape = ui.shape.value;
    saveSettings(settings);
    applyRenderSettings(getEffectiveSettings(currentSlide));
    markInteraction();
  });
  bindRange(ui.ditherStrength, ui.ditherStrengthVal, "ditherStrength", ()=>{ refreshSlide(true); });
  bindRange(ui.brightness, ui.brightnessVal, "brightness", ()=>{ refreshSlide(true); });
  bindRange(ui.contrast, ui.contrastVal, "contrast", ()=>{ refreshSlide(true); });
  bindRange(ui.saturation, ui.saturationVal, "saturation", ()=>{ refreshSlide(true); });
  bindRange(ui.gamma, ui.gammaVal, "gamma", ()=>{ refreshSlide(true); });
  bindRange(ui.oscAmplitude, ui.oscAmplitudeVal, "oscAmplitude", ()=> applyRenderSettings(getEffectiveSettings(currentSlide)));
  bindRange(ui.oscFrequency, ui.oscFrequencyVal, "oscFrequency", ()=> applyRenderSettings(getEffectiveSettings(currentSlide)));
  bindRange(ui.oscSpeed, ui.oscSpeedVal, "oscSpeed", ()=> applyRenderSettings(getEffectiveSettings(currentSlide)));

  syncUIFromSettings();

  function updateHalftoneVisibility(){
    if(!ui.halftoneSettings) return;
    const isGrid = (settings.mode === "grid");
    ui.halftoneSettings.classList.toggle("is-hidden", !isGrid);
  }

  ui.gridSize.addEventListener("input", ()=>{
    settings.gridSize = clamp(parseInt(ui.gridSize.value || "16", 10), 2, 200);
    ui.gridSize.value = settings.gridSize;
    saveSettings(settings);
    refreshSlide(true);
    markInteraction();
  });
  ui.smoothing.addEventListener("input", ()=>{
    settings.smoothing = clamp(parseFloat(ui.smoothing.value || "0"), 0, 1);
    ui.smoothing.value = settings.smoothing;
    saveSettings(settings);
    refreshSlide(true);
    markInteraction();
  });
  ui.ditherType.addEventListener("change", ()=>{
    settings.ditherType = ui.ditherType.value;
    saveSettings(settings);
    refreshSlide(true);
    markInteraction();
  });

  ui.autoplay.addEventListener("change", ()=>{
    settings.autoplay = ui.autoplay.value === "1";
    saveSettings(settings);
    nextAuto = nowS() + getSlideDuration(currentSlide);
    markInteraction();
  });
  ui.interval.addEventListener("change", ()=>{
    settings.interval = clamp(parseFloat(ui.interval.value)||8,2,60);
    ui.interval.value = settings.interval;
    saveSettings(settings);
    nextAuto = nowS() + getSlideDuration(currentSlide);
    markInteraction();
  });
  ui.transition.addEventListener("change", ()=>{
    settings.transition = clamp(parseFloat(ui.transition.value)||2.2,0.6,10);
    ui.transition.value = settings.transition;
    saveSettings(settings);
    if(!transitioning){
      morphDur = getSlideTransition(currentSlide);
    }
    markInteraction();
  });
  ui.particles.addEventListener("change", ()=>{
    const v = clamp(parseInt(ui.particles.value||"18000",10), 1, 80000);
    ui.particles.value = v;
    settings.maxParticles = v;
    saveSettings(settings);
    rebuildParticles();
    markInteraction();
  });

  function syncParticlesToDotSize(){
    if(currentSlide?.overrides?.dotSize != null) return;
    const baseSize = 2.2;
    const baseParticles = 18000;
    const next = Math.round(baseParticles * Math.pow(baseSize / Math.max(settings.dotSize, 0.1), 2));
    const v = clamp(next, 1, 80000);
    if(v === settings.maxParticles) return;
    settings.maxParticles = v;
    ui.particles.value = v;
    saveSettings(settings);
    rebuildParticles();
  }

  function sizeFromVariance(rng, variance){
    const offset = (rng() * 2 - 1) * variance;
    return Math.max(0.1, 1 + offset);
  }

  function updateSizeVariance(){
    if(!aSize) return;
    const variance = clamp(settings.sizeVariance ?? 0, 0, 1);
    const rng = mulberry32(123456);
    for(let i=0;i<settings.maxParticles;i++){
      aSize[i] = sizeFromVariance(rng, variance);
    }
    geometry.attributes.aSize.needsUpdate = true;
  }

  ui.mode.addEventListener("change", ()=>{
    settings.mode = ui.mode.value;
    saveSettings(settings);
    updateHalftoneVisibility();
    refreshSlide(true);
    markInteraction();
  });
  ui.dither.addEventListener("change", ()=>{settings.dither = ui.dither.value; saveSettings(settings); refreshSlide(true); markInteraction();});
  ui.brightness.addEventListener("change", ()=>{settings.brightness = parseFloat(ui.brightness.value); saveSettings(settings); refreshSlide(true); markInteraction();});
  ui.contrast.addEventListener("change", ()=>{settings.contrast = parseFloat(ui.contrast.value); saveSettings(settings); refreshSlide(true); markInteraction();});
  ui.saturation.addEventListener("change", ()=>{settings.saturation = parseFloat(ui.saturation.value); saveSettings(settings); refreshSlide(true); markInteraction();});
  ui.gamma.addEventListener("change", ()=>{settings.gamma = parseFloat(ui.gamma.value); saveSettings(settings); refreshSlide(true); markInteraction();});
  ui.oscMode.addEventListener("change", ()=>{
    settings.oscMode = ui.oscMode.value;
    applyRenderSettings(getEffectiveSettings(currentSlide));
    saveSettings(settings);
    markInteraction();
  });
  ui.blend.addEventListener("change", ()=>{
    settings.blend = ui.blend.value;
    saveSettings(settings);
    applyRenderSettings(getEffectiveSettings(currentSlide));
    markInteraction();
  });

  let geometry = null;
  let points = null;

  let morphStart = 0;
  let morphDur = settings.transition;
  let transitioning = false;

  let currentImgAspect = 1;

  let slideIdCounter = 0;
  function ensureSlideId(slide){
    if(slide.id) return;
    slideIdCounter += 1;
    slide.id = slideIdCounter;
  }

  let slides = [
    { type:"text", title:"MKRShift", sub:"3D • AI • Creative Tech" },
    { type:"text", title:"PRINT" , sub:"Prototypes • Toys • Props" },
    { type:"text", title:"DESIGN" , sub:"Concepts • Visuals • Tools" },
  ];
  slides.forEach(ensureSlideId);
  let currentSlideIndex = 0;

  let aStart, aEnd, aColorStart, aColorEnd, aAlphaStart, aAlphaEnd, aSeed, aSize;

  function createSlideOverrides(){
    const overrides = {};
    for(const key of SLIDE_OVERRIDE_KEYS){
      overrides[key] = settings[key];
    }
    return overrides;
  }

  function attachAnimatedImage(img){
    if(!mediaPool) return;
    if(img.dataset?.attached === "true") return;
    img.dataset.attached = "true";
    mediaPool.appendChild(img);
  }

  function attachAnimatedVideo(video){
    if(!mediaPool) return;
    if(video.dataset?.attached === "true") return;
    video.dataset.attached = "true";
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    mediaPool.appendChild(video);
    video.play().catch(()=>{});
  }

  function updateTimelineActive(){
    if(!ui.timeline) return;
    const cards = ui.timeline.querySelectorAll(".timeline-card");
    cards.forEach((card, index) => {
      card.classList.toggle("active", index === currentSlideIndex);
    });
  }

  function applySlideOverrides(slide){
    const activeSettings = { ...getEffectiveSettings(slide), stableSample: slide.stableSample };
    applyRenderSettings(activeSettings);
  }

  function createLabeledInput(labelText, inputEl){
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("label");
    label.textContent = labelText;
    const ctl = document.createElement("div");
    ctl.className = "ctl";
    ctl.appendChild(inputEl);
    row.append(label, ctl);
    return row;
  }

  function renderTimeline(){
    if(!ui.timeline) return;
    ui.timeline.innerHTML = "";
    slides.forEach((slide, index) => {
      ensureSlideId(slide);
      const card = document.createElement("div");
      card.className = "timeline-card";
      if(index === currentSlideIndex) card.classList.add("active");

      const header = document.createElement("div");
      header.className = "timeline-header";

      const titleWrap = document.createElement("div");
      titleWrap.className = "timeline-title";
      const title = document.createElement("div");
      title.textContent = slide.type === "text" ? slide.title || "Text slide" : slide.name || "Media";
      const meta = document.createElement("span");
      meta.textContent = slide.type.toUpperCase();
      titleWrap.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "timeline-actions";

      const btnSelect = document.createElement("button");
      btnSelect.className = "btn tiny";
      btnSelect.textContent = "Select";
      btnSelect.addEventListener("click", () => {
        setCurrentSlide(index);
      });

      const btnUp = document.createElement("button");
      btnUp.className = "btn tiny";
      btnUp.textContent = "↑";
      btnUp.disabled = index === 0;
      btnUp.addEventListener("click", () => {
        if(index === 0) return;
        const tmp = slides[index - 1];
        slides[index - 1] = slides[index];
        slides[index] = tmp;
        if(currentSlideIndex === index) currentSlideIndex -= 1;
        else if(currentSlideIndex === index - 1) currentSlideIndex += 1;
        renderTimeline();
        markInteraction();
      });

      const btnDown = document.createElement("button");
      btnDown.className = "btn tiny";
      btnDown.textContent = "↓";
      btnDown.disabled = index === slides.length - 1;
      btnDown.addEventListener("click", () => {
        if(index >= slides.length - 1) return;
        const tmp = slides[index + 1];
        slides[index + 1] = slides[index];
        slides[index] = tmp;
        if(currentSlideIndex === index) currentSlideIndex += 1;
        else if(currentSlideIndex === index + 1) currentSlideIndex -= 1;
        renderTimeline();
        markInteraction();
      });

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn tiny";
      btnDelete.textContent = "✕";
      btnDelete.disabled = slides.length <= 1;
      btnDelete.addEventListener("click", () => {
        if(slides.length <= 1) return;
        slides.splice(index, 1);
        if(currentSlideIndex >= slides.length) currentSlideIndex = slides.length - 1;
        renderTimeline();
        setCurrentSlide(currentSlideIndex);
        markInteraction();
      });

      actions.append(btnSelect, btnUp, btnDown, btnDelete);
      header.append(titleWrap, actions);

      const settingsWrap = document.createElement("div");
      settingsWrap.className = "timeline-settings";
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Slide settings";
      details.appendChild(summary);

      const useGlobal = document.createElement("input");
      useGlobal.type = "checkbox";
      useGlobal.checked = !slide.overrides;
      const useGlobalRow = createLabeledInput("Use global settings", useGlobal);
      details.appendChild(useGlobalRow);

      const durationInput = document.createElement("input");
      durationInput.type = "number";
      durationInput.min = "2";
      durationInput.max = "60";
      durationInput.step = "0.5";
      durationInput.value = String(slide.duration ?? settings.interval);
      durationInput.addEventListener("change", () => {
        slide.duration = getSlideDuration({ duration: durationInput.value });
        durationInput.value = String(slide.duration);
        if(index === currentSlideIndex){
          nextAuto = nowS() + getSlideDuration(slide);
        }
        markInteraction();
      });
      details.appendChild(createLabeledInput("Duration (sec)", durationInput));

      const transitionInput = document.createElement("input");
      transitionInput.type = "number";
      transitionInput.min = "0.6";
      transitionInput.max = "10";
      transitionInput.step = "0.1";
      transitionInput.value = String(slide.transition ?? settings.transition);
      transitionInput.addEventListener("change", () => {
        slide.transition = getSlideTransition({ transition: transitionInput.value });
        transitionInput.value = String(slide.transition);
        markInteraction();
      });
      details.appendChild(createLabeledInput("Transition (sec)", transitionInput));

      const controlFields = [
        { key: "dotSize", label: "Particle size", type: "range", min: 0.6, max: 50, step: 0.1 },
        { key: "softness", label: "Sharpness", type: "range", min: 0.02, max: 0.35, step: 0.01 },
        { key: "threshold", label: "Threshold", type: "range", min: 0.05, max: 0.95, step: 0.01 },
        { key: "ditherStrength", label: "Dither strength", type: "range", min: 0, max: 1, step: 0.01 },
        { key: "brightness", label: "Brightness", type: "range", min: -0.5, max: 0.5, step: 0.01 },
        { key: "contrast", label: "Contrast", type: "range", min: 0.5, max: 2, step: 0.01 },
        { key: "saturation", label: "Saturation", type: "range", min: 0, max: 2, step: 0.01 },
        { key: "gamma", label: "Gamma", type: "range", min: 0.5, max: 2.5, step: 0.01 },
        { key: "swirl", label: "Swirl", type: "range", min: 0, max: 6, step: 0.1 },
        { key: "jitter", label: "Jitter", type: "range", min: 0, max: 2.5, step: 0.05 },
        { key: "oscAmplitude", label: "Osc amplitude", type: "range", min: 0, max: 6, step: 0.05 },
        { key: "oscFrequency", label: "Osc frequency", type: "range", min: 0.5, max: 12, step: 0.1 },
        { key: "oscSpeed", label: "Osc speed", type: "range", min: 0, max: 6, step: 0.05 },
      ];

      const selects = [
        {
          key: "shape",
          label: "Shape",
          options: [
            { value: "dot", label: "Dot" },
            { value: "square", label: "Square" },
            { value: "diamond", label: "Diamond" },
            { value: "pixel", label: "Pixel" },
          ],
        },
        {
          key: "mode",
          label: "Sampling mode",
          options: [
            { value: "auto", label: "Auto" },
            { value: "silhouette", label: "Silhouette" },
            { value: "edges", label: "Edges" },
            { value: "full", label: "Full image" },
            { value: "grid", label: "Grid halftone" },
          ],
        },
        {
          key: "dither",
          label: "Dither",
          options: [
            { value: "none", label: "None" },
            { value: "bayer2", label: "Bayer 2×2" },
            { value: "bayer4", label: "Bayer 4×4" },
            { value: "random", label: "Random" },
          ],
        },
        {
          key: "blend",
          label: "Blending",
          options: [
            { value: "add", label: "Additive" },
            { value: "normal", label: "Normal" },
          ],
        },
        {
          key: "oscMode",
          label: "Oscillation",
          options: [
            { value: "none", label: "None" },
            { value: "grid", label: "Grid" },
            { value: "radial", label: "Radial" },
          ],
        },
      ];

      const controlInputs = [];
      const syncControlValues = () => {
        const source = slide.overrides ?? settings;
        controlInputs.forEach(({ input, key }) => {
          input.value = String(source[key]);
        });
      };

      controlFields.forEach((field) => {
        const input = document.createElement("input");
        input.type = field.type;
        input.min = String(field.min);
        input.max = String(field.max);
        input.step = String(field.step);
        input.value = String((slide.overrides ?? settings)[field.key]);
        input.addEventListener("input", () => {
          if(!slide.overrides) return;
          slide.overrides[field.key] = parseFloat(input.value);
          if(index === currentSlideIndex){
            applySlideOverrides(slide);
            refreshSlide(true);
          }
          markInteraction();
        });
        controlInputs.push({ input, key: field.key });
        details.appendChild(createLabeledInput(field.label, input));
      });

      selects.forEach((field) => {
        const select = document.createElement("select");
        field.options.forEach((opt) => {
          const option = document.createElement("option");
          option.value = opt.value;
          option.textContent = opt.label;
          select.appendChild(option);
        });
        select.value = (slide.overrides ?? settings)[field.key];
        select.addEventListener("change", () => {
          if(!slide.overrides) return;
          slide.overrides[field.key] = select.value;
          if(index === currentSlideIndex){
            applySlideOverrides(slide);
            refreshSlide(true);
          }
          markInteraction();
        });
        controlInputs.push({ input: select, key: field.key });
        details.appendChild(createLabeledInput(field.label, select));
      });

      const disableControls = (disabled) => {
        controlInputs.forEach(({ input }) => {
          input.disabled = disabled;
        });
      };
      disableControls(!slide.overrides);

      useGlobal.addEventListener("change", () => {
        slide.overrides = useGlobal.checked ? null : createSlideOverrides();
        syncControlValues();
        disableControls(useGlobal.checked);
        if(index === currentSlideIndex){
          applySlideOverrides(slide);
          refreshSlide(true);
        }
        markInteraction();
      });

      settingsWrap.appendChild(details);
      card.append(header, settingsWrap);
      ui.timeline.appendChild(card);
    });
  }

  function rebuildParticles(){
    if(points){
      scene.remove(points);
      geometry?.dispose();
    }

    const N = settings.maxParticles;
    geometry = new THREE.BufferGeometry();

    aStart = new Float32Array(N * 3);
    aEnd = new Float32Array(N * 3);
    aColorStart = new Float32Array(N * 3);
    aColorEnd = new Float32Array(N * 3);
    aAlphaStart = new Float32Array(N);
    aAlphaEnd = new Float32Array(N);
    aSeed = new Float32Array(N);
    aSize = new Float32Array(N);

    const rng = mulberry32(123456);
    const variance = clamp(settings.sizeVariance ?? 0, 0, 1);
    for(let i=0;i<N;i++){
      const ang = rng()*Math.PI*2;
      const rad = 2.8 + rng()*2.2;
      const x = Math.cos(ang)*rad;
      const y = Math.sin(ang)*rad;
      const z = (rng()*2-1)*0.08;

      aStart[i*3+0] = x;
      aStart[i*3+1] = y;
      aStart[i*3+2] = z;
      aEnd[i*3+0] = x;
      aEnd[i*3+1] = y;
      aEnd[i*3+2] = z;

      aColorStart[i*3+0] = 1;
      aColorStart[i*3+1] = 1;
      aColorStart[i*3+2] = 1;
      aColorEnd[i*3+0] = 1;
      aColorEnd[i*3+1] = 1;
      aColorEnd[i*3+2] = 1;

      aAlphaStart[i] = 0;
      aAlphaEnd[i] = 0;
      aSeed[i] = rng();
      aSize[i] = sizeFromVariance(rng, variance);
    }

    geometry.setAttribute("aStart", new THREE.BufferAttribute(aStart, 3));
    geometry.setAttribute("aEnd", new THREE.BufferAttribute(aEnd, 3));
    geometry.setAttribute("position", new THREE.BufferAttribute(aEnd, 3));
    geometry.setAttribute("aColorStart", new THREE.BufferAttribute(aColorStart, 3));
    geometry.setAttribute("aColorEnd", new THREE.BufferAttribute(aColorEnd, 3));
    geometry.setAttribute("aAlphaStart", new THREE.BufferAttribute(aAlphaStart, 1));
    geometry.setAttribute("aAlphaEnd", new THREE.BufferAttribute(aAlphaEnd, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(aSize, 1));

    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10000);
    points = new THREE.Points(geometry, material);
    points.frustumCulled = false;

    currentSlideIndex = clamp(currentSlideIndex, 0, slides.length-1);
    void applySlide(slides[currentSlideIndex]);
    updateTimelineActive();
    nextAuto = nowS() + getSlideDuration(slides[currentSlideIndex]);

    scene.add(points);
  }

  function bakeCurrentToStart(){
    const N = settings.maxParticles;
    const t = transitioning ? clamp((nowS() - morphStart) / morphDur, 0, 1) : 1;
    const m = ease(t);

    for(let i=0;i<N;i++){
      const i3 = i*3;
      aStart[i3+0] = lerp(aStart[i3+0], aEnd[i3+0], m);
      aStart[i3+1] = lerp(aStart[i3+1], aEnd[i3+1], m);
      aStart[i3+2] = lerp(aStart[i3+2], aEnd[i3+2], m);
      aColorStart[i3+0] = lerp(aColorStart[i3+0], aColorEnd[i3+0], m);
      aColorStart[i3+1] = lerp(aColorStart[i3+1], aColorEnd[i3+1], m);
      aColorStart[i3+2] = lerp(aColorStart[i3+2], aColorEnd[i3+2], m);
      aAlphaStart[i] = lerp(aAlphaStart[i], aAlphaEnd[i], m);
    }

    geometry.attributes.aStart.needsUpdate = true;
    geometry.attributes.aColorStart.needsUpdate = true;
    geometry.attributes.aAlphaStart.needsUpdate = true;
  }

  function writeEndFromSample(sample){
    const N = settings.maxParticles;
    const M = sample.count;
    const sampleAlpha = sample.alpha;

    for(let i=0;i<N;i++){
      const i3 = i*3;
      if(i < M){
        aEnd[i3+0] = sample.pos[i3+0];
        aEnd[i3+1] = sample.pos[i3+1];
        aEnd[i3+2] = sample.pos[i3+2];

        aColorEnd[i3+0] = sample.col[i3+0];
        aColorEnd[i3+1] = sample.col[i3+1];
        aColorEnd[i3+2] = sample.col[i3+2];

        aAlphaEnd[i] = sampleAlpha ? sampleAlpha[i] : 1;
      } else {
        const r = 3.2 + Math.random()*2.4;
        const a = Math.random()*Math.PI*2;
        aEnd[i3+0] = Math.cos(a)*r;
        aEnd[i3+1] = Math.sin(a)*r;
        aEnd[i3+2] = (Math.random()*2-1)*0.12;

        aColorEnd[i3+0] = 1;
        aColorEnd[i3+1] = 1;
        aColorEnd[i3+2] = 1;

        aAlphaEnd[i] = 0;
      }
    }

    geometry.attributes.aEnd.needsUpdate = true;
    geometry.attributes.aColorEnd.needsUpdate = true;
    geometry.attributes.aAlphaEnd.needsUpdate = true;
    geometry.attributes.position.needsUpdate = true;
  }

  function writeInstantFromSample(sample, options = {}){
    const N = settings.maxParticles;
    const M = sample.count;
    const sampleAlpha = sample.alpha;
    const lockColor = Boolean(options.lockColor);
    const keepMissing = Boolean(options.keepMissing);
    for(let i=0;i<N;i++){
      const i3 = i*3;
      if(i < M){
        const px = sample.pos[i3+0];
        const py = sample.pos[i3+1];
        const pz = sample.pos[i3+2];
        aEnd[i3+0] = px; aEnd[i3+1] = py; aEnd[i3+2] = pz;
        aStart[i3+0] = px; aStart[i3+1] = py; aStart[i3+2] = pz;

        if(!lockColor){
          const cr = sample.col[i3+0];
          const cg = sample.col[i3+1];
          const cb = sample.col[i3+2];
          aColorEnd[i3+0] = cr; aColorEnd[i3+1] = cg; aColorEnd[i3+2] = cb;
          aColorStart[i3+0] = cr; aColorStart[i3+1] = cg; aColorStart[i3+2] = cb;
        }

        const alpha = sampleAlpha ? sampleAlpha[i] : 1;
        aAlphaEnd[i] = alpha;
        aAlphaStart[i] = alpha;
      } else {
        const r = 3.2 + Math.random()*2.4;
        const a = Math.random()*Math.PI*2;
        const px = Math.cos(a)*r;
        const py = Math.sin(a)*r;
        const pz = (Math.random()*2-1)*0.12;
        if(!keepMissing){
          aEnd[i3+0] = px; aEnd[i3+1] = py; aEnd[i3+2] = pz;
          aStart[i3+0] = px; aStart[i3+1] = py; aStart[i3+2] = pz;
        }

        if(!lockColor){
          aColorEnd[i3+0] = 1; aColorEnd[i3+1] = 1; aColorEnd[i3+2] = 1;
          aColorStart[i3+0] = 1; aColorStart[i3+1] = 1; aColorStart[i3+2] = 1;
        }

        if(!keepMissing){
          aAlphaEnd[i] = 0;
          aAlphaStart[i] = 0;
        }
      }
    }

    geometry.attributes.aStart.needsUpdate = true;
    geometry.attributes.aEnd.needsUpdate = true;
    if(!lockColor){
      geometry.attributes.aColorStart.needsUpdate = true;
      geometry.attributes.aColorEnd.needsUpdate = true;
    }
    geometry.attributes.aAlphaStart.needsUpdate = true;
    geometry.attributes.aAlphaEnd.needsUpdate = true;
    geometry.attributes.position.needsUpdate = true;
    transitioning = false;
    material.uniforms.uMorph.value = 1;
  }

  function updateScaleUniform(){
    const w = window.innerWidth;
    const h = window.innerHeight;
    const fit = 0.9;
    const viewAspect = w / h;
    const imgAspect = currentImgAspect || 1;
    const scale = (viewAspect > imgAspect)
      ? (h/2) * fit
      : (w/(2*imgAspect)) * fit;
    material.uniforms.uScale.value = scale;
  }

  function getVideoCanvas(slide){
    slide.videoCanvas = makeVideoCanvas(slide.video, slide.videoCanvas);
    return slide.videoCanvas;
  }

  function sampleCanvasSafe(canvas, label, activeSettings){
    try{
      return sampleCanvasToParticles(canvas, activeSettings);
    } catch(err){
      if(err?.name === "SecurityError"){
        console.warn("Canvas readback blocked by CORS.", err);
        toast(`Can't sample ${label} due to CORS. Use local files or serve with CORS headers.`);
        return null;
      }
      throw err;
    }
  }

  async function applySlide(slide){
    const t0 = nowS();
    let canvas = null;
    const activeSettings = { ...getEffectiveSettings(slide), stableSample: slide.stableSample };
    applyRenderSettings(activeSettings);

    if(slide.type === "text"){
      canvas = makeTextCanvas(slide.title, slide.sub);
    } else if(slide.type === "image"){
      canvas = await makeImageCanvas(slide.img);
    } else if(slide.type === "video"){
      canvas = getVideoCanvas(slide);
    } else {
      canvas = makeTextCanvas("MKRShift", "");
    }

    const label = slide.type === "video" ? `video "${slide.name ?? "clip"}"` : slide.type;
    let sample = sampleCanvasSafe(canvas, label, activeSettings);
    if(!sample){
      const fallbackCanvas = makeTextCanvas("CORS blocked", "Use local files or same-origin video");
      sample = sampleCanvasToParticles(fallbackCanvas, activeSettings);
    }
    currentSlide = slide;
    currentImgAspect = sample.imgAspect;
    updateScaleUniform();

    bakeCurrentToStart();
    writeEndFromSample(sample);
    slide.hasColorSampled = true;

    morphDur = getSlideTransition(slide);
    morphStart = t0;
    transitioning = true;
    material.uniforms.uMorph.value = 0;
  }

  function refreshSlide(instant = false){
    void applySlideInstant(slides[currentSlideIndex], instant);
  }

  async function applySlideInstant(slide, instant){
    if(!instant){
      await applySlide(slide);
      return;
    }
    let canvas = null;
    const activeSettings = { ...getEffectiveSettings(slide), stableSample: slide.stableSample };
    applyRenderSettings(activeSettings);
    if(slide.type === "text"){
      canvas = makeTextCanvas(slide.title, slide.sub);
    } else if(slide.type === "image"){
      canvas = await makeImageCanvas(slide.img);
    } else if(slide.type === "video"){
      canvas = getVideoCanvas(slide);
    } else {
      canvas = makeTextCanvas("MKRShift", "");
    }
    const label = slide.type === "video" ? `video "${slide.name ?? "clip"}"` : slide.type;
    let sample = sampleCanvasSafe(canvas, label, activeSettings);
    if(!sample){
      const fallbackCanvas = makeTextCanvas("CORS blocked", "Use local files or same-origin video");
      sample = sampleCanvasToParticles(fallbackCanvas, activeSettings);
    }
    currentSlide = slide;
    currentImgAspect = sample.imgAspect;
    updateScaleUniform();
    if(slide.lockColor && slide.hasColorSampled){
      writeInstantFromSample(sample, { lockColor: true, keepMissing: slide.stableSample });
    } else {
      writeInstantFromSample(sample, { keepMissing: slide.stableSample });
      slide.hasColorSampled = true;
    }
  }

  async function addFilesAsSlides(files){
    for(const f of files){
      if(isVideoFile(f)){
        const [video, dataUrl] = await Promise.all([
          loadVideoFromFile(f),
          readFileAsDataURL(f),
        ]);
        attachAnimatedVideo(video);
        const slide = { type:"video", name: f.name, video, animated: true, dataUrl };
        ensureSlideId(slide);
        slides.push(slide);
      } else {
        const [img, dataUrl] = await Promise.all([
          loadImageFromFile(f),
          readFileAsDataURL(f),
        ]);
        const animated = isGifFile(f);
        if(animated){
          attachAnimatedImage(img);
        }
        const slide = {
          type:"image",
          name: f.name,
          img,
          animated,
          dataUrl,
          lockColor: animated,
          hasColorSampled: false,
          stableSample: animated,
        };
        ensureSlideId(slide);
        slides.push(slide);
      }
    }
    currentSlideIndex = slides.length - 1;
    setCurrentSlide(currentSlideIndex);
    renderTimeline();
  }

  function loadImageFromFile(file){
    return new Promise((resolve, reject)=>{
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.loading = "eager";
      img.onload = ()=>{ URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e)=>{ URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  function readFileAsDataURL(file){
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  function loadImageFromDataUrl(dataUrl){
    return new Promise((resolve, reject)=>{
      const img = new Image();
      img.loading = "eager";
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = dataUrl;
    });
  }

  function loadVideoFromDataUrl(dataUrl){
    return new Promise((resolve, reject)=> {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      video.autoplay = true;
      const onError = (e) => reject(e);
      const onSeeked = () => resolve(video);
      const onLoaded = () => {
        video.currentTime = 0;
        video.addEventListener("seeked", onSeeked, { once: true });
      };
      video.addEventListener("loadedmetadata", onLoaded, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.src = dataUrl;
    });
  }

  function loadVideoFromFile(file){
    return new Promise((resolve, reject)=> {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      video.autoplay = true;
      const onError = (e) => reject(e);
      const onSeeked = () => resolve(video);
      const onLoaded = () => {
        video.currentTime = 0;
        URL.revokeObjectURL(url);
        video.addEventListener("seeked", onSeeked, { once: true });
      };
      video.addEventListener("loadedmetadata", onLoaded, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.src = url;
    });
  }

  function isVideoFile(file){
    return Boolean(file?.type && file.type.startsWith("video/"));
  }

  function isGifFile(file){
    const name = (file?.name || "").toLowerCase();
    return file?.type === "image/gif" || name.endsWith(".gif");
  }

  function isSupportedFile(file){
    if(!file) return false;
    if(file.type && (file.type.startsWith("image/") || file.type.startsWith("video/"))){
      return true;
    }
    const name = (file.name || "").toLowerCase();
    return name.endsWith(".gif") || name.endsWith(".mp4") || name.endsWith(".webm");
  }

  async function buildProjectPayload(){
    const slidePayloads = [];
    for(const slide of slides){
      const base = {
        id: slide.id,
        type: slide.type,
        name: slide.name,
        title: slide.title,
        sub: slide.sub,
        duration: slide.duration,
        transition: slide.transition,
        overrides: slide.overrides ?? null,
        lockColor: slide.lockColor ?? null,
        stableSample: slide.stableSample ?? null,
      };
      if(slide.type !== "text"){
        let dataUrl = slide.dataUrl;
        if(!dataUrl && slide.type === "image" && slide.img?.src?.startsWith("data:")){
          dataUrl = slide.img.src;
        }
        if(!dataUrl && slide.type === "video" && slide.video?.src?.startsWith("data:")){
          dataUrl = slide.video.src;
        }
        base.dataUrl = dataUrl ?? null;
      }
      slidePayloads.push(base);
    }
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      settings: { ...settings },
      slides: slidePayloads,
    };
  }

  async function saveProject(){
    try{
      const payload = await buildProjectPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dotscreen-project-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast("Project saved");
    } catch(err){
      console.error(err);
      toast("Failed to save project");
    }
  }

  async function loadProjectFromFile(file){
    try{
      const raw = await file.text();
      const data = JSON.parse(raw);
      if(data?.settings){
        Object.assign(settings, DEFAULTS, data.settings);
        saveSettings(settings);
        syncUIFromSettings();
      }
      const loadedSlides = [];
      if(Array.isArray(data?.slides)){
        for(const slideData of data.slides){
          if(slideData?.type === "text"){
            const slide = {
              type: "text",
              title: slideData.title || "Text slide",
              sub: slideData.sub || "",
              duration: slideData.duration,
              transition: slideData.transition,
              overrides: slideData.overrides ?? null,
              lockColor: slideData.lockColor ?? null,
            };
            ensureSlideId(slide);
            loadedSlides.push(slide);
            continue;
          }
          if(slideData?.dataUrl){
            if(slideData.type === "image"){
              const img = await loadImageFromDataUrl(slideData.dataUrl);
              const animated = slideData.dataUrl.startsWith("data:image/gif");
              if(animated){
                attachAnimatedImage(img);
              }
              const slide = {
                type: "image",
                name: slideData.name,
                img,
                animated,
                dataUrl: slideData.dataUrl,
                duration: slideData.duration,
                transition: slideData.transition,
              overrides: slideData.overrides ?? null,
              lockColor: slideData.lockColor ?? animated,
              hasColorSampled: false,
              stableSample: slideData.stableSample ?? animated,
            };
              ensureSlideId(slide);
              loadedSlides.push(slide);
            } else if(slideData.type === "video"){
              const video = await loadVideoFromDataUrl(slideData.dataUrl);
              attachAnimatedVideo(video);
              const slide = {
                type: "video",
                name: slideData.name,
                video,
                animated: true,
                dataUrl: slideData.dataUrl,
                duration: slideData.duration,
                transition: slideData.transition,
                overrides: slideData.overrides ?? null,
                lockColor: slideData.lockColor ?? null,
              };
              ensureSlideId(slide);
              loadedSlides.push(slide);
            }
          }
        }
      }

      if(!loadedSlides.length){
        toast("No slides found in project");
        return;
      }

      slides = loadedSlides;
      currentSlideIndex = 0;
      rebuildParticles();
      renderTimeline();
      nextAuto = nowS() + getSlideDuration(slides[currentSlideIndex]);
      toast("Project loaded");
    } catch(err){
      console.error(err);
      toast("Failed to load project");
    }
  }

  function nextSlide(){
    if(!slides.length) return;
    setCurrentSlide((currentSlideIndex + 1) % slides.length);
  }

  function prevSlide(){
    if(!slides.length) return;
    setCurrentSlide((currentSlideIndex - 1 + slides.length) % slides.length);
  }

  function setCurrentSlide(index, instant = false){
    if(!slides.length) return;
    currentSlideIndex = clamp(index, 0, slides.length - 1);
    updateTimelineActive();
    const slide = slides[currentSlideIndex];
    nextAuto = nowS() + getSlideDuration(slide);
    if(instant){
      void applySlideInstant(slide, true);
    } else {
      void applySlide(slide);
    }
  }

  rebuildParticles();
  updateCamera();
  applyRenderSettings(getEffectiveSettings(slides[currentSlideIndex]));
  renderTimeline();

  window.addEventListener("resize", ()=>{ updateCamera(); });

  nextAuto = nowS() + getSlideDuration(slides[currentSlideIndex]);

  function tick(){
    requestAnimationFrame(tick);

    const t = nowS();
    material.uniforms.uTime.value = t;

    if(currentSlide?.animated){
      if(currentSlide.type === "video"){
        currentSlide.video.play().catch(()=>{});
      }
      if(t - lastAnimSample > 1 / ANIM_SAMPLE_FPS){
        lastAnimSample = t;
        void applySlideInstant(currentSlide, true);
      }
    }

    if(settings.autoplay && t >= nextAuto){
      nextSlide();
    }

    if(transitioning){
      const u = clamp((t - morphStart) / morphDur, 0, 1);
      material.uniforms.uMorph.value = u;
      if(u >= 1){
        transitioning = false;
        for(let i=0;i<settings.maxParticles;i++){
          const i3=i*3;
          aStart[i3]=aEnd[i3]; aStart[i3+1]=aEnd[i3+1]; aStart[i3+2]=aEnd[i3+2];
          aColorStart[i3]=aColorEnd[i3]; aColorStart[i3+1]=aColorEnd[i3+1]; aColorStart[i3+2]=aColorEnd[i3+2];
          aAlphaStart[i]=aAlphaEnd[i];
        }
        geometry.attributes.aStart.needsUpdate = true;
        geometry.attributes.aColorStart.needsUpdate = true;
        geometry.attributes.aAlphaStart.needsUpdate = true;
        material.uniforms.uMorph.value = 1;
      }
    }

    maybeAutoHideUI();
    renderer.render(scene, camera);
  }

  tick();

  window.DotScreen = {
    next: nextSlide,
    prev: prevSlide,
    open: ()=>setPanelVisible(true),
    close: ()=>setPanelVisible(false),
    settings,
    slides,
  };

  if(!document.body.classList.contains("kiosk")) setPanelVisible(true);
}
