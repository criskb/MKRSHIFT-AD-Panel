import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { AfterimagePass } from "three/addons/postprocessing/AfterimagePass.js";
import { GlitchPass } from "three/addons/postprocessing/GlitchPass.js";
import { RGBShiftShader } from "three/addons/shaders/RGBShiftShader.js";
import { FilmPass } from "three/addons/postprocessing/FilmPass.js";
import { DotScreenPass } from "three/addons/postprocessing/DotScreenPass.js";
import { HalftonePass } from "three/addons/postprocessing/HalftonePass.js";
import { VignetteShader } from "three/addons/shaders/VignetteShader.js";

export const POSTFX_PRESETS = {
  none: { enabled: false, effects: [] },
  clean: { effects: [] },
  neon: { effects: ["bloom", "rgbShift", "film"] },
  vignette: { effects: ["vignette"] },
  halftone: { effects: ["halftone"] },
  afterimage: { effects: ["afterimage"] },
  glitch: { effects: ["glitch", "rgbShift"] },
  dotscreen: { effects: ["dotscreen"] },
  crt: { effects: ["film", "rgbShift"] },
};

export class PostFXManager {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.enabled = true;
    this.mode = "clean";
    this.passes = {};
    this.composer = null;
    this.effects = new Map();

    this.size = new THREE.Vector2(1, 1);
    this.dpr = 1;

    this.presets = POSTFX_PRESETS;
    this.settings = {
      bloom: { strength: 0.7, radius: 0.25, threshold: 0.85 },
      afterimage: { damp: 0.9 },
      glitch: { wild: false },
      rgbShift: { amount: 0.0015 },
      film: { noise: 0.2, scanlines: 0.1, scanlineCount: 800, grayscale: false },
      halftone: {
        radius: 1.0,
        rotateR: Math.PI / 12,
        rotateG: Math.PI / 12,
        rotateB: Math.PI / 12,
      },
      dotscreen: { scale: 1.5, angle: 1.2 },
      vignette: { offset: 1.0, darkness: 1.2 },
    };

    this.applyPreset(this.mode);
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === "none") {
      this.enabled = false;
      this.effects.clear();
      this.rebuildChain();
      return;
    }
    this.enabled = true;
    this.applyPreset(mode);
  }

  addEffect(name, pass = null, { enabled = true, rebuild = true } = {}) {
    const effectPass = pass ?? this.createPass(name);
    if (!effectPass) return null;
    this.effects.set(name, { pass: effectPass, enabled });
    if (rebuild) this.rebuildChain();
    return effectPass;
  }

  removeEffect(name, { rebuild = true } = {}) {
    this.effects.delete(name);
    if (rebuild) this.rebuildChain();
  }

  toggleEffect(name, enabled) {
    const effect = this.effects.get(name);
    if (!effect) return;
    effect.enabled = enabled ?? !effect.enabled;
    this.rebuildChain();
  }

  reorderEffects(order = []) {
    const reordered = new Map();
    order.forEach((name) => {
      const effect = this.effects.get(name);
      if (effect) reordered.set(name, effect);
    });
    for (const [name, effect] of this.effects.entries()) {
      if (!reordered.has(name)) reordered.set(name, effect);
    }
    this.effects = reordered;
    this.rebuildChain();
  }

  applyPreset(name) {
    const preset = this.presets[name];
    if (!preset) return;
    this.mode = name;
    this.enabled = preset.enabled !== false;
    this.effects.clear();
    preset.effects.forEach((effectName) => {
      this.addEffect(effectName, null, { rebuild: false });
    });
    this.rebuildChain();
  }

  createPass(name) {
    switch (name) {
      case "bloom": {
        return new UnrealBloomPass(
          new THREE.Vector2(this.size.x, this.size.y),
          this.settings.bloom.strength,
          this.settings.bloom.radius,
          this.settings.bloom.threshold,
        );
      }
      case "afterimage": {
        const afterPass = new AfterimagePass();
        afterPass.uniforms.damp.value = this.settings.afterimage.damp;
        return afterPass;
      }
      case "glitch": {
        const glitch = new GlitchPass();
        glitch.goWild = this.settings.glitch.wild;
        return glitch;
      }
      case "halftone": {
        return new HalftonePass(this.size.x, this.size.y, {
          radius: this.settings.halftone.radius,
          rotateR: this.settings.halftone.rotateR,
          rotateG: this.settings.halftone.rotateG,
          rotateB: this.settings.halftone.rotateB,
        });
      }
      case "dotscreen": {
        return new DotScreenPass(
          new THREE.Vector2(0, 0),
          this.settings.dotscreen.angle,
          this.settings.dotscreen.scale,
        );
      }
      case "rgbShift": {
        const rgb = new ShaderPass(RGBShiftShader);
        rgb.uniforms.amount.value = this.settings.rgbShift.amount;
        return rgb;
      }
      case "film": {
        return new FilmPass(
          this.settings.film.noise,
          this.settings.film.scanlines,
          this.settings.film.scanlineCount,
          this.settings.film.grayscale,
        );
      }
      case "vignette": {
        const vignette = new ShaderPass(VignetteShader);
        vignette.uniforms.offset.value = this.settings.vignette.offset;
        vignette.uniforms.darkness.value = this.settings.vignette.darkness;
        return vignette;
      }
      default:
        return null;
    }
  }

  rebuildChain() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(this.size.x, this.size.y);

    this.passes = {};
    const renderPass = new RenderPass(this.scene, this.camera);
    this.passes.render = renderPass;
    this.composer.addPass(renderPass);

    for (const [name, effect] of this.effects.entries()) {
      if (!effect.enabled) continue;
      this.passes[name] = effect.pass;
      this.composer.addPass(effect.pass);
    }

    const outputPass = new OutputPass();
    this.passes.output = outputPass;
    this.composer.addPass(outputPass);
  }

  render(delta) {
    if (!this.enabled || !this.composer) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render(delta);
  }

  setSize(w, h, dpr = 1) {
    this.size.set(w, h);
    this.dpr = dpr;
    if (this.composer) this.composer.setSize(w, h);
    for (const effect of this.effects.values()) {
      if (typeof effect.pass.setSize === "function") {
        effect.pass.setSize(w, h);
      }
      if (effect.pass.material?.uniforms?.resolution) {
        effect.pass.material.uniforms.resolution.value.set(
          1 / (w * dpr),
          1 / (h * dpr),
        );
      }
    }
  }
}
