import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { AfterimagePass } from "three/addons/postprocessing/AfterimagePass.js";
import { GlitchPass } from "three/addons/postprocessing/GlitchPass.js";
import { RGBShiftShader } from "three/addons/shaders/RGBShiftShader.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { FilmPass } from "three/addons/postprocessing/FilmPass.js";
import { DotScreenPass } from "three/addons/postprocessing/DotScreenPass.js";
import { HalftonePass } from "three/addons/postprocessing/HalftonePass.js";

export class PostFXManager {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.enabled = false;
    this.mode = "none";
    this.passes = {};
    this.composer = null;

    this.size = new THREE.Vector2(1, 1);
    this.dpr = 1;

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
    };
  }

  initComposerIfNeeded() {
    if (this.composer) return;
    this.rebuildChain();
  }

  setSize(w, h, dpr = 1) {
    this.size.set(w, h);
    this.dpr = dpr;
    if (this.composer) this.composer.setSize(w, h);
    if (this.passes.fxaa?.material?.uniforms?.resolution) {
      this.passes.fxaa.material.uniforms.resolution.value.set(
        1 / (w * dpr),
        1 / (h * dpr),
      );
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.enabled = mode !== "none";
    this.initComposerIfNeeded();
    this.rebuildChain();
  }

  rebuildChain() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(this.size.x, this.size.y);

    this.passes = {};
    const renderPass = new RenderPass(this.scene, this.camera);
    this.passes.render = renderPass;
    this.composer.addPass(renderPass);

    if (this.mode === "neon") {
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(this.size.x, this.size.y),
        this.settings.bloom.strength,
        this.settings.bloom.radius,
        this.settings.bloom.threshold,
      );
      this.passes.bloom = bloomPass;
      this.composer.addPass(bloomPass);
    }

    if (this.mode === "afterimage") {
      const afterPass = new AfterimagePass();
      afterPass.uniforms.damp.value = this.settings.afterimage.damp;
      this.passes.afterimage = afterPass;
      this.composer.addPass(afterPass);
    }

    if (this.mode === "glitch") {
      const glitch = new GlitchPass();
      glitch.goWild = this.settings.glitch.wild;
      this.passes.glitch = glitch;
      this.composer.addPass(glitch);
    }

    if (this.mode === "halftone") {
      const halftone = new HalftonePass(this.size.x, this.size.y, {
        radius: this.settings.halftone.radius,
        rotateR: this.settings.halftone.rotateR,
        rotateG: this.settings.halftone.rotateG,
        rotateB: this.settings.halftone.rotateB,
      });
      this.passes.halftone = halftone;
      this.composer.addPass(halftone);
    }

    if (this.mode === "dotscreen") {
      const dot = new DotScreenPass(
        new THREE.Vector2(0, 0),
        this.settings.dotscreen.angle,
        this.settings.dotscreen.scale,
      );
      this.passes.dotscreen = dot;
      this.composer.addPass(dot);
    }

    if (this.mode === "neon" || this.mode === "glitch") {
      const rgb = new ShaderPass(RGBShiftShader);
      rgb.uniforms.amount.value = this.settings.rgbShift.amount;
      this.passes.rgbShift = rgb;
      this.composer.addPass(rgb);
    }

    if (this.mode === "crt" || this.mode === "neon") {
      const film = new FilmPass(
        this.settings.film.noise,
        this.settings.film.scanlines,
        this.settings.film.scanlineCount,
        this.settings.film.grayscale,
      );
      this.passes.film = film;
      this.composer.addPass(film);
    }

    const fxaa = new ShaderPass(FXAAShader);
    fxaa.material.uniforms.resolution.value.set(
      1 / (this.size.x * this.dpr),
      1 / (this.size.y * this.dpr),
    );
    this.passes.fxaa = fxaa;
    this.composer.addPass(fxaa);
  }

  render(delta) {
    if (!this.enabled || !this.composer) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render(delta);
  }
}
