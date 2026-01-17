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
  mediaPool.appendChild(video);
  video.play().catch(()=>{});
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
  return name.endsWith(".gif") || name.endsWith(".mp4") || name.endsWith(".webm");
}
