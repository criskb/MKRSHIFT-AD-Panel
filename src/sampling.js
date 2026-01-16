import { clamp, mulberry32, shuffleInPlace } from "./utils.js";

export function sampleCanvasToParticles(canvas, opts){
  const ctx = canvas.getContext("2d", { willReadFrequently:true });
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0,0,w,h).data;

  // Auto mode heuristic: if lots of transparency, use alpha/silhouette.
  let transparentCount = 0;
  for(let i=3;i<img.length;i+=64){
    if(img[i] < 20) transparentCount++;
  }
  const transFrac = transparentCount / (img.length/64);

  const mode = (opts.mode === "auto")
    ? (transFrac > 0.08 ? "silhouette" : "edges")
    : opts.mode;

  // Compute a sampling step aiming for ~N candidates
  const N = opts.maxParticles;
  const base = w*h;
  let step = Math.max(1, Math.floor(Math.sqrt(base / (N*1.15))));
  if(mode === "edges") step = Math.max(1, Math.floor(step * 1.35));
  if(mode === "full") step = Math.max(1, Math.floor(step * 0.9));

  const thr = clamp(opts.threshold, 0.05, 0.95);

  const candidates = [];

  function lumaAt(x,y){
    const ix = (y*w + x) * 4;
    const r = img[ix+0], g = img[ix+1], b = img[ix+2];
    return (0.2126*r + 0.7152*g + 0.0722*b) / 255;
  }

  for(let y=1; y<h-1; y+=step){
    for(let x=1; x<w-1; x+=step){
      const i = (y*w + x) * 4;
      const r = img[i+0], g = img[i+1], b = img[i+2], a = img[i+3];
      if(a < 18) continue;

      const lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255;

      let ok = false;
      if(mode === "full") ok = true;
      else if(mode === "silhouette") ok = (a > 40) && (lum > 0.04);
      else {
        // edges
        const lumR = lumaAt(x+1,y);
        const lumD = lumaAt(x,y+1);
        const edge = Math.abs(lum - lumR) + Math.abs(lum - lumD);
        ok = edge > (1.0 - thr) * 0.55;
      }

      if(ok){
        // If silhouette mode, bias toward brighter (white ink). If edges, keep as-is.
        if(mode === "silhouette"){
          if(lum < (1.0 - thr)) continue;
        }
        candidates.push({x,y,r,g,b,a});
      }
    }
  }

  // Fallback if the image is too uniform
  if(candidates.length < Math.min(900, N*0.04)){
    for(let y=0;y<h;y+=Math.max(1, step)){
      for(let x=0;x<w;x+=Math.max(1, step)){
        const i = (y*w + x)*4;
        const a = img[i+3];
        if(a < 18) continue;
        candidates.push({x,y,r:img[i],g:img[i+1],b:img[i+2],a});
      }
    }
  }

  const rng = mulberry32((Math.random()*1e9)|0);
  shuffleInPlace(candidates, rng);

  const aspect = w / h;
  const count = Math.min(N, candidates.length);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);

  for(let i=0;i<count;i++){
    const p = candidates[i];
    // Normalize coords: y spans [-1..1], x spans [-aspect..aspect]
    const xN = ((p.x / w) - 0.5) * 2.0 * aspect;
    const yN = (0.5 - (p.y / h)) * 2.0;
    const zN = (rng()*2 - 1) * 0.08;

    pos[i*3+0] = xN;
    pos[i*3+1] = yN;
    pos[i*3+2] = zN;

    // Color: either keep image colors, or mostly white for silhouette.
    if(mode === "silhouette"){
      col[i*3+0] = 1.0;
      col[i*3+1] = 1.0;
      col[i*3+2] = 1.0;
    } else {
      col[i*3+0] = p.r/255;
      col[i*3+1] = p.g/255;
      col[i*3+2] = p.b/255;
    }
  }

  return { pos, col, count, imgAspect: aspect };
}
