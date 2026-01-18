import { Pane } from "tweakpane";
import { THEME_OPTIONS, normalizeTheme } from "../themes/theme-data.js";

function buildSlideOptions(slides){
  const options = {};
  slides.forEach((slide, index) => {
    const labelBase = slide.type === "text" ? slide.title || "Text" : slide.name || slide.filename || "Media";
    const label = `${index + 1}. ${labelBase}`;
    options[label] = slide.id ?? index;
  });
  return options;
}

function applyTheme(theme){
  document.body.dataset.theme = normalizeTheme(theme);
}

export function createControls({
  settings,
  saveSettings,
  postFX,
  layerManager,
  getSlides,
  getCurrentIndex,
  setCurrentSlide,
  nextSlide,
  prevSlide,
  updateRenderMode,
  updatePipelineVisibility,
  applyToneSettings,
  refreshSlide,
  updateTransition,
  updateTransitionSoftness,
  updateChromSplit,
  markInteraction,
}){
  const container = document.createElement("div");
  container.id = "controlDock";
  container.className = "glass-panel";
  document.body.appendChild(container);

  const pane = new Pane({ container, title: "Quick Controls", expanded: false });
  pane.element.classList.add("tp-dotscreen");

  const state = {
    theme: settings.theme ?? "dark",
    autoplay: settings.autoplay,
    interval: settings.interval,
    transition: settings.transition,
    renderMode: settings.renderMode,
    pipeline: settings.pipeline,
    bloomStrength: settings.bloomStrength,
    trailDamp: settings.trailDamp,
    grain: settings.grain,
    vignette: settings.vignette,
    sharpen: settings.sharpen,
    chromSplit: settings.chromSplit,
    transitionSoftness: settings.transitionSoftness,
  };

  applyTheme(state.theme);

  const themeBinding = pane.addInput(state, "theme", {
    label: "Theme",
    options: THEME_OPTIONS,
  });
  themeBinding.on("change", (ev) => {
    settings.theme = normalizeTheme(ev.value);
    state.theme = settings.theme;
    applyTheme(settings.theme);
    saveSettings(settings);
    markInteraction?.();
  });

  let playlistFolder = null;
  let currentSlideBinding = null;

  function buildPlaylistFolder(){
    playlistFolder?.dispose();
    playlistFolder = pane.addFolder({ title: "Playlist" });

    playlistFolder.addInput(state, "autoplay", { label: "Autoplay" }).on("change", (ev) => {
      settings.autoplay = ev.value;
      saveSettings(settings);
      markInteraction?.();
    });

    playlistFolder.addInput(state, "interval", { label: "Interval", min: 2, max: 60, step: 0.5 }).on("change", (ev) => {
      settings.interval = ev.value;
      saveSettings(settings);
      markInteraction?.();
    });

    playlistFolder.addInput(state, "transition", { label: "Transition", min: 0.6, max: 10, step: 0.1 }).on("change", (ev) => {
      settings.transition = ev.value;
      updateTransition?.(settings.transition);
      saveSettings(settings);
      markInteraction?.();
    });

    const slides = getSlides?.() ?? [];
    const currentIndex = getCurrentIndex?.() ?? 0;
    state.currentSlideId = slides[currentIndex]?.id ?? currentIndex;
    const options = buildSlideOptions(slides);

    currentSlideBinding = playlistFolder.addInput(state, "currentSlideId", {
      label: "Current",
      options,
    });
    currentSlideBinding.on("change", (ev) => {
      const nextIndex = slides.findIndex((slide) => slide.id === ev.value);
      if(nextIndex >= 0){
        setCurrentSlide?.(nextIndex);
      }
      markInteraction?.();
    });

    const navRow = playlistFolder.addFolder({ title: "Navigate" });
    navRow.addButton({ title: "Previous" }).on("click", () => {
      prevSlide?.();
      markInteraction?.();
    });
    navRow.addButton({ title: "Next" }).on("click", () => {
      nextSlide?.();
      markInteraction?.();
    });
  }

  const postFxFolder = pane.addFolder({ title: "PostFX" });
  postFxFolder.addInput(state, "renderMode", {
    label: "Render",
    options: {
      Particles: "particles",
      Media: "media",
    },
  }).on("change", (ev) => {
    settings.renderMode = ev.value;
    updateRenderMode?.();
    updatePipelineVisibility?.();
    saveSettings(settings);
    markInteraction?.();
  });

  postFxFolder.addInput(state, "pipeline", {
    label: "Pipeline",
    options: {
      None: "none",
      Clean: "clean",
      "Neon Bloom": "neon",
      "Afterimage Trails": "afterimage",
      Halftone: "halftone",
      DotScreen: "dotscreen",
      "Glitch Accent": "glitch",
      "CRT Light": "crt",
    },
  }).on("change", (ev) => {
    settings.pipeline = ev.value;
    postFX?.setMode?.(settings.pipeline);
    updatePipelineVisibility?.();
    saveSettings(settings);
    markInteraction?.();
  });

  postFxFolder.addInput(state, "bloomStrength", { label: "Bloom", min: 0, max: 2, step: 0.01 }).on("change", (ev) => {
    settings.bloomStrength = ev.value;
    if(postFX?.settings?.bloom){
      postFX.settings.bloom.strength = settings.bloomStrength;
    }
    saveSettings(settings);
    markInteraction?.();
  });

  postFxFolder.addInput(state, "trailDamp", { label: "Trails", min: 0.5, max: 0.99, step: 0.01 }).on("change", (ev) => {
    settings.trailDamp = ev.value;
    if(postFX?.settings?.afterimage){
      postFX.settings.afterimage.damp = settings.trailDamp;
    }
    saveSettings(settings);
    markInteraction?.();
  });

  postFxFolder.addInput(state, "grain", { label: "Grain", min: 0, max: 0.5, step: 0.01 }).on("change", (ev) => {
    settings.grain = ev.value;
    applyToneSettings?.(settings);
    refreshSlide?.(true);
    saveSettings(settings);
    markInteraction?.();
  });

  postFxFolder.addInput(state, "vignette", { label: "Vignette", min: 0, max: 0.8, step: 0.01 }).on("change", (ev) => {
    settings.vignette = ev.value;
    applyToneSettings?.(settings);
    refreshSlide?.(true);
    saveSettings(settings);
    markInteraction?.();
  });

  postFxFolder.addInput(state, "sharpen", { label: "Sharpen", min: 0, max: 1, step: 0.01 }).on("change", (ev) => {
    settings.sharpen = ev.value;
    applyToneSettings?.(settings);
    refreshSlide?.(true);
    saveSettings(settings);
    markInteraction?.();
  });

  postFxFolder.addInput(state, "chromSplit", { label: "RGB Split", min: 0, max: 0.01, step: 0.0005 }).on("change", (ev) => {
    settings.chromSplit = ev.value;
    updateChromSplit?.(settings.chromSplit);
    saveSettings(settings);
    markInteraction?.();
  });

  postFxFolder.addInput(state, "transitionSoftness", { label: "Transition Soft", min: 0, max: 0.6, step: 0.01 }).on("change", (ev) => {
    settings.transitionSoftness = ev.value;
    updateTransitionSoftness?.(settings.transitionSoftness);
    saveSettings(settings);
    markInteraction?.();
  });

  let layersFolder = null;
  function buildLayersFolder(){
    layersFolder?.dispose();
    layersFolder = pane.addFolder({ title: "Layers" });

    if(!layerManager){
      layersFolder.addInput({ status: "No manager" }, "status", { label: "Status", readonly: true });
      return;
    }

    const groupState = {
      visible: layerManager.group?.visible ?? true,
    };
    layersFolder.addInput(groupState, "visible", { label: "Group" }).on("change", (ev) => {
      layerManager.group.visible = ev.value;
      markInteraction?.();
    });

    const layers = layerManager.layers ?? [];
    if(layers.length === 0){
      layersFolder.addInput({ status: "No layers" }, "status", { label: "Status", readonly: true });
      return;
    }

    layers.forEach((layer) => {
      const labelBase = layer.name || layer.type || "Layer";
      const layerFolder = layersFolder.addFolder({ title: labelBase });
      const layerState = {
        visible: layer.object3d?.visible ?? layer.visible ?? true,
        opacity: layer.opacity ?? 1,
      };

      layerFolder.addInput(layerState, "visible", { label: "Visible" }).on("change", (ev) => {
        layerManager.updateLayer?.(layer.id, { visible: ev.value });
        markInteraction?.();
      });
      layerFolder.addInput(layerState, "opacity", { label: "Opacity", min: 0, max: 1, step: 0.01 }).on("change", (ev) => {
        layerManager.updateLayer?.(layer.id, { opacity: ev.value });
        markInteraction?.();
      });
    });
  }

  buildPlaylistFolder();
  buildLayersFolder();

  function refresh(){
    state.theme = settings.theme ?? "dark";
    state.autoplay = settings.autoplay;
    state.interval = settings.interval;
    state.transition = settings.transition;
    state.renderMode = settings.renderMode;
    state.pipeline = settings.pipeline;
    state.bloomStrength = settings.bloomStrength;
    state.trailDamp = settings.trailDamp;
    state.grain = settings.grain;
    state.vignette = settings.vignette;
    state.sharpen = settings.sharpen;
    state.chromSplit = settings.chromSplit;
    state.transitionSoftness = settings.transitionSoftness;
    applyTheme(state.theme);
    pane.refresh();
  }

  function refreshPlaylist(){
    buildPlaylistFolder();
    pane.refresh();
  }

  function refreshLayers(){
    buildLayersFolder();
    pane.refresh();
  }

  return {
    refresh,
    refreshPlaylist,
    refreshLayers,
  };
}
