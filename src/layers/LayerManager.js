import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import helvetikerUrl from "three/examples/fonts/helvetiker_regular.typeface.json?url";

const SUPPORTED_LAYER_TYPES = new Set([
  "background",
  "image",
  "text",
  "overlay",
  "shape",
  "video",
  "3dmodel",
]);

function normalizeColor(value, fallback = "#ffffff"){
  if(value == null) return new THREE.Color(fallback);
  return value instanceof THREE.Color ? value : new THREE.Color(value);
}

function applyTransform(object3d, layer){
  if(layer.position){
    object3d.position.set(
      layer.position.x ?? 0,
      layer.position.y ?? 0,
      layer.position.z ?? 0,
    );
  }
  if(layer.rotation){
    object3d.rotation.set(
      layer.rotation.x ?? 0,
      layer.rotation.y ?? 0,
      layer.rotation.z ?? 0,
    );
  }
  if(layer.scale){
    object3d.scale.set(
      layer.scale.x ?? 1,
      layer.scale.y ?? 1,
      layer.scale.z ?? 1,
    );
  }
  if(layer.visible != null){
    object3d.visible = Boolean(layer.visible);
  }
}

function applyMaterialSettings(material, layer){
  if(!material) return;
  if(layer.opacity != null){
    material.transparent = layer.opacity < 1;
    material.opacity = layer.opacity;
  }
  if(layer.color != null && material.color){
    material.color = normalizeColor(layer.color, material.color);
  }
  material.needsUpdate = true;
}

export class LayerManager {
  constructor({ scene, groupName = "LayerGroup" } = {}){
    this.scene = scene || null;
    this.group = new THREE.Group();
    this.group.name = groupName;
    this.layers = [];
    this.fontLoader = new FontLoader();
    this.textureLoader = new THREE.TextureLoader();

    if(this.scene){
      this.scene.add(this.group);
    }
  }

  async addLayer(layer){
    if(!layer || !layer.type){
      throw new Error("Layer type is required.");
    }
    if(!SUPPORTED_LAYER_TYPES.has(layer.type)){
      throw new Error(`Unsupported layer type: ${layer.type}`);
    }
    const id = layer.id ?? crypto.randomUUID();
    const normalizedLayer = { ...layer, id };
    const object3d = await this.createLayerObject(normalizedLayer);
    object3d.userData.layerId = id;
    normalizedLayer.object3d = object3d;

    this.layers.push(normalizedLayer);
    this.group.add(object3d);
    applyTransform(object3d, normalizedLayer);
    this.updateLayerOrder();

    return normalizedLayer;
  }

  removeLayer(layerId){
    const index = this.layers.findIndex((layer) => layer.id === layerId);
    if(index === -1) return null;
    const [removed] = this.layers.splice(index, 1);
    if(removed?.object3d){
      this.group.remove(removed.object3d);
    }
    this.updateLayerOrder();
    return removed;
  }

  async updateLayer(layerId, updates){
    const layer = this.layers.find((item) => item.id === layerId);
    if(!layer) return null;
    Object.assign(layer, updates);

    if(layer.type === "text" && updates){
      const shouldRebuild = ["text", "fontUrl", "size", "height", "curveSegments", "bevelEnabled"].some(
        (key) => key in updates,
      );
      if(shouldRebuild){
        const newObject = await this.createTextLayer(layer);
        this.replaceLayerObject(layer, newObject);
      }
    }

    if(layer.type === "image" && updates?.url){
      const texture = await this.loadTexture(updates.url);
      if(layer.object3d?.material){
        layer.object3d.material.map = texture;
        layer.object3d.material.needsUpdate = true;
      }
    }

    if(layer.type === "video" && updates?.url){
      const video = this.createVideoElement(updates.url, updates);
      const texture = new THREE.VideoTexture(video);
      if(layer.object3d?.material){
        layer.object3d.material.map = texture;
        layer.object3d.material.needsUpdate = true;
      }
    }

    if(layer.object3d){
      applyTransform(layer.object3d, layer);
      applyMaterialSettings(layer.object3d.material, layer);
    }

    return layer;
  }

  reorderLayers(order){
    if(!Array.isArray(order)) return;
    const lookup = new Map(this.layers.map((layer) => [layer.id, layer]));
    const ordered = [];
    order.forEach((id) => {
      const layer = lookup.get(id);
      if(layer){
        ordered.push(layer);
        lookup.delete(id);
      }
    });
    lookup.forEach((layer) => ordered.push(layer));
    this.layers = ordered;
    this.updateLayerOrder();
  }

  sortLayers(compareFn){
    if(typeof compareFn !== "function") return;
    this.layers.sort(compareFn);
    this.updateLayerOrder();
  }

  clear(){
    this.layers.forEach((layer) => {
      if(layer.object3d){
        this.group.remove(layer.object3d);
      }
    });
    this.layers = [];
  }

  replaceLayerObject(layer, newObject){
    if(layer.object3d){
      this.group.remove(layer.object3d);
    }
    layer.object3d = newObject;
    newObject.userData.layerId = layer.id;
    this.group.add(newObject);
    applyTransform(newObject, layer);
    applyMaterialSettings(newObject.material, layer);
    this.updateLayerOrder();
  }

  updateLayerOrder(){
    this.layers.forEach((layer, index) => {
      if(layer.object3d){
        layer.object3d.renderOrder = index;
      }
    });
  }

  async createLayerObject(layer){
    switch(layer.type){
      case "background":
        return this.createBackgroundLayer(layer);
      case "image":
        return this.createImageLayer(layer);
      case "text":
        return this.createTextLayer(layer);
      case "overlay":
        return this.createOverlayLayer(layer);
      case "shape":
        return this.createShapeLayer(layer);
      case "video":
        return this.createVideoLayer(layer);
      case "3dmodel":
        return this.createModelLayer(layer);
      default:
        throw new Error(`Unsupported layer type: ${layer.type}`);
    }
  }

  createBackgroundLayer(layer){
    const geometry = new THREE.PlaneGeometry(layer.width ?? 1, layer.height ?? 1);
    const material = new THREE.MeshBasicMaterial({
      color: normalizeColor(layer.color, "#000000"),
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = layer.position?.z ?? -1;
    applyMaterialSettings(material, layer);
    return mesh;
  }

  async createImageLayer(layer){
    const geometry = new THREE.PlaneGeometry(layer.width ?? 1, layer.height ?? 1);
    const texture = layer.texture || (layer.url ? await this.loadTexture(layer.url) : null);
    const material = new THREE.MeshBasicMaterial({
      color: normalizeColor(layer.color, "#ffffff"),
      map: texture,
      transparent: layer.opacity != null ? layer.opacity < 1 : true,
      opacity: layer.opacity ?? 1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }

  async createTextLayer(layer){
    const fontUrl = layer.fontUrl || helvetikerUrl;
    const font = layer.font || (await this.loadFont(fontUrl));
    const geometry = new TextGeometry(layer.text ?? "Text", {
      font,
      size: layer.size ?? 16,
      height: layer.height ?? 1,
      curveSegments: layer.curveSegments ?? 8,
      bevelEnabled: layer.bevelEnabled ?? false,
      bevelThickness: layer.bevelThickness ?? 0.2,
      bevelSize: layer.bevelSize ?? 0.2,
      bevelOffset: layer.bevelOffset ?? 0,
      bevelSegments: layer.bevelSegments ?? 2,
    });
    geometry.computeBoundingBox();
    const material = new THREE.MeshBasicMaterial({
      color: normalizeColor(layer.color, "#ffffff"),
      transparent: layer.opacity != null ? layer.opacity < 1 : true,
      opacity: layer.opacity ?? 1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    if(layer.center !== false && geometry.boundingBox){
      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      mesh.position.sub(center);
    }
    return mesh;
  }

  createOverlayLayer(layer){
    const geometry = new THREE.PlaneGeometry(layer.width ?? 1, layer.height ?? 1);
    const material = new THREE.MeshBasicMaterial({
      color: normalizeColor(layer.color, "#ffffff"),
      transparent: true,
      opacity: layer.opacity ?? 0.5,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }

  createShapeLayer(layer){
    let geometry = null;
    if(layer.shape === "circle"){
      geometry = new THREE.CircleGeometry(layer.radius ?? 1, layer.segments ?? 32);
    } else {
      geometry = new THREE.PlaneGeometry(layer.width ?? 1, layer.height ?? 1);
    }
    const material = new THREE.MeshBasicMaterial({
      color: normalizeColor(layer.color, "#ffffff"),
      transparent: layer.opacity != null ? layer.opacity < 1 : true,
      opacity: layer.opacity ?? 1,
    });
    return new THREE.Mesh(geometry, material);
  }

  async createVideoLayer(layer){
    const geometry = new THREE.PlaneGeometry(layer.width ?? 1, layer.height ?? 1);
    const video = layer.video || this.createVideoElement(layer.url, layer);
    const texture = new THREE.VideoTexture(video);
    const material = new THREE.MeshBasicMaterial({
      color: normalizeColor(layer.color, "#ffffff"),
      map: texture,
      transparent: layer.opacity != null ? layer.opacity < 1 : true,
      opacity: layer.opacity ?? 1,
    });
    return new THREE.Mesh(geometry, material);
  }

  createModelLayer(layer){
    if(layer.object3d instanceof THREE.Object3D){
      return layer.object3d;
    }
    const group = new THREE.Group();
    group.name = layer.name ?? "ModelLayer";
    return group;
  }

  async loadTexture(url){
    return new Promise((resolve, reject) => {
      this.textureLoader.load(url, resolve, undefined, reject);
    });
  }

  async loadFont(url){
    return new Promise((resolve, reject) => {
      this.fontLoader.load(url, resolve, undefined, reject);
    });
  }

  createVideoElement(url, layer = {}){
    const video = document.createElement("video");
    video.src = url;
    video.crossOrigin = layer.crossOrigin ?? "anonymous";
    video.muted = layer.muted ?? true;
    video.loop = layer.loop ?? true;
    video.playsInline = true;
    const playPromise = video.play();
    if(playPromise && typeof playPromise.catch === "function"){
      playPromise.catch(() => {});
    }
    return video;
  }
}

export { SUPPORTED_LAYER_TYPES };
