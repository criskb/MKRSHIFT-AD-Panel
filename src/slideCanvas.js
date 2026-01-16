export function makeTextCanvas(title, sub){
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 600;
  const ctx = c.getContext("2d");
  ctx.clearRect(0,0,c.width,c.height);

  // Transparent background, white ink
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Title
  ctx.font = "800 180px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  ctx.fillText(title, c.width/2, c.height/2 - 40);

  if(sub){
    ctx.font = "600 54px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.fillText(sub, c.width/2, c.height/2 + 110);
  }
  return c;
}

export async function makeImageCanvas(img){
  // Downscale to a manageable sampling size (keeps transitions fast)
  const maxDim = 320;
  const ar = img.width / img.height;
  let w = maxDim, h = maxDim;
  if(ar >= 1){
    w = maxDim;
    h = Math.max(1, Math.round(maxDim / ar));
  } else {
    h = maxDim;
    w = Math.max(1, Math.round(maxDim * ar));
  }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently:true });
  ctx.clearRect(0,0,w,h);
  // Centered fit
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}
