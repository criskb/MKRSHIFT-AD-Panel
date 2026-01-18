export function attachAnimatedImage(img, mediaPool){
  if(!mediaPool) return;
  if(img.dataset?.attached === "true") return;
  img.dataset.attached = "true";
  img.style.position = "absolute";
  img.style.left = "0";
  img.style.top = "0";
  img.style.width = "1px";
  img.style.height = "1px";
  img.style.opacity = "0";
  mediaPool.appendChild(img);
}

export function attachAnimatedVideo(video, mediaPool){
  if(!mediaPool) return;
  if(video.dataset?.attached === "true") return;
  video.dataset.attached = "true";
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.loop = true;
  mediaPool.appendChild(video);
  video.play().catch(()=>{});
}

async function tryPlay(video){
  try{
    await video.play();
  } catch(err){
    const error = new Error("AUTOPLAY_BLOCKED");
    error.cause = err;
    throw error;
  }
}

export function loadImageFromFile(file, keepAlive = false){
  return new Promise((resolve, reject)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.loading = "eager";
    img.onload = ()=>{ if(!keepAlive) URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e)=>{ if(!keepAlive) URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export function loadImageFromDataUrl(dataUrl){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.loading = "eager";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
}

export function loadVideoFromDataUrl(dataUrl){
  return new Promise((resolve, reject)=> {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.autoplay = true;
    let settled = false;
    const cleanup = () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
    };
    const onReady = async () => {
      if(settled) return;
      settled = true;
      cleanup();
      try{
        await tryPlay(video);
        resolve(video);
      } catch(err){
        reject(err);
      }
    };
    const onError = (e) => {
      if(settled) return;
      settled = true;
      cleanup();
      reject(e);
    };
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("canplay", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.src = dataUrl;
    video.load();
    if(video.readyState >= 2){
      queueMicrotask(onReady);
    }
  });
}

export function loadVideoFromFile(file){
  return new Promise((resolve, reject)=> {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.autoplay = true;
    let settled = false;
    const cleanup = () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
    };
    const onReady = async () => {
      if(settled) return;
      settled = true;
      cleanup();
      try{
        await tryPlay(video);
        resolve(video);
      } catch(err){
        reject(err);
      }
    };
    const onError = (e) => {
      if(settled) return;
      settled = true;
      cleanup();
      reject(e);
    };
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("canplay", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.src = url;
    video.load();
    if(video.readyState >= 2){
      queueMicrotask(onReady);
    }
  });
}

export function readFileAsDataURL(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

export function isVideoFile(file){
  return Boolean(file?.type && file.type.startsWith("video/"));
}

export function isGifFile(file){
  const name = (file?.name || "").toLowerCase();
  return file?.type === "image/gif" || name.endsWith(".gif");
}

export function isSupportedFile(file){
  if(!file) return false;
  if(file.type && (file.type.startsWith("image/") || file.type.startsWith("video/"))){
    return true;
  }
  const name = (file.name || "").toLowerCase();
  const imageExts = [".gif", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".svg"];
  const videoExts = [".mp4", ".webm", ".mov", ".m4v"];
  return imageExts.some((ext) => name.endsWith(ext)) || videoExts.some((ext) => name.endsWith(ext));
}
