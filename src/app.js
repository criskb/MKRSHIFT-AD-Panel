import * as THREE from "three";
import Sortable from "sortablejs";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { clamp, lerp, ease, nowS, mulberry32 } from "./utils.js";
import { loadSettings, saveSettings, DEFAULTS } from "./settings.js";
import { VERT, FRAG, MEDIA_VERT, MEDIA_FRAG } from "./shaders.js";
import { PostFXManager } from "./postfx/PostFXManager.js";
import { createTransitionMaterial } from "./postfx/TransitionPass.js";
import { sampleCanvasToParticles } from "./sampling.js";
import { makeTextCanvas, makeImageCanvas, makeVideoCanvas } from "./slideCanvas.js";
import { LayerManager } from "./layers/LayerManager.js";
import {
  attachAnimatedImage,
  attachAnimatedVideo,
  isGifFile,
  isSupportedFile,
  isVideoFile,
  loadImageFromDataUrl,
  loadImageFromFile,
  loadVideoFromDataUrl,
  loadVideoFromFile,
  readFileAsDataURL,
} from "./media.js";
import { createTimelineManager } from "./timeline.js";
import {
  bindRange,
  syncUIFromSettings,
  updateHalftoneVisibility,
  updateMotionVisibility,
  updatePipelineVisibility,
} from "./ui.js";
import { createControls } from "./ui/controls.js";
import { createPlaylist, touchPlaylist, DRAFT_STORAGE_KEY } from "./playlist.js";

export function initApp(){
  const settings = loadSettings();
  document.body.dataset.theme = settings.theme ?? "dark";

  const el = (id) => document.getElementById(id);
  const panel = el("panel");
  const mediaPool = el("mediaPool");
  const btnClose = el("btnClose");
  const btnFullscreen = el("btnFullscreen");
  const btnHide = el("btnHide");
  const btnKiosk = el("btnKiosk");
  const dz = el("dropzone");
  const drawerList = el("drawerList");
  const canvasDropZone = el("canvasDropZone");
  const btnSaveDraft = el("btnSaveDraft");
  const btnLoadDraft = el("btnLoadDraft");

  const toastEl = el("toast");
  let toastTimer = null;
  function toast(msg){
    if(!toastEl) return;
    toastEl.textContent = String(msg || "");
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>toastEl.classList.remove("show"), 2400);
  }

  let draftSaveTimer = null;
  function scheduleDraftSave(){
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
      void saveDraftToLocalStorage(true);
    }, 800);
  }

  function setPanelVisible(v){
    panel.classList.toggle("hidden", !v);
    if(v) markInteraction();
  }

  function markPresetCustom(){
    if(settings.preset === "Custom") return;
    settings.preset = "Custom";
    if(ui.preset) ui.preset.value = "Custom";
    saveSettingsAndDraft(settings);
  }

  function saveSettingsAndDraft(nextSettings){
    saveSettings(nextSettings);
    scheduleDraftSave();
  }

  let controls = null;
  const refreshControls = () => controls?.refresh();

  function applyPreset(presetName){
    const preset = PRESETS[presetName];
    if(!preset) return;
    settings.preset = presetName;
    if(preset.pipeline) settings.pipeline = preset.pipeline;
    if(preset.transition?.sec != null) settings.transition = preset.transition.sec;
    if(preset.transition?.softness != null) settings.transitionSoftness = preset.transition.softness;
    if(preset.tone){
      settings.brightness = preset.tone.brightness ?? settings.brightness;
      settings.contrast = preset.tone.contrast ?? settings.contrast;
      settings.saturation = preset.tone.saturation ?? settings.saturation;
      settings.gamma = preset.tone.gamma ?? settings.gamma;
    }
    if(preset.effects){
      settings.bloomStrength = preset.effects.bloomStrength ?? settings.bloomStrength;
      settings.trailDamp = preset.effects.trailDamp ?? settings.trailDamp;
      settings.grain = preset.effects.grain ?? settings.grain;
      settings.vignette = preset.effects.vignette ?? settings.vignette;
      settings.sharpen = preset.effects.sharpen ?? settings.sharpen;
      settings.chromSplit = preset.effects.chromSplit ?? settings.chromSplit;
    }
    saveSettingsAndDraft(settings);
    syncUIFromSettings(ui, settings);
    refreshControls();
    postFX.settings.bloom.strength = settings.bloomStrength;
    postFX.settings.afterimage.damp = settings.trailDamp;
    postFX.setMode(settings.pipeline);
    syncPostFXRenderSource();
    transitionMat.uniforms.softness.value = settings.transitionSoftness;
    transitionMat.uniforms.rgbSplit.value = settings.chromSplit;
    applyToneSettings(settings);
  }

  btnClose.addEventListener("click", () => setPanelVisible(false));
  btnFullscreen.addEventListener("click", () => toggleFullscreen());
  btnHide.addEventListener("click", () => toggleUI());
  btnKiosk?.addEventListener("click", () => {
    void setKioskMode(!isKioskMode());
  });

  const ui = {
    autoplay: el("autoplay"),
    interval: el("interval"),
    transition: el("transition"),
    renderMode: el("renderMode"),
    pipeline: el("pipeline"),
    preset: el("preset"),
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
    bloomStrength: el("bloomStrength"),
    bloomStrengthVal: el("bloomStrengthVal"),
    trailDamp: el("trailDamp"),
    trailDampVal: el("trailDampVal"),
    vignette: el("vignette"),
    vignetteVal: el("vignetteVal"),
    grain: el("grain"),
    grainVal: el("grainVal"),
    sharpen: el("sharpen"),
    sharpenVal: el("sharpenVal"),
    chromSplit: el("chromSplit"),
    chromSplitVal: el("chromSplitVal"),
    transitionSoftness: el("transitionSoftness"),
    transitionSoftnessVal: el("transitionSoftnessVal"),
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
    animEffect: el("animEffect"),
    motionSwirl: el("motionSwirl"),
    motionJitter: el("motionJitter"),
    motionOsc: el("motionOsc"),
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
    particleControls: el("particleControls"),
    motionControls: el("motionControls"),
    halftoneControls: el("halftoneControls"),
    fpsReadout: el("fpsReadout"),
    fpsMode: el("fpsMode"),
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
    "animEffect",
    "oscMode",
    "oscAmplitude",
    "oscFrequency",
    "oscSpeed",
  ];

  const PRESETS = {
    CleanKiosk: {
      pipeline: "clean",
      transition: { sec: 1.4, softness: 0.18 },
      tone: { brightness: 0, contrast: 1, saturation: 1, gamma: 1 },
      effects: { bloomStrength: 0.4, trailDamp: 0.9, grain: 0.08, vignette: 0.2, sharpen: 0.1, chromSplit: 0.0008 },
    },
    MKRShiftNeon: {
      pipeline: "neon",
      transition: { sec: 2.2, softness: 0.22 },
      effects: { bloomStrength: 0.9, trailDamp: 0.9, grain: 0.18, vignette: 0.35, sharpen: 0.2, chromSplit: 0.0018 },
    },
    PrintPoster: {
      pipeline: "halftone",
      transition: { sec: 1.6, softness: 0.15 },
      effects: { bloomStrength: 0.2, trailDamp: 0.88, grain: 0.12, vignette: 0.25, sharpen: 0.15, chromSplit: 0.001 },
    },
    EnergyTrails: {
      pipeline: "afterimage",
      transition: { sec: 1.8, softness: 0.2 },
      effects: { bloomStrength: 0.6, trailDamp: 0.92, grain: 0.1, vignette: 0.25, sharpen: 0.12, chromSplit: 0.0012 },
    },
  };

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
    touchPlaylist(playlist);
    currentSlideIndex = slides.length - 1;
    setCurrentSlide(currentSlideIndex);
    timeline.render();
    scheduleDraftSave();
    markInteraction();
  });

  ui.btnPrev.addEventListener("click", ()=>{ prevSlide(); markInteraction(); });
  ui.btnNext.addEventListener("click", ()=>{ nextSlide(); markInteraction(); });
  ui.btnRemove.addEventListener("click", ()=>{
    if(slides.length <= 1) return;
    slides.splice(currentSlideIndex,1);
    touchPlaylist(playlist);
    currentSlideIndex = (currentSlideIndex + slides.length) % slides.length;
    setCurrentSlide(currentSlideIndex);
    timeline.render();
    scheduleDraftSave();
    markInteraction();
  });

  ui.saveButton.addEventListener("click", ()=>{ void saveProject(); });
  btnSaveDraft?.addEventListener("click", ()=>{ void saveDraftToLocalStorage(false); });
  ui.btnLoadProject.addEventListener("click", ()=> ui.projectFile.click());
  btnLoadDraft?.addEventListener("click", ()=>{ void loadDraftFromLocalStorage(); });
  ui.projectFile.addEventListener("change", ()=> {
    const file = ui.projectFile.files?.[0];
    if(!file) return;
    void loadProjectFromFile(file);
    ui.projectFile.value = "";
  });

  ui.resetButton.addEventListener("click", ()=>{
    Object.assign(settings, DEFAULTS);
    saveSettingsAndDraft(settings);
    syncUIFromSettings(ui, settings);
    refreshControls();
    updateHalftoneVisibility(ui, settings);
    updateMotionVisibility(ui, settings);
    updatePipelineVisibility(ui, settings);
    updateSizeVariance();
    rebuildParticles();
    updateRenderMode();
    postFX.settings.bloom.strength = settings.bloomStrength;
    postFX.settings.afterimage.damp = settings.trailDamp;
    postFX.setMode(settings.pipeline);
    transitionMat.uniforms.softness.value = settings.transitionSoftness;
    transitionMat.uniforms.rgbSplit.value = settings.chromSplit;
    timeline.render();
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

  function buildLayerTemplate(type, position){
    const snapped = {
      x: snapValue(position.x),
      y: snapValue(position.y),
      z: 0,
    };
    switch(type){
      case "text":
        return { type, text: "Edit Me", size: 48, color: "#ffffff", position: snapped };
      case "shape":
        return { type, width: 180, height: 120, color: "#00ffb3", position: snapped };
      case "image":
        return { type, width: 240, height: 160, color: "#ffffff", position: snapped };
      case "overlay":
        return { type, width: 260, height: 160, color: "#111111", opacity: 0.4, position: snapped };
      case "background":
        return {
          type,
          width: window.innerWidth,
          height: window.innerHeight,
          color: "#050505",
          position: { x: 0, y: 0, z: -1 },
        };
      default:
        return null;
    }
  }

  async function addLayerFromDrop(type, position){
    const layer = buildLayerTemplate(type, position);
    if(!layer) return;
    try{
      const created = await layerManager.addLayer(layer);
      selectLayer(created);
    }catch(err){
      console.error("Failed to add layer", err);
      toast("Could not add layer");
    }
  }

  if(drawerList && canvasDropZone){
    new Sortable(drawerList, {
      group: { name: "drawer", pull: "clone", put: false },
      sort: false,
      animation: 150,
      onStart: () => canvasDropZone.classList.add("active"),
      onEnd: () => canvasDropZone.classList.remove("active"),
    });

    new Sortable(canvasDropZone, {
      group: { name: "drawer", pull: false, put: true },
      sort: false,
      onAdd: (event) => {
        const type = event.item?.dataset?.layer;
        const sourceEvent = event.originalEvent;
        const clientX = sourceEvent?.clientX ?? lastPointer.x;
        const clientY = sourceEvent?.clientY ?? lastPointer.y;
        if(type){
          const world = clientToWorld(clientX, clientY);
          void addLayerFromDrop(type, world);
        }
        event.item?.remove();
        canvasDropZone.classList.remove("active");
      },
    });
  }

  renderer.domElement.addEventListener("pointerdown", (event) => {
    if(isKioskMode()) return;
    if(isTransforming) return;
    if(event.button !== 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(layerManager.group.children, true);
    if(hits.length){
      const layer = findLayerFromObject(hits[0].object);
      selectLayer(layer);
    } else {
      selectLayer(null);
    }
  });

  function isEditableTarget(target){
    if(!target) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  }

  function nudgeSelectedLayer(dx, dy, fine){
    if(!selectedLayer?.object3d) return false;
    const step = fine ? GRID_SIZE / GRID_FINE_DIVISOR : GRID_SIZE;
    const object = selectedLayer.object3d;
    object.position.x = snapValue(object.position.x + dx * step, step);
    object.position.y = snapValue(object.position.y + dy * step, step);
    syncLayerTransform(selectedLayer);
    return true;
  }

  // Hotkeys
  window.addEventListener("keydown", (e)=>{
    if(isKioskMode()) return;
    if(isEditableTarget(document.activeElement)) return;
    if(e.key === "h" || e.key === "H") toggleUI();
    if(e.key === "s" || e.key === "S") setPanelVisible(panel.classList.contains("hidden"));
    if(e.key === "f" || e.key === "F") toggleFullscreen();
    if(e.key === "r" || e.key === "R") transformControls.setMode("rotate");
    if(e.key === "e" || e.key === "E") transformControls.setMode("scale");
    if(e.key === "ArrowUp"){
      if(nudgeSelectedLayer(0, 1, e.shiftKey)) return;
    }
    if(e.key === "ArrowDown"){
      if(nudgeSelectedLayer(0, -1, e.shiftKey)) return;
    }
    if(e.key === "ArrowRight"){
      if(nudgeSelectedLayer(1, 0, e.shiftKey)) return;
      nextSlide();
    }
    if(e.key === "ArrowLeft"){
      if(nudgeSelectedLayer(-1, 0, e.shiftKey)) return;
      prevSlide();
    }
  });

  // Auto-hide panel after inactivity
  let lastInteraction = performance.now();
  function markInteraction(){
    lastInteraction = performance.now();
    if(kioskState.active) kioskState.idleResetDone = false;
  }
  window.addEventListener("pointerdown", markInteraction, {passive:true});
  window.addEventListener("pointermove", markInteraction, {passive:true});
  window.addEventListener("pointermove", (event) => {
    lastPointer = { x: event.clientX, y: event.clientY };
  }, { passive: true });

  function maybeAutoHideUI(){
    if(isKioskMode()) return;
    const idleMs = performance.now() - lastInteraction;
    if(!panel.classList.contains("hidden") && idleMs > 14000) setPanelVisible(false);
  }

  function toggleUI(){
    const hidden = document.body.classList.toggle("ui-hidden");
    if(!hidden) setPanelVisible(true);
    else setPanelVisible(false);
  }

  function isKioskMode(){
    return document.body.classList.contains("kiosk");
  }

  async function setFullscreen(enabled){
    try{
      if(enabled && !document.fullscreenElement){
        await document.documentElement.requestFullscreen();
      } else if(!enabled && document.fullscreenElement){
        await document.exitFullscreen();
      }
    } catch(err){
      console.warn("Fullscreen failed", err);
    }
  }

  async function toggleFullscreen(){
    try{
      await setFullscreen(!document.fullscreenElement);
    } catch(err){
      console.warn("Fullscreen failed", err);
    }
  }

  const kioskState = {
    active: false,
    prevAutoplay: settings.autoplay,
    prevPanelVisible: !panel.classList.contains("hidden"),
    idleResetDone: false,
  };
  const KIOSK_IDLE_RESET_MS = 60000;

  function updateKioskButton(){
    if(!btnKiosk) return;
    btnKiosk.textContent = isKioskMode() ? "Exit Kiosk" : "Enter Kiosk";
  }

  async function setKioskMode(enabled, { skipFullscreen = false } = {}){
    if(enabled === kioskState.active) return;
    kioskState.active = enabled;
    if(enabled){
      kioskState.prevAutoplay = settings.autoplay;
      kioskState.prevPanelVisible = !panel.classList.contains("hidden");
      kioskState.idleResetDone = false;
      document.body.classList.add("kiosk");
      document.body.classList.remove("ui-hidden");
      setPanelVisible(false);
      settings.autoplay = true;
      if(ui.autoplay) ui.autoplay.value = "1";
      saveSettingsAndDraft(settings);
      if(typeof setCurrentSlide === "function" && slides?.length){
        setCurrentSlide(0, true);
      }
      markInteraction();
      if(!skipFullscreen) await setFullscreen(true);
    } else {
      document.body.classList.remove("kiosk");
      if(kioskState.prevPanelVisible) setPanelVisible(true);
      settings.autoplay = kioskState.prevAutoplay;
      if(ui.autoplay) ui.autoplay.value = settings.autoplay ? "1" : "0";
      saveSettingsAndDraft(settings);
      if(!skipFullscreen) await setFullscreen(false);
    }
    updateKioskButton();
  }

  document.addEventListener("fullscreenchange", () => {
    if(!document.fullscreenElement && kioskState.active){
      void setKioskMode(false, { skipFullscreen: true });
    }
  });

  function showTapToStartOverlay(onStart){
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
        background:rgba(0,0,0,0.65); z-index:999999; color:white; font:600 18px/1.2 system-ui;
        cursor:pointer;
      `;
      overlay.textContent = "Click to start playback";
      overlay.addEventListener("click", async () => {
        overlay.remove();
        try{
          const result = await onStart();
          resolve(result);
        } catch(err){
          console.error(err);
          toast("Could not start playback");
          resolve(null);
        }
      }, { once: true });
      document.body.appendChild(overlay);
    });
  }

  const params = new URLSearchParams(location.search);
  const shouldStartKiosk = params.get("kiosk") === "1";

  const container = document.getElementById("app");
  const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:"high-performance" });
  renderer.setClearColor(0x000000, 1);
  const DPR_CAP = 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1,1,1,-1,-1000,1000);
  const layerManager = new LayerManager({ scene });
  scene.userData.layerManager = layerManager;
  const GRID_SIZE = 20;
  const GRID_FINE_DIVISOR = 5;
  let gridHelper = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let selectedLayer = null;
  let isTransforming = false;
  let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  function updateGridHelper(){
    if(gridHelper){
      scene.remove(gridHelper);
    }
    const size = Math.max(window.innerWidth, window.innerHeight) * 2;
    const divisions = Math.max(2, Math.round(size / GRID_SIZE));
    gridHelper = new THREE.GridHelper(size, divisions, 0x00ffb3, 0x1a1a1a);
    gridHelper.rotation.x = Math.PI / 2;
    const materials = Array.isArray(gridHelper.material) ? gridHelper.material : [gridHelper.material];
    materials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.18;
    });
    gridHelper.position.z = -0.5;
    gridHelper.renderOrder = -1;
    scene.add(gridHelper);
  }
  const postFX = new PostFXManager(renderer, scene, camera);
  postFX.settings.bloom.strength = settings.bloomStrength;
  postFX.settings.afterimage.damp = settings.trailDamp;
  postFX.setMode(settings.pipeline);

  const transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.setMode("scale");
  transformControls.setTranslationSnap(GRID_SIZE);
  transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
  transformControls.setScaleSnap(0.1);
  transformControls.visible = false;
  scene.add(transformControls);

  transformControls.addEventListener("dragging-changed", (event) => {
    isTransforming = event.value;
  });

  transformControls.addEventListener("objectChange", () => {
    if(!selectedLayer || !transformControls.object) return;
    syncLayerTransform(selectedLayer);
  });

  document.addEventListener("visibilitychange", () => {
    postFX.enabled = !document.hidden && postFX.mode !== "none";
  });

  const transitionScene = new THREE.Scene();
  const transitionCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const transitionMat = createTransitionMaterial();
  transitionMat.uniforms.softness.value = settings.transitionSoftness;
  transitionMat.uniforms.rgbSplit.value = settings.chromSplit;
  const transitionQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), transitionMat);
  transitionScene.add(transitionQuad);

  const rtFrom = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const rtTo = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  let transitionActive = false;
  let transitionStart = 0;
  let transitionDuration = settings.transition;
  let transitionFromSlide = null;
  let transitionToSlide = null;

  function setPostFXRenderSource(useTransitionScene) {
    const renderScene = useTransitionScene ? transitionScene : scene;
    const renderCamera = useTransitionScene ? transitionCam : camera;
    postFX.scene = renderScene;
    postFX.camera = renderCamera;
    if (postFX.passes.render) {
      postFX.passes.render.scene = renderScene;
      postFX.passes.render.camera = renderCamera;
    }
  }

  function syncPostFXRenderSource() {
    setPostFXRenderSource(transitionActive && settings.renderMode === "media");
  }

  function updateCamera(){
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.left = -w/2;
    camera.right = w/2;
    camera.top = h/2;
    camera.bottom = -h/2;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
    renderer.setSize(w, h);
    material.uniforms.uDpr.value = renderer.getPixelRatio();
    mediaMaterial.uniforms.uResolution.value.set(w, h);
    postFX.setSize(w, h, renderer.getPixelRatio());
    rtFrom.setSize(w, h);
    rtTo.setSize(w, h);
    updateScaleUniform();
    updateMediaScale();
    updateGridHelper();
  }

  function snapValue(value, step = GRID_SIZE){
    return Math.round(value / step) * step;
  }

  function clientToWorld(clientX, clientY){
    const rect = renderer.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const position = new THREE.Vector3(ndcX, ndcY, 0);
    position.unproject(camera);
    return position;
  }

  function findLayerFromObject(object){
    let current = object;
    while(current){
      if(current.userData?.layerId){
        return layerManager.layers.find((layer) => layer.id === current.userData.layerId) || null;
      }
      current = current.parent;
    }
    return null;
  }

  function selectLayer(layer){
    selectedLayer = layer;
    if(layer?.object3d){
      transformControls.attach(layer.object3d);
      transformControls.visible = true;
    } else {
      transformControls.detach();
      transformControls.visible = false;
    }
  }

  function syncLayerTransform(layer){
    if(!layer?.object3d) return;
    const object = layer.object3d;
    layerManager.updateLayer(layer.id, {
      position: { x: object.position.x, y: object.position.y, z: object.position.z },
      rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z },
      scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
    });
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
  const mediaMaterial = new THREE.ShaderMaterial({
    vertexShader: MEDIA_VERT,
    fragmentShader: MEDIA_FRAG,
    transparent: true,
    depthTest: false,
    uniforms: {
      uTexture: { value: null },
      uBrightness: { value: settings.brightness },
      uContrast: { value: settings.contrast },
      uSaturation: { value: settings.saturation },
      uGamma: { value: settings.gamma },
      uVignette: { value: settings.vignette },
      uGrain: { value: settings.grain },
      uSharpen: { value: settings.sharpen },
      uChromAb: { value: settings.chromSplit },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
  });
  const mediaMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mediaMaterial);
  mediaMesh.frustumCulled = false;
  mediaMesh.visible = false;
  scene.add(mediaMesh);

  function applyBlend(blendMode = settings.blend){
    material.blending = (blendMode === "add") ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.needsUpdate = true;
  }

  function applyToneSettings(activeSettings){
    mediaMaterial.uniforms.uBrightness.value = activeSettings.brightness ?? 0;
    mediaMaterial.uniforms.uContrast.value = activeSettings.contrast ?? 1;
    mediaMaterial.uniforms.uSaturation.value = activeSettings.saturation ?? 1;
    mediaMaterial.uniforms.uGamma.value = activeSettings.gamma ?? 1;
    mediaMaterial.uniforms.uVignette.value = activeSettings.vignette ?? 0;
    mediaMaterial.uniforms.uGrain.value = activeSettings.grain ?? 0;
    mediaMaterial.uniforms.uSharpen.value = activeSettings.sharpen ?? 0;
    mediaMaterial.uniforms.uChromAb.value = activeSettings.chromSplit ?? 0;
  }

  function applyRenderSettings(activeSettings){
    const effect = activeSettings.animEffect ?? "all";
    const useAll = effect === "all";
    const useSwirl = useAll || effect === "swirl";
    const useJitter = useAll || effect === "jitter";
    const useOsc = useAll || effect === "oscillation";
    material.uniforms.uPointSize.value = activeSettings.dotSize;
    material.uniforms.uSoftness.value = activeSettings.softness;
    material.uniforms.uSwirl.value = useSwirl ? activeSettings.swirl : 0;
    material.uniforms.uJitter.value = useJitter ? activeSettings.jitter : 0;
    material.uniforms.uOscAmplitude.value = useOsc ? activeSettings.oscAmplitude : 0;
    material.uniforms.uOscFrequency.value = activeSettings.oscFrequency;
    material.uniforms.uOscSpeed.value = activeSettings.oscSpeed;
    material.uniforms.uOscMode.value = useOsc && activeSettings.oscMode === "grid"
      ? 1
      : useOsc && activeSettings.oscMode === "radial"
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
    applyToneSettings(activeSettings);
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

  bindRange(ui.dotsize, ui.dotsizeVal, settings, "dotSize", saveSettingsAndDraft, ()=>{
    applyRenderSettings(getEffectiveSettings(currentSlide));
    syncParticlesToDotSize();
  }, markInteraction);
  bindRange(ui.sizeVariance, ui.sizeVarianceVal, settings, "sizeVariance", saveSettingsAndDraft, ()=>{
    updateSizeVariance();
    markInteraction();
  }, markInteraction);
  bindRange(ui.softness, ui.softnessVal, settings, "softness", saveSettingsAndDraft, ()=> applyRenderSettings(getEffectiveSettings(currentSlide)), markInteraction);
  bindRange(ui.threshold, ui.thresholdVal, settings, "threshold", saveSettingsAndDraft, ()=>{}, markInteraction);
  bindRange(ui.swirl, ui.swirlVal, settings, "swirl", saveSettingsAndDraft, ()=> applyRenderSettings(getEffectiveSettings(currentSlide)), markInteraction);
  bindRange(ui.jitter, ui.jitterVal, settings, "jitter", saveSettingsAndDraft, ()=> applyRenderSettings(getEffectiveSettings(currentSlide)), markInteraction);
  ui.shape.addEventListener("change", ()=>{
    settings.shape = ui.shape.value;
    saveSettingsAndDraft(settings);
    applyRenderSettings(getEffectiveSettings(currentSlide));
    markInteraction();
  });
  ui.animEffect.addEventListener("change", ()=>{
    settings.animEffect = ui.animEffect.value;
    saveSettingsAndDraft(settings);
    updateMotionVisibility(ui, settings);
    applyRenderSettings(getEffectiveSettings(currentSlide));
    markInteraction();
  });
  bindRange(ui.ditherStrength, ui.ditherStrengthVal, settings, "ditherStrength", saveSettingsAndDraft, ()=>{ refreshSlide(true); }, markInteraction);
  bindRange(ui.brightness, ui.brightnessVal, settings, "brightness", saveSettingsAndDraft, ()=>{ markPresetCustom(); refreshSlide(true); }, markInteraction);
  bindRange(ui.contrast, ui.contrastVal, settings, "contrast", saveSettingsAndDraft, ()=>{ markPresetCustom(); refreshSlide(true); }, markInteraction);
  bindRange(ui.saturation, ui.saturationVal, settings, "saturation", saveSettingsAndDraft, ()=>{ markPresetCustom(); refreshSlide(true); }, markInteraction);
  bindRange(ui.gamma, ui.gammaVal, settings, "gamma", saveSettingsAndDraft, ()=>{ markPresetCustom(); refreshSlide(true); }, markInteraction);
  bindRange(ui.bloomStrength, ui.bloomStrengthVal, settings, "bloomStrength", saveSettingsAndDraft, ()=> {
    markPresetCustom();
    postFX.settings.bloom.strength = settings.bloomStrength;
    postFX.rebuildChain();
    syncPostFXRenderSource();
  }, markInteraction);
  bindRange(ui.trailDamp, ui.trailDampVal, settings, "trailDamp", saveSettingsAndDraft, ()=> {
    markPresetCustom();
    postFX.settings.afterimage.damp = settings.trailDamp;
    postFX.rebuildChain();
    syncPostFXRenderSource();
  }, markInteraction);
  bindRange(ui.vignette, ui.vignetteVal, settings, "vignette", saveSettingsAndDraft, ()=>{ markPresetCustom(); refreshSlide(true); }, markInteraction);
  bindRange(ui.grain, ui.grainVal, settings, "grain", saveSettingsAndDraft, ()=>{ markPresetCustom(); refreshSlide(true); }, markInteraction);
  bindRange(ui.sharpen, ui.sharpenVal, settings, "sharpen", saveSettingsAndDraft, ()=>{ markPresetCustom(); refreshSlide(true); }, markInteraction);
  bindRange(ui.chromSplit, ui.chromSplitVal, settings, "chromSplit", saveSettingsAndDraft, ()=>{ 
    markPresetCustom();
    transitionMat.uniforms.rgbSplit.value = settings.chromSplit;
    refreshSlide(true);
  }, markInteraction);
  bindRange(ui.transitionSoftness, ui.transitionSoftnessVal, settings, "transitionSoftness", saveSettingsAndDraft, ()=> {
    markPresetCustom();
    transitionMat.uniforms.softness.value = settings.transitionSoftness;
  }, markInteraction);
  bindRange(ui.oscAmplitude, ui.oscAmplitudeVal, settings, "oscAmplitude", saveSettingsAndDraft, ()=> applyRenderSettings(getEffectiveSettings(currentSlide)), markInteraction);
  bindRange(ui.oscFrequency, ui.oscFrequencyVal, settings, "oscFrequency", saveSettingsAndDraft, ()=> applyRenderSettings(getEffectiveSettings(currentSlide)), markInteraction);
  bindRange(ui.oscSpeed, ui.oscSpeedVal, settings, "oscSpeed", saveSettingsAndDraft, ()=> applyRenderSettings(getEffectiveSettings(currentSlide)), markInteraction);

  syncUIFromSettings(ui, settings);
  refreshControls();
  updateHalftoneVisibility(ui, settings);
  updateMotionVisibility(ui, settings);
  updatePipelineVisibility(ui, settings);

  ui.gridSize.addEventListener("input", ()=>{
    settings.gridSize = clamp(parseInt(ui.gridSize.value || "16", 10), 2, 200);
    ui.gridSize.value = settings.gridSize;
    saveSettingsAndDraft(settings);
    refreshSlide(true);
    markInteraction();
  });
  ui.smoothing.addEventListener("input", ()=>{
    settings.smoothing = clamp(parseFloat(ui.smoothing.value || "0"), 0, 1);
    ui.smoothing.value = settings.smoothing;
    saveSettingsAndDraft(settings);
    refreshSlide(true);
    markInteraction();
  });
  ui.ditherType.addEventListener("change", ()=>{
    settings.ditherType = ui.ditherType.value;
    saveSettingsAndDraft(settings);
    refreshSlide(true);
    markInteraction();
  });

  ui.autoplay.addEventListener("change", ()=>{
    settings.autoplay = ui.autoplay.value === "1";
    saveSettingsAndDraft(settings);
    nextAuto = nowS() + getSlideDuration(currentSlide);
    markInteraction();
  });
  ui.interval.addEventListener("change", ()=>{
    settings.interval = clamp(parseFloat(ui.interval.value)||8,2,60);
    ui.interval.value = settings.interval;
    saveSettingsAndDraft(settings);
    nextAuto = nowS() + getSlideDuration(currentSlide);
    markInteraction();
  });
  ui.transition.addEventListener("change", ()=>{
    settings.transition = clamp(parseFloat(ui.transition.value)||2.2,0.6,10);
    ui.transition.value = settings.transition;
    saveSettingsAndDraft(settings);
    if(!transitioning){
      morphDur = getSlideTransition(currentSlide);
    }
    markInteraction();
  });
  ui.renderMode.addEventListener("change", ()=>{
    settings.renderMode = ui.renderMode.value;
    saveSettingsAndDraft(settings);
    updatePipelineVisibility(ui, settings);
    updateRenderMode();
    markInteraction();
  });
  ui.pipeline.addEventListener("change", ()=>{
    settings.pipeline = ui.pipeline.value;
    saveSettingsAndDraft(settings);
    postFX.setMode(settings.pipeline);
    postFX.enabled = !document.hidden && postFX.mode !== "none";
    syncPostFXRenderSource();
    markPresetCustom();
    markInteraction();
  });
  ui.preset.addEventListener("change", ()=>{
    const presetName = ui.preset.value;
    if(presetName === "Custom"){
      settings.preset = "Custom";
      saveSettingsAndDraft(settings);
      markInteraction();
      return;
    }
    applyPreset(presetName);
    markInteraction();
  });
  ui.particles.addEventListener("change", ()=>{
    const v = clamp(parseInt(ui.particles.value||"18000",10), 1, 80000);
    ui.particles.value = v;
    settings.maxParticles = v;
    saveSettingsAndDraft(settings);
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
    saveSettingsAndDraft(settings);
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
    saveSettingsAndDraft(settings);
    updateHalftoneVisibility(ui, settings);
    refreshSlide(true);
    markInteraction();
  });
  ui.dither.addEventListener("change", ()=>{settings.dither = ui.dither.value; saveSettingsAndDraft(settings); refreshSlide(true); markInteraction();});
  ui.brightness.addEventListener("change", ()=>{settings.brightness = parseFloat(ui.brightness.value); saveSettingsAndDraft(settings); refreshSlide(true); markInteraction();});
  ui.contrast.addEventListener("change", ()=>{settings.contrast = parseFloat(ui.contrast.value); saveSettingsAndDraft(settings); refreshSlide(true); markInteraction();});
  ui.saturation.addEventListener("change", ()=>{settings.saturation = parseFloat(ui.saturation.value); saveSettingsAndDraft(settings); refreshSlide(true); markInteraction();});
  ui.gamma.addEventListener("change", ()=>{settings.gamma = parseFloat(ui.gamma.value); saveSettingsAndDraft(settings); refreshSlide(true); markInteraction();});
  ui.oscMode.addEventListener("change", ()=>{
    settings.oscMode = ui.oscMode.value;
    applyRenderSettings(getEffectiveSettings(currentSlide));
    saveSettingsAndDraft(settings);
    markInteraction();
  });
  ui.blend.addEventListener("change", ()=>{
    settings.blend = ui.blend.value;
    saveSettingsAndDraft(settings);
    applyRenderSettings(getEffectiveSettings(currentSlide));
    markInteraction();
  });

  let geometry = null;
  let points = null;
  function updateRenderMode(){
    const mediaMode = settings.renderMode === "media";
    if(points){
      points.visible = !mediaMode;
    }
    mediaMesh.visible = mediaMode;
    transitionActive = false;
    syncPostFXRenderSource();
    if(!currentSlide) return;
    if(mediaMode){
      applySlideMedia(currentSlide);
    } else {
      void applySlide(currentSlide);
    }
  }

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

  const initialSlides = [
    { type:"text", title:"MKRShift", sub:"3D • AI • Creative Tech" },
    { type:"text", title:"PRINT" , sub:"Prototypes • Toys • Props" },
    { type:"text", title:"DESIGN" , sub:"Concepts • Visuals • Tools" },
  ];
  initialSlides.forEach(ensureSlideId);
  let playlist = createPlaylist({ name: "Main Playlist", slides: initialSlides });
  let slides = playlist.slides;
  let currentSlideIndex = 0;

  let aStart, aEnd, aColorStart, aColorEnd, aAlphaStart, aAlphaEnd, aSeed, aSize;

  function createSlideOverrides(){
    const overrides = {};
    for(const key of SLIDE_OVERRIDE_KEYS){
      overrides[key] = settings[key];
    }
    return overrides;
  }

  function setSlidesList(next){
    slides = next;
    playlist.slides = next;
    touchPlaylist(playlist);
    scheduleDraftSave();
  }

  function applySlideOverrides(slide){
    const activeSettings = { ...getEffectiveSettings(slide), stableSample: slide.stableSample };
    applyRenderSettings(activeSettings);
  }
  const timeline = createTimelineManager({
    timelineEl: ui.timeline,
    settings,
    getSlides: () => slides,
    setSlides: setSlidesList,
    getCurrentIndex: () => currentSlideIndex,
    setCurrentIndex: (next) => { currentSlideIndex = next; },
    setCurrentSlide,
    markInteraction,
    refreshSlide,
    applySlideOverrides,
    getSlideDuration,
    getSlideTransition,
    createSlideOverrides,
    ensureSlideId,
    updateNextAuto: (slide, index) => {
      if(index === currentSlideIndex){
        nextAuto = nowS() + getSlideDuration(slide);
      }
    },
    scheduleDraftSave,
  });

  controls = createControls({
    settings,
    saveSettings: saveSettingsAndDraft,
    postFX,
    layerManager,
    getSlides: () => slides,
    getCurrentIndex: () => currentSlideIndex,
    setCurrentSlide,
    nextSlide,
    prevSlide,
    updateRenderMode,
    updatePipelineVisibility: () => updatePipelineVisibility(ui, settings),
    applyToneSettings,
    refreshSlide,
    updateTransition: (value) => {
      transitionDuration = value;
    },
    updateTransitionSoftness: (value) => {
      transitionMat.uniforms.softness.value = value;
    },
    updateChromSplit: (value) => {
      transitionMat.uniforms.rgbSplit.value = value;
    },
    markInteraction,
  });

  const baseTimelineRender = timeline.render;
  timeline.render = () => {
    baseTimelineRender();
    controls?.refreshPlaylist();
  };

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
    timeline.updateActive();
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

  function ensureSlideTexture(slide){
    if(!slide) return null;
    if(slide.texture) return slide.texture;
    if(slide.type === "video" && slide.video){
      const texture = new THREE.VideoTexture(slide.video);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      slide.texture = texture;
      return texture;
    }
    if(slide.type === "image" && slide.img){
      const texture = new THREE.Texture(slide.img);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      slide.texture = texture;
      return texture;
    }
    const fallbackCanvas = makeTextCanvas(slide.title ?? "MKRShift", slide.sub ?? "");
    const texture = new THREE.CanvasTexture(fallbackCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    slide.texture = texture;
    return texture;
  }

  function setMediaTexture(texture){
    mediaMaterial.uniforms.uTexture.value = texture;
  }

  function updateMediaScale(){
    const w = window.innerWidth;
    const h = window.innerHeight;
    const fit = 0.9;
    const viewAspect = w / h;
    const imgAspect = currentImgAspect || 1;
    let targetW = w * fit;
    let targetH = h * fit;
    if(viewAspect > imgAspect){
      targetH = h * fit;
      targetW = targetH * imgAspect;
    } else {
      targetW = w * fit;
      targetH = targetW / imgAspect;
    }
    mediaMesh.scale.set(targetW, targetH, 1);
  }

  function getSlideAspect(slide){
    if(slide?.type === "video"){
      const w = slide.video?.videoWidth || 1;
      const h = slide.video?.videoHeight || 1;
      return w / h;
    }
    if(slide?.type === "image"){
      const w = slide.img?.width || 1;
      const h = slide.img?.height || 1;
      return w / h;
    }
    return 1200 / 600;
  }

  function setMediaSourceForSlide(slide){
    const texture = ensureSlideTexture(slide);
    setMediaTexture(texture);
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

  function applySlideMedia(slide){
    const activeSettings = { ...getEffectiveSettings(slide), stableSample: slide.stableSample };
    applyToneSettings(activeSettings);
    setMediaSourceForSlide(slide);
    currentSlide = slide;
    currentImgAspect = getSlideAspect(slide);
    updateMediaScale();
  }

  function renderSlideToTarget(slide, target){
    if(!slide) return;
    const prevTexture = mediaMaterial.uniforms.uTexture.value;
    const prevMediaVisible = mediaMesh.visible;
    const prevPointsVisible = points?.visible;
    const activeSettings = { ...getEffectiveSettings(slide), stableSample: slide.stableSample };

    applyToneSettings(activeSettings);
    setMediaSourceForSlide(slide);
    mediaMesh.visible = true;
    if(points) points.visible = false;

    renderer.setRenderTarget(target);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    mediaMaterial.uniforms.uTexture.value = prevTexture;
    mediaMesh.visible = prevMediaVisible;
    if(points) points.visible = prevPointsVisible;
    if(currentSlide){
      applyToneSettings(getEffectiveSettings(currentSlide));
    }
  }

  function startMediaTransition(fromSlide, toSlide){
    transitionActive = true;
    transitionStart = nowS();
    transitionDuration = getSlideTransition(toSlide);
    transitionFromSlide = fromSlide;
    transitionToSlide = toSlide;
    renderSlideToTarget(fromSlide, rtFrom);
    renderSlideToTarget(toSlide, rtTo);
    transitionMat.uniforms.tDiffuseA.value = rtFrom.texture;
    transitionMat.uniforms.tDiffuseB.value = rtTo.texture;
    transitionMat.uniforms.progress.value = 0;
    transitionMat.uniforms.time.value = 0;
    setPostFXRenderSource(true);
    applySlideMedia(toSlide);
  }

  async function applySlide(slide){
    if(settings.renderMode === "media"){
      applySlideMedia(slide);
      return;
    }
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
    if(settings.renderMode === "media"){
      applySlideMedia(slide);
      return;
    }
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

  async function loadVideoWithGate(loadFn){
    try{
      return await loadFn();
    } catch(err){
      if(String(err?.message || err).includes("AUTOPLAY_BLOCKED")){
        return await showTapToStartOverlay(loadFn);
      }
      throw err;
    }
  }

  async function addFilesAsSlides(files){
    for(const f of files){
      if(isVideoFile(f)){
        const [video, dataUrl] = await Promise.all([
          loadVideoWithGate(() => loadVideoFromFile(f)),
          readFileAsDataURL(f),
        ]);
        if(!video) continue;
        attachAnimatedVideo(video, mediaPool);
        const slide = { type:"video", name: f.name, video, animated: true, dataUrl };
        ensureSlideId(slide);
        slides.push(slide);
      } else {
        const animated = isGifFile(f);
        const [img, dataUrl] = await Promise.all([
          loadImageFromFile(f, animated),
          readFileAsDataURL(f),
        ]);
        if(animated){
          attachAnimatedImage(img, mediaPool);
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
    touchPlaylist(playlist);
    currentSlideIndex = slides.length - 1;
    setCurrentSlide(currentSlideIndex);
    timeline.render();
    scheduleDraftSave();
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
    touchPlaylist(playlist);
    return {
      version: 2,
      savedAt: new Date().toISOString(),
      playlist: {
        id: playlist.id,
        name: playlist.name,
        createdAt: playlist.createdAt,
        updatedAt: playlist.updatedAt,
        version: playlist.version,
      },
      settings: { ...settings },
      slides: slidePayloads,
    };
  }

  async function saveDraftToLocalStorage(silent = true){
    try{
      const payload = await buildProjectPayload();
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
      if(!silent){
        toast("Draft saved");
      }
    } catch(err){
      console.error(err);
      if(!silent){
        toast("Failed to save draft");
      }
    }
  }

  async function loadProjectFromData(data, { source } = {}){
    if(data?.settings){
      Object.assign(settings, DEFAULTS, data.settings);
      saveSettingsAndDraft(settings);
      syncUIFromSettings(ui, settings);
      refreshControls();
      updateHalftoneVisibility(ui, settings);
      updateMotionVisibility(ui, settings);
      updatePipelineVisibility(ui, settings);
      updateRenderMode();
    }

    if(data?.playlist){
      playlist = createPlaylist({
        id: data.playlist.id,
        name: data.playlist.name,
        slides,
        createdAt: data.playlist.createdAt,
        updatedAt: data.playlist.updatedAt,
        version: data.playlist.version ?? 1,
      });
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
              attachAnimatedImage(img, mediaPool);
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
            const video = await loadVideoWithGate(() => loadVideoFromDataUrl(slideData.dataUrl));
            if(!video) continue;
            attachAnimatedVideo(video, mediaPool);
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
    playlist.slides = slides;
    touchPlaylist(playlist);
    currentSlideIndex = 0;
    rebuildParticles();
    timeline.render();
    nextAuto = nowS() + getSlideDuration(slides[currentSlideIndex]);
    if(window.DotScreen){
      window.DotScreen.playlist = playlist;
      window.DotScreen.slides = slides;
    }
    if(source === "draft"){
      toast("Draft loaded");
    } else {
      toast("Project loaded");
    }
  }

  async function loadDraftFromLocalStorage(){
    try{
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if(!raw){
        toast("No draft found");
        return;
      }
      const data = JSON.parse(raw);
      await loadProjectFromData(data, { source: "draft" });
    } catch(err){
      console.error(err);
      toast("Failed to load draft");
    }
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
      await loadProjectFromData(data, { source: "file" });
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
    const prevSlide = currentSlide;
    currentSlideIndex = clamp(index, 0, slides.length - 1);
    timeline.updateActive();
    const slide = slides[currentSlideIndex];
    nextAuto = nowS() + getSlideDuration(slide);
    const mediaMode = settings.renderMode === "media";
    if(prevSlide?.type === "video" && prevSlide.video && prevSlide !== slide){
      prevSlide.video.pause();
    }
    if(mediaMode && !instant && currentSlide && currentSlide !== slide){
      startMediaTransition(currentSlide, slide);
      return;
    }
    if(instant){
      void applySlideInstant(slide, true);
    } else {
      void applySlide(slide);
    }
  }

  rebuildParticles();
  updateCamera();
  applyRenderSettings(getEffectiveSettings(slides[currentSlideIndex]));
  updateRenderMode();
  timeline.render();

  window.addEventListener("resize", ()=>{ updateCamera(); });

  nextAuto = nowS() + getSlideDuration(slides[currentSlideIndex]);

  const clock = new THREE.Clock();
  const FPS_THRESHOLD = 30;
  const FPS_RECOVER = 40;
  const FPS_SAMPLE_WINDOW_MS = 500;
  let fpsFrameCount = 0;
  let fpsLastSample = performance.now();
  let currentFps = 0;
  let lowFpsMode = false;

  function updateFpsUI(value){
    if(!ui.fpsReadout) return;
    ui.fpsReadout.textContent = Number.isFinite(value) ? `${Math.round(value)}` : "--";
  }

  function setLowFpsMode(enable){
    if(enable === lowFpsMode) return;
    if(enable){
      postFX.setMode("clean");
      postFX.settings.bloom.strength = 0;
      postFX.settings.afterimage.damp = Math.min(settings.trailDamp, 0.85);
      applyToneSettings(settings);
      mediaMaterial.uniforms.uGrain.value = 0;
      mediaMaterial.uniforms.uVignette.value = 0;
      mediaMaterial.uniforms.uSharpen.value = 0;
      mediaMaterial.uniforms.uChromAb.value = 0;
      transitionMat.uniforms.rgbSplit.value = 0;
    } else {
      postFX.setMode(settings.pipeline);
      postFX.settings.bloom.strength = settings.bloomStrength;
      postFX.settings.afterimage.damp = settings.trailDamp;
      applyToneSettings(settings);
      transitionMat.uniforms.rgbSplit.value = settings.chromSplit;
    }
    postFX.enabled = !document.hidden && postFX.mode !== "none";
    syncPostFXRenderSource();
    lowFpsMode = enable;
    if(ui.fpsMode){
      ui.fpsMode.textContent = enable ? "Low" : "Normal";
    }
  }

  function tick(){
    requestAnimationFrame(tick);

    const nowMs = performance.now();
    fpsFrameCount += 1;
    const fpsElapsed = nowMs - fpsLastSample;
    if(fpsElapsed >= FPS_SAMPLE_WINDOW_MS){
      currentFps = (fpsFrameCount / fpsElapsed) * 1000;
      fpsFrameCount = 0;
      fpsLastSample = nowMs;
      updateFpsUI(currentFps);
      if(!lowFpsMode && currentFps < FPS_THRESHOLD){
        setLowFpsMode(true);
      } else if(lowFpsMode && currentFps >= FPS_RECOVER){
        setLowFpsMode(false);
      }
    }

    const t = nowS();
    const dt = clock.getDelta();
    material.uniforms.uTime.value = t;
    mediaMaterial.uniforms.uTime.value = t;
    layerManager.update(dt);

    if(currentSlide?.animated){
      if(currentSlide.type === "video"){
        currentSlide.video.play().catch(()=>{});
      }
      if(settings.renderMode === "particles"){
        if(t - lastAnimSample > 1 / ANIM_SAMPLE_FPS){
          lastAnimSample = t;
          void applySlideInstant(currentSlide, true);
        }
      } else if(currentSlide.texture && !currentSlide.texture.isVideoTexture){
        currentSlide.texture.needsUpdate = true;
      }
    }

    if(settings.autoplay && t >= nextAuto){
      nextSlide();
    }
    if(kioskState.active){
      const idleMs = performance.now() - lastInteraction;
      if(!kioskState.idleResetDone && idleMs > KIOSK_IDLE_RESET_MS){
        kioskState.idleResetDone = true;
        if(slides.length){
          setCurrentSlide(0, true);
        }
      }
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
    if(transitionActive && settings.renderMode === "media"){
      const elapsed = t - transitionStart;
      const progress = Math.min(1, elapsed / transitionDuration);
      transitionMat.uniforms.progress.value = progress;
      transitionMat.uniforms.time.value = elapsed;
      syncPostFXRenderSource();
      postFX.render(dt);
      if(progress >= 1){
        transitionActive = false;
        transitionFromSlide = null;
        transitionToSlide = null;
        syncPostFXRenderSource();
      }
      return;
    }

    postFX.render(dt);
  }

  tick();

  window.DotScreen = {
    next: nextSlide,
    prev: prevSlide,
    open: ()=>setPanelVisible(true),
    close: ()=>setPanelVisible(false),
    settings,
    playlist,
    slides,
  };

  updateKioskButton();
  if(shouldStartKiosk){
    void setKioskMode(true);
  } else {
    setPanelVisible(true);
  }
}
