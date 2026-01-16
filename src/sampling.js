import { clamp, mulberry32, shuffleInPlace } from "./utils.js";

export function sampleCanvasToParticles(canvas, opts){
  const ctx = canvas.getContext("2d", { willReadFrequently:true });
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0,0,w,h).data;
  const aspect = w / h;

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

  function ditherValue(x, y){
    const strength = clamp(opts.ditherStrength ?? 0, 0, 1);
    if(!opts.dither || opts.dither === "none" || strength <= 0) return 0.5;
    if(opts.dither === "random") return Math.random();
    if(opts.dither === "bayer2"){
      const m = [
        [0, 2],
        [3, 1],
      ];
      return (m[y % 2][x % 2] + 0.5) / 4;
    }
    if(opts.dither === "bayer4"){
      const m = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5],
      ];
      return (m[y % 4][x % 4] + 0.5) / 16;
    }
    return 0.5;
  }

  function applyDither(lum, x, y){
    const strength = clamp(opts.ditherStrength ?? 0, 0, 1);
    if(!opts.dither || opts.dither === "none" || strength <= 0) return lum;
    const dv = ditherValue(x, y);
    return clamp(lum + (dv - 0.5) * strength, 0, 1);
  }

  function ditherValueGrid(x, y){
    const type = opts.ditherType ?? "none";
    if(!type || type === "none") return 0.5;
    if(type === "random") return Math.random();
    if(type === "bayer2"){
      const m = [
        [0, 2],
        [3, 1],
      ];
      return (m[y % 2][x % 2] + 0.5) / 4;
    }
    if(type === "bayer4"){
      const m = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5],
      ];
      return (m[y % 4][x % 4] + 0.5) / 16;
    }
    return 0.5;
  }

  function applyGridDither(lum, gx, gy){
    const strength = clamp(opts.ditherStrength ?? 0, 0, 1);
    if(!opts.ditherType || opts.ditherType === "none" || strength <= 0) return lum;
    const dv = ditherValueGrid(gx, gy);
    return clamp(lum + (dv - 0.5) * strength, 0, 1);
  }

  function adjustColor(r, g, b){
    let rf = r / 255;
    let gf = g / 255;
    let bf = b / 255;

    // Brightness/contrast
    const brightness = opts.brightness ?? 0;
    const contrast = opts.contrast ?? 1;
    rf = clamp((rf - 0.5) * contrast + 0.5 + brightness, 0, 1);
    gf = clamp((gf - 0.5) * contrast + 0.5 + brightness, 0, 1);
    bf = clamp((bf - 0.5) * contrast + 0.5 + brightness, 0, 1);

    // Saturation
    const sat = opts.saturation ?? 1;
    const lum = 0.2126*rf + 0.7152*gf + 0.0722*bf;
    rf = clamp(lum + (rf - lum) * sat, 0, 1);
    gf = clamp(lum + (gf - lum) * sat, 0, 1);
    bf = clamp(lum + (bf - lum) * sat, 0, 1);

    // Gamma
    const gamma = opts.gamma ?? 1;
    const invGamma = gamma !== 0 ? 1 / gamma : 1;
    rf = clamp(Math.pow(rf, invGamma), 0, 1);
    gf = clamp(Math.pow(gf, invGamma), 0, 1);
    bf = clamp(Math.pow(bf, invGamma), 0, 1);

    return [rf, gf, bf];
  }

  if(mode === "grid"){
    const gridSize = clamp(Math.round(opts.gridSize ?? 16), 2, 200);
    const smoothing = clamp(opts.smoothing ?? 0, 0, 1);
    const cols = Math.ceil(w / gridSize);
    const rows = Math.ceil(h / gridSize);
    const cellCount = cols * rows;
    const cellLum = new Float32Array(cellCount);
    const cellAlpha = new Float32Array(cellCount);
    const cellColor = new Float32Array(cellCount * 3);

    for(let gy=0; gy<rows; gy++){
      const y0 = gy * gridSize;
      const y1 = Math.min(h, y0 + gridSize);
      for(let gx=0; gx<cols; gx++){
        const x0 = gx * gridSize;
        const x1 = Math.min(w, x0 + gridSize);
        let sumR = 0, sumG = 0, sumB = 0, sumA = 0, count = 0;
        for(let y=y0; y<y1; y++){
          for(let x=x0; x<x1; x++){
            const i = (y*w + x) * 4;
            sumR += img[i+0];
            sumG += img[i+1];
            sumB += img[i+2];
            sumA += img[i+3];
            count++;
          }
        }
        const idx = gy * cols + gx;
        if(count === 0) continue;
        const r = sumR / count;
        const g = sumG / count;
        const b = sumB / count;
        const a = sumA / (count * 255);
        cellColor[idx*3+0] = r;
        cellColor[idx*3+1] = g;
        cellColor[idx*3+2] = b;
        cellAlpha[idx] = a;
        cellLum[idx] = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
      }
    }

    const smoothed = new Float32Array(cellCount);
    if(smoothing > 0){
      for(let gy=0; gy<rows; gy++){
        for(let gx=0; gx<cols; gx++){
          let sum = 0;
          let c = 0;
          for(let oy=-1; oy<=1; oy++){
            const ny = gy + oy;
            if(ny < 0 || ny >= rows) continue;
            for(let ox=-1; ox<=1; ox++){
              const nx = gx + ox;
              if(nx < 0 || nx >= cols) continue;
              sum += cellLum[ny * cols + nx];
              c++;
            }
          }
          const idx = gy * cols + gx;
          const avg = c ? sum / c : cellLum[idx];
          smoothed[idx] = clamp(cellLum[idx] + (avg - cellLum[idx]) * smoothing, 0, 1);
        }
      }
    } else {
      smoothed.set(cellLum);
    }

    const desired = Math.max(1, N);
    const gridStep = Math.max(1, Math.ceil(Math.sqrt(cellCount / desired)));
    const posList = [];
    const colList = [];
    const alphaList = [];

    for(let gy=0; gy<rows; gy+=gridStep){
      const y0 = gy * gridSize;
      const y1 = Math.min(h, y0 + gridSize);
      const cy = y0 + (y1 - y0) * 0.5;
      for(let gx=0; gx<cols; gx+=gridStep){
        const x0 = gx * gridSize;
        const x1 = Math.min(w, x0 + gridSize);
        const cx = x0 + (x1 - x0) * 0.5;
        const idx = gy * cols + gx;
        if(cellAlpha[idx] <= 0.02) continue;
        let lum = applyGridDither(smoothed[idx], gx, gy);
        const alpha = clamp((1 - lum) * cellAlpha[idx], 0, 1);
        if(alpha <= 0.01) continue;

        const xN = ((cx / w) - 0.5) * 2.0 * aspect;
        const yN = (0.5 - (cy / h)) * 2.0;
        const zN = (Math.random()*2 - 1) * 0.02;
        posList.push(xN, yN, zN);

        const [rf, gf, bf] = adjustColor(
          cellColor[idx*3+0],
          cellColor[idx*3+1],
          cellColor[idx*3+2],
        );
        colList.push(rf, gf, bf);
        alphaList.push(alpha);
      }
    }

    const count = Math.min(desired, Math.floor(posList.length / 3));
    const pos = new Float32Array(posList.slice(0, count * 3));
    const col = new Float32Array(colList.slice(0, count * 3));
    const alpha = new Float32Array(alphaList.slice(0, count));
    return { pos, col, alpha, count, imgAspect: aspect };
  }

  for(let y=1; y<h-1; y+=step){
    for(let x=1; x<w-1; x+=step){
      const i = (y*w + x) * 4;
      const r = img[i+0], g = img[i+1], b = img[i+2], a = img[i+3];
      if(a < 18) continue;

      let lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
      lum = applyDither(lum, x, y);

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

  const count = Math.min(N, candidates.length);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const alpha = new Float32Array(count);

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
      const [rf, gf, bf] = adjustColor(p.r, p.g, p.b);
      col[i*3+0] = rf;
      col[i*3+1] = gf;
      col[i*3+2] = bf;
    }
    alpha[i] = 1;
  }

  return { pos, col, alpha, count, imgAspect: aspect };
}
