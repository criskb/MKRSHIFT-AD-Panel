import * as THREE from "three";
import { clamp, lerp, ease, nowS, mulberry32 } from "./utils.js";
import { loadSettings, saveSettings } from "./settings.js";
import { VERT, FRAG } from "./shaders.js";
import { sampleCanvasToParticles } from "./sampling.js";
import { makeTextCanvas, makeImageCanvas, makeVideoCanvas } from "./slideCanvas.js";

export function initApp(){
  const settings = loadSettings();

  const el = (id) => document.getElementById(id);
  const panel = el("panel");
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
  };

  const ANIM_SAMPLE_FPS = 12;
  let lastAnimSample = 0;
  let currentSlide = null;

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
    slides.push({ type:"text", title, sub });
    currentSlideIndex = slides.length - 1;
    void applySlide(slides[currentSlideIndex]);
    markInteraction();
  });

  ui.btnPrev.addEventListener("click", ()=>{ prevSlide(); markInteraction(); });
  ui.btnNext.addEventListener("click", ()=>{ nextSlide(); markInteraction(); });
  ui.btnRemove.addEventListener("click", ()=>{
    if(slides.length <= 1) return;
    slides.splice(currentSlideIndex,1);
    currentSlideIndex = (currentSlideIndex + slides.length) % slides.length;
    void applySlide(slides[currentSlideIndex]);
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
      uSwirl: { value: settings.swirl },
      uJitter: { value: settings.jitter },
      uOscAmplitude: { value: settings.oscAmplitude },
      uOscFrequency: { value: settings.oscFrequency },
      uOscSpeed: { value: settings.oscSpeed },
      uOscMode: { value: settings.oscMode === "grid" ? 1 : settings.oscMode === "radial" ? 2 : 0 },
    }
  });

  function applyBlend(){
    material.blending = (settings.blend === "add") ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.needsUpdate = true;
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

  ui.autoplay.value = settings.autoplay ? "1" : "0";
  ui.interval.value = settings.interval;
  ui.transition.value = settings.transition;
  ui.particles.value = settings.maxParticles;
  ui.mode.value = settings.mode;
  ui.blend.value = settings.blend;
  ui.dither.value = settings.dither;
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
  ui.oscMode.value = settings.oscMode;
  ui.oscAmplitude.value = settings.oscAmplitude;
  ui.oscAmplitudeVal.textContent = String(settings.oscAmplitude);
  ui.oscFrequency.value = settings.oscFrequency;
  ui.oscFrequencyVal.textContent = String(settings.oscFrequency);
  ui.oscSpeed.value = settings.oscSpeed;
  ui.oscSpeedVal.textContent = String(settings.oscSpeed);

  bindRange(ui.dotsize, ui.dotsizeVal, "dotSize", ()=>{
    material.uniforms.uPointSize.value = settings.dotSize;
    syncParticlesToDotSize();
  });
  bindRange(ui.softness, ui.softnessVal, "softness", ()=> material.uniforms.uSoftness.value = settings.softness);
  bindRange(ui.threshold, ui.thresholdVal, "threshold", ()=>{});
  bindRange(ui.swirl, ui.swirlVal, "swirl", ()=> material.uniforms.uSwirl.value = settings.swirl);
  bindRange(ui.jitter, ui.jitterVal, "jitter", ()=> material.uniforms.uJitter.value = settings.jitter);
  bindRange(ui.ditherStrength, ui.ditherStrengthVal, "ditherStrength", ()=>{ refreshSlide(true); });
  bindRange(ui.brightness, ui.brightnessVal, "brightness", ()=>{ refreshSlide(true); });
  bindRange(ui.contrast, ui.contrastVal, "contrast", ()=>{ refreshSlide(true); });
  bindRange(ui.saturation, ui.saturationVal, "saturation", ()=>{ refreshSlide(true); });
  bindRange(ui.gamma, ui.gammaVal, "gamma", ()=>{ refreshSlide(true); });
  bindRange(ui.oscAmplitude, ui.oscAmplitudeVal, "oscAmplitude", ()=> material.uniforms.uOscAmplitude.value = settings.oscAmplitude);
  bindRange(ui.oscFrequency, ui.oscFrequencyVal, "oscFrequency", ()=> material.uniforms.uOscFrequency.value = settings.oscFrequency);
  bindRange(ui.oscSpeed, ui.oscSpeedVal, "oscSpeed", ()=> material.uniforms.uOscSpeed.value = settings.oscSpeed);

  ui.autoplay.addEventListener("change", ()=>{settings.autoplay = ui.autoplay.value === "1"; saveSettings(settings); markInteraction();});
  ui.interval.addEventListener("change", ()=>{settings.interval = clamp(parseFloat(ui.interval.value)||8,2,60); ui.interval.value=settings.interval; saveSettings(settings); markInteraction();});
  ui.transition.addEventListener("change", ()=>{settings.transition = clamp(parseFloat(ui.transition.value)||2.2,0.6,10); ui.transition.value=settings.transition; saveSettings(settings); markInteraction();});
  ui.particles.addEventListener("change", ()=>{
    const v = clamp(parseInt(ui.particles.value||"18000",10), 1, 80000);
    ui.particles.value = v;
    settings.maxParticles = v;
    saveSettings(settings);
    rebuildParticles();
    markInteraction();
  });

  function syncParticlesToDotSize(){
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

  ui.mode.addEventListener("change", ()=>{settings.mode = ui.mode.value; saveSettings(settings); refreshSlide(true); markInteraction();});
  ui.dither.addEventListener("change", ()=>{settings.dither = ui.dither.value; saveSettings(settings); refreshSlide(true); markInteraction();});
  ui.brightness.addEventListener("change", ()=>{settings.brightness = parseFloat(ui.brightness.value); saveSettings(settings); refreshSlide(true); markInteraction();});
  ui.contrast.addEventListener("change", ()=>{settings.contrast = parseFloat(ui.contrast.value); saveSettings(settings); refreshSlide(true); markInteraction();});
  ui.saturation.addEventListener("change", ()=>{settings.saturation = parseFloat(ui.saturation.value); saveSettings(settings); refreshSlide(true); markInteraction();});
  ui.gamma.addEventListener("change", ()=>{settings.gamma = parseFloat(ui.gamma.value); saveSettings(settings); refreshSlide(true); markInteraction();});
  ui.oscMode.addEventListener("change", ()=>{
    settings.oscMode = ui.oscMode.value;
    material.uniforms.uOscMode.value = settings.oscMode === "grid" ? 1 : settings.oscMode === "radial" ? 2 : 0;
    saveSettings(settings);
    markInteraction();
  });
  ui.blend.addEventListener("change", ()=>{settings.blend = ui.blend.value; saveSettings(settings); applyBlend(); markInteraction();});

  let geometry = null;
  let points = null;

  let morphStart = 0;
  let morphDur = settings.transition;
  let transitioning = false;

  let currentImgAspect = 1;

  let slides = [
    { type:"text", title:"MKRShift", sub:"3D • AI • Creative Tech" },
    { type:"text", title:"PRINT" , sub:"Prototypes • Toys • Props" },
    { type:"text", title:"DESIGN" , sub:"Concepts • Visuals • Tools" },
  ];
  let currentSlideIndex = 0;

  let aStart, aEnd, aColorStart, aColorEnd, aAlphaStart, aAlphaEnd, aSeed, aSize;

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
      aSize[i] = 0.85 + rng()*0.9;
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

    for(let i=0;i<N;i++){
      const i3 = i*3;
      if(i < M){
        aEnd[i3+0] = sample.pos[i3+0];
        aEnd[i3+1] = sample.pos[i3+1];
        aEnd[i3+2] = sample.pos[i3+2];

        aColorEnd[i3+0] = sample.col[i3+0];
        aColorEnd[i3+1] = sample.col[i3+1];
        aColorEnd[i3+2] = sample.col[i3+2];

        aAlphaEnd[i] = 1;
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

  function writeInstantFromSample(sample){
    const N = settings.maxParticles;
    const M = sample.count;
    for(let i=0;i<N;i++){
      const i3 = i*3;
      if(i < M){
        const px = sample.pos[i3+0];
        const py = sample.pos[i3+1];
        const pz = sample.pos[i3+2];
        aEnd[i3+0] = px; aEnd[i3+1] = py; aEnd[i3+2] = pz;
        aStart[i3+0] = px; aStart[i3+1] = py; aStart[i3+2] = pz;

        const cr = sample.col[i3+0];
        const cg = sample.col[i3+1];
        const cb = sample.col[i3+2];
        aColorEnd[i3+0] = cr; aColorEnd[i3+1] = cg; aColorEnd[i3+2] = cb;
        aColorStart[i3+0] = cr; aColorStart[i3+1] = cg; aColorStart[i3+2] = cb;

        aAlphaEnd[i] = 1;
        aAlphaStart[i] = 1;
      } else {
        const r = 3.2 + Math.random()*2.4;
        const a = Math.random()*Math.PI*2;
        const px = Math.cos(a)*r;
        const py = Math.sin(a)*r;
        const pz = (Math.random()*2-1)*0.12;
        aEnd[i3+0] = px; aEnd[i3+1] = py; aEnd[i3+2] = pz;
        aStart[i3+0] = px; aStart[i3+1] = py; aStart[i3+2] = pz;

        aColorEnd[i3+0] = 1; aColorEnd[i3+1] = 1; aColorEnd[i3+2] = 1;
        aColorStart[i3+0] = 1; aColorStart[i3+1] = 1; aColorStart[i3+2] = 1;

        aAlphaEnd[i] = 0;
        aAlphaStart[i] = 0;
      }
    }

    geometry.attributes.aStart.needsUpdate = true;
    geometry.attributes.aEnd.needsUpdate = true;
    geometry.attributes.aColorStart.needsUpdate = true;
    geometry.attributes.aColorEnd.needsUpdate = true;
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

  async function applySlide(slide){
    const t0 = nowS();
    let canvas = null;

    if(slide.type === "text"){
      canvas = makeTextCanvas(slide.title, slide.sub);
    } else if(slide.type === "image"){
      canvas = await makeImageCanvas(slide.img);
    } else if(slide.type === "video"){
      canvas = makeVideoCanvas(slide.video);
    } else {
      canvas = makeTextCanvas("MKRShift", "");
    }

    const sample = sampleCanvasToParticles(canvas, settings);
    currentSlide = slide;
    currentImgAspect = sample.imgAspect;
    updateScaleUniform();

    bakeCurrentToStart();
    writeEndFromSample(sample);

    morphDur = clamp(parseFloat(settings.transition) || 2.2, 0.6, 10);
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
    if(slide.type === "text"){
      canvas = makeTextCanvas(slide.title, slide.sub);
    } else if(slide.type === "image"){
      canvas = await makeImageCanvas(slide.img);
    } else if(slide.type === "video"){
      canvas = makeVideoCanvas(slide.video);
    } else {
      canvas = makeTextCanvas("MKRShift", "");
    }
    const sample = sampleCanvasToParticles(canvas, settings);
    currentSlide = slide;
    currentImgAspect = sample.imgAspect;
    updateScaleUniform();
    writeInstantFromSample(sample);
  }

  async function addFilesAsSlides(files){
    for(const f of files){
      if(isVideoFile(f)){
        const video = await loadVideoFromFile(f);
        slides.push({ type:"video", name: f.name, video, animated: true });
      } else {
        const img = await loadImageFromFile(f);
        const animated = isGifFile(f);
        slides.push({ type:"image", name: f.name, img, animated });
      }
    }
    currentSlideIndex = slides.length - 1;
    await applySlide(slides[currentSlideIndex]);
  }

  function loadImageFromFile(file){
    return new Promise((resolve, reject)=>{
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = ()=>{ URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e)=>{ URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  function loadVideoFromFile(file){
    return new Promise((resolve, reject)=> {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      const onError = (e) => reject(e);
      const onSeeked = () => resolve(video);
      const onLoaded = () => {
        video.currentTime = 0;
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

  function nextSlide(){
    if(!slides.length) return;
    currentSlideIndex = (currentSlideIndex + 1) % slides.length;
    void applySlide(slides[currentSlideIndex]);
  }

  function prevSlide(){
    if(!slides.length) return;
    currentSlideIndex = (currentSlideIndex - 1 + slides.length) % slides.length;
    void applySlide(slides[currentSlideIndex]);
  }

  rebuildParticles();
  updateCamera();
  applyBlend();

  window.addEventListener("resize", ()=>{ updateCamera(); });

  let nextAuto = nowS() + settings.interval;

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
      nextAuto = t + settings.interval;
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

  ui.autoplay.value = settings.autoplay ? "1" : "0";
  ui.interval.value = settings.interval;
  ui.transition.value = settings.transition;
  ui.particles.value = settings.maxParticles;
  ui.mode.value = settings.mode;
  ui.blend.value = settings.blend;

  if(!document.body.classList.contains("kiosk")) setPanelVisible(true);
}
