import { THEMES } from "../themes/index.js";

(()=>{
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

  const elList = $('#themeList');
  const elActiveName = $('#activeName');
  const elClock = $('#clock');
  const elToasts = $('#toasts');

  const btnPrev = $('#btnPrev');
  const btnNext = $('#btnNext');
  const btnRand = $('#btnRand');
  const search = $('#search');
  const btnClearSearch = $('#btnClearSearch');

  const btnKiosk = $('#btnKiosk');
  const btnModal = $('#btnModal');
  const btnDrawer = $('#btnDrawer');
  const btnMenu = $('#btnMenu');
  const demoMenu = $('#demoMenu');

  const togAnim = $('#togAnim');
  const togPerf = $('#togPerf');

  const slRadius = $('#slRadius');
  const slBlur = $('#slBlur');
  const vRadius = $('#vRadius');
  const vBlur = $('#vBlur');

  const btnToast = $('#btnToast');
  const btnProgress = $('#btnProgress');
  const progressTxt = $('#progressTxt');
  const progressFill = $('#progressFill');

  const btnRegenGraphs = $('#btnRegenGraphs');
  const btnCopyCSS = $('#btnCopyCSS');
  const btnCopyVars = $('#btnCopyVars');
  const btnResetAll = $('#btnResetAll');

  const log = $('#log');
  const btnCopyLog = $('#btnCopyLog');
  const btnAppendLog = $('#btnAppendLog');

  // Drawer
  const scrim = $('#scrim');
  const drawer = $('#drawer');
  const btnCloseDrawer = $('#btnCloseDrawer');
  const resize = $('#resize');

  // Modal
  const modalWrap = $('#modalWrap');
  const btnCloseModal = $('#btnCloseModal');

  // Accent lab
  const wheel = $('#wheel');
  const wheelMarker = $('#wheelMarker');
  const hexInput = $('#hex');
  const btnSetAccent = $('#btnSetAccent');
  const btnApplyAccent2 = $('#btnApplyAccent2');
  const btnResetAccent2 = $('#btnResetAccent2');
  const accentPreview = $('#accentPreview');
  const accentHex = $('#accentHex');
  const swatches = $('#swatches');

  // Drawer quick actions
  const btnDrawerToast = $('#btnDrawerToast');
  const btnDrawerRegen = $('#btnDrawerRegen');
  const btnDrawerCopy = $('#btnDrawerCopy');

  // Modal actions
  const btnModalToast = $('#btnModalToast');
  const btnModalRegen = $('#btnModalRegen');
  const btnModalPerf = $('#btnModalPerf');
  const btnModalCopyBlock = $('#btnModalCopyBlock');

  // Drawer tabs
  const drawerTabs = $('#drawerTabs');

  // ------------ State ------------
  const LS = {
    theme:'tc_theme',
    radius:'tc_radius',
    blur:'tc_blur',
    anim:'tc_anim',
    perf:'tc_perf',
    accent2Prefix:'tc_accent2_' // + themeId
  };

  let themeIndex = 0;
  let progress = 45;
  let fpsCounter = {frames:0, last:performance.now(), fps:60};

  // ------------ Helpers ------------
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const randInt=(a,b)=>Math.floor(a+Math.random()*(b-a+1));
  const fmt=(n,d=0)=>(+n).toFixed(d);

  const cssGet=(k)=>getComputedStyle(document.documentElement).getPropertyValue(k).trim();

  function toast(title, msg, type='ok'){
    const t = document.createElement('div');
    t.className='toast';
    const dot = document.createElement('div');
    dot.className='dot';
    dot.style.background = type==='ok'? 'var(--ok)' : type==='warn'? 'var(--warn)' : 'var(--danger)';
    const box = document.createElement('div');
    const tt = document.createElement('div'); tt.className='t'; tt.textContent=title;
    const ss = document.createElement('div'); ss.className='s'; ss.textContent=msg;
    box.append(tt, ss);
    t.append(dot, box);
    elToasts.appendChild(t);
    setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateY(-4px)'; }, 2900);
    setTimeout(()=>{ t.remove(); }, 3300);
  }

  function setRootVars(vars){
    const root = document.documentElement;
    for (const [k,v] of Object.entries(vars)) root.style.setProperty(k,v);
  }

  function getAccent2Override(themeId){
    return localStorage.getItem(LS.accent2Prefix+themeId) || '';
  }

  function applyAccent2Override(themeId){
    const v = getAccent2Override(themeId);
    if (v) document.documentElement.style.setProperty('--accent2', v);
  }

  function themeFromId(id){
    const idx = THEMES.findIndex(x=>x.id===id);
    return idx>=0? idx : 0;
  }

  function setThemeByIndex(i){
    themeIndex = (i + THEMES.length) % THEMES.length;
    const t = THEMES[themeIndex];
    setRootVars(t.vars);
    applyAccent2Override(t.id);

    document.documentElement.dataset.theme = t.id;
    elActiveName.textContent = t.label;
    localStorage.setItem(LS.theme, t.id);

    renderThemeList();
    syncAccentUI();
    regenGraphs(false);
    logLine(`Theme set to ${t.label}`);
  }

  function cycle(dir){ setThemeByIndex(themeIndex + dir); }

  function filteredIds(){
    try{
      const j = elList.dataset.filtered || '[]';
      const arr = JSON.parse(j);
      return Array.isArray(arr)? arr : [];
    }catch{ return []; }
  }

  function renderThemeList(){
    const q = (search.value||'').trim().toLowerCase();
    elList.innerHTML='';
    const filtered = THEMES.filter(t => !q || (t.label.toLowerCase().includes(q) || t.tags.join(' ').toLowerCase().includes(q) || t.id.toLowerCase().includes(q)));
    filtered.forEach((t, idx)=>{
      const item = document.createElement('div');
      item.className = 'themeItem' + (t.id===THEMES[themeIndex].id ? ' active' : '');
      item.dataset.id = t.id;
      item.innerHTML = `
        <div class="sw" style="background:${t.sw[0]}"></div>
        <div>
          <div class="themeName">${t.label}</div>
          <div class="hint" style="margin-top:2px;">${t.tags.join(' • ')}</div>
          <div class="themeGlyphs">${t.glyphs.slice(0, 5).join(' ')}</div>
        </div>
        <div class="themeMeta">
          <div class="tag">${idx+1}</div>
        </div>
      `;
      item.addEventListener('click', ()=> setThemeByIndex(themeFromId(t.id)));
      elList.appendChild(item);
    });
    elList.dataset.filtered = JSON.stringify(filtered.map(t=>t.id));
  }

  // ------------ Seg + Pills ------------
  function buildSeg(){
    const seg = $('#seg');
    const labels = ['Build','Ship','Launch'];
    seg.innerHTML='';
    labels.forEach((lab,i)=>{
      const b = document.createElement('button');
      b.textContent = lab;
      if (i===0) b.classList.add('active');
      b.addEventListener('click', ()=>{
        $$('#seg button').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        toast('Segment', `Selected “${lab}”`, 'ok');
      });
      seg.appendChild(b);
    });
  }

  function buildPills(){
    const wrap = $('#pills');
    const pills = ['Auto','HDR','Loop','Sync','Safe'];
    wrap.innerHTML='';
    pills.forEach((p,i)=>{
      const d = document.createElement('div');
      d.className = 'pill' + (i===0? ' active':'');
      d.textContent = p;
      d.addEventListener('click', ()=> d.classList.toggle('active'));
      wrap.appendChild(d);
    });
  }

  // ------------ Tabs ------------
  function wireTabs(container){
    const tabBtns = $$('.tab', container);
    tabBtns.forEach(btn=>btn.addEventListener('click', ()=>{
      const id = btn.dataset.tab;
      tabBtns.forEach(x=>x.classList.toggle('active', x===btn));
      tabBtns.forEach(tb=>{
        const panel = $('#'+tb.dataset.tab);
        if (panel) panel.classList.toggle('active', tb===btn);
      });
    }));
  }

  // ------------ Graphs ------------
  function regenGraphs(showToast=true){
    // spark
    const svg = $('#spark');
    const w = 220, h = 70;
    const pts = Array.from({length:24}, (_,i)=>( {
      x: i*(w/(24-1)),
      y: randInt(10,60)
    }));
    const d = pts.map((p,i)=> (i? 'L':'M') + p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
    svg.innerHTML = `
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="${cssGet('--accent')}"/>
          <stop offset="1" stop-color="${cssGet('--accent2')}"/>
        </linearGradient>
      </defs>
      <path d="${d}" fill="none" stroke="url(#g)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${d} L ${w},${h} L 0,${h} Z" fill="url(#g)" opacity=".10"/>
    `;

    // bars
    const bars = $('#bars');
    bars.innerHTML='';
    const colors = [cssGet('--accent'), cssGet('--ok'), cssGet('--warn'), cssGet('--danger'), cssGet('--accent2')];
    for (let i=0;i<14;i++){
      const b = document.createElement('div');
      const ht = randInt(18, 88);
      b.style.height = ht+'%';
      b.style.flex='1';
      b.style.borderRadius='10px';
      b.style.border='1px solid var(--outline)';
      b.style.background = `linear-gradient(180deg, ${colors[i%colors.length]}, rgba(255,255,255,.10))`;
      b.title = ht+'%';
      bars.appendChild(b);
    }
    if (showToast) toast('Graphs', 'Regenerated demo data', 'ok');
  }

  // ------------ Logs ------------
  function logLine(s){
    const ts = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    log.textContent += (log.textContent? '\n':'') + `[${ts}] ${s}`;
    log.scrollTop = log.scrollHeight;
  }

  // ------------ Dials ------------
  function initDials(){
    $$('.dial[data-dial]').forEach(dial=>{
      const min = parseFloat(dial.dataset.min ?? '0');
      const max = parseFloat(dial.dataset.max ?? '100');
      const step = parseFloat(dial.dataset.step ?? '1');
      let value = parseFloat(dial.dataset.value ?? '0');
      value = clamp(value, min, max);

      dial.innerHTML = `
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <path class="bg" d="" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="10" stroke-linecap="round"/>
          <path class="fg" d="" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round"/>
        </svg>
        <div style="position:absolute; bottom:10px; text-align:center; width:100%;">
          <div class="dialVal"></div>
        </div>
      `;
      const fg = dial.querySelector('.fg');
      const bg = dial.querySelector('.bg');
      const valEl = dial.querySelector('.dialVal');

      const a0 = -225; // degrees
      const a1 = 45;

      function polar(cx,cy,r,ang){
        const rad = (ang-90) * Math.PI/180;
        return {x: cx + r*Math.cos(rad), y: cy + r*Math.sin(rad)};
      }
      function arcPath(cx,cy,r,angStart,angEnd){
        const s = polar(cx,cy,r,angEnd);
        const e = polar(cx,cy,r,angStart);
        const span = Math.abs(angEnd-angStart);
        const large = span <= 180 ? 0 : 1;
        return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
      }
      bg.setAttribute('d', arcPath(50,50,34,a0,a1));

      function set(v){
        value = clamp(v, min, max);
        value = Math.round((value-min)/step)*step + min;
        value = clamp(value, min, max);
        const t = (value-min)/(max-min || 1);
        const ang = a0 + (a1-a0)*t;
        fg.setAttribute('d', arcPath(50,50,34,a0,ang));
        valEl.textContent = (max<=1.5 ? fmt(value,2) : (step<1? fmt(value,1) : fmt(value,0)));
        dial.dataset.value = String(value);
      }
      set(value);

      let dragging=false;
      let lastY=0;
      dial.addEventListener('pointerdown', (e)=>{
        dragging=true; lastY = e.clientY; dial.setPointerCapture(e.pointerId);
      });
      dial.addEventListener('pointermove', (e)=>{
        if (!dragging) return;
        const dy = lastY - e.clientY;
        lastY = e.clientY;
        const delta = (max-min) * (dy/240);
        set(value + delta);
      });
      dial.addEventListener('pointerup', ()=> dragging=false);
      dial.addEventListener('pointercancel', ()=> dragging=false);
      dial.addEventListener('wheel', (e)=>{
        e.preventDefault();
        const delta = (max-min) * (-e.deltaY/1200);
        set(value + delta);
      }, {passive:false});
    });
  }

  // ------------ Accent wheel ------------
  function hexToRgb(hex){
    const m = (hex||'').trim().match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return {r:(n>>16)&255, g:(n>>8)&255, b:n&255};
  }
  function rgbToHex(r,g,b){
    const to = (x)=>('0'+clamp(Math.round(x),0,255).toString(16)).slice(-2);
    return '#'+to(r)+to(g)+to(b);
  }
  function rgbToHsv(r,g,b){
    r/=255; g/=255; b/=255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b);
    const d=max-min;
    let h=0;
    if (d!==0){
      if (max===r) h=((g-b)/d)%6;
      else if (max===g) h=((b-r)/d)+2;
      else h=((r-g)/d)+4;
      h*=60; if (h<0) h+=360;
    }
    const s = max===0? 0 : d/max;
    const v = max;
    return {h,s,v};
  }
  function hsvToRgb(h,s,v){
    const c = v*s;
    const x = c*(1-Math.abs((h/60)%2-1));
    const m = v-c;
    let r=0,g=0,b=0;
    if (h<60){r=c;g=x;b=0;}
    else if (h<120){r=x;g=c;b=0;}
    else if (h<180){r=0;g=c;b=x;}
    else if (h<240){r=0;g=x;b=c;}
    else if (h<300){r=x;g=0;b=c;}
    else{r=c;g=0;b=x;}
    return {r:Math.round((r+m)*255), g:Math.round((g+m)*255), b:Math.round((b+m)*255)};
  }

  function drawWheel(){
    const ctx = wheel.getContext('2d');
    const w = wheel.width; const h = wheel.height;
    const img = ctx.createImageData(w,h);
    const cx = w/2, cy=h/2, r = w/2;
    for (let y=0;y<h;y++){
      for (let x=0;x<w;x++){
        const dx = x-cx, dy = y-cy;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if (dist>r) continue;
        const ang = (Math.atan2(dy,dx)*180/Math.PI + 360) % 360;
        const sat = dist/r;
        const rgb = hsvToRgb(ang, sat, 1);
        const i = (y*w+x)*4;
        img.data[i]=rgb.r; img.data[i+1]=rgb.g; img.data[i+2]=rgb.b; img.data[i+3]=255;
      }
    }
    ctx.putImageData(img,0,0);
  }

  function setAccent(hex){
    document.documentElement.style.setProperty('--accent', hex);
    accentPreview.style.background = hex;
    accentHex.textContent = hex;
    hexInput.value = hex;
  }

  function syncAccentUI(){
    const hex = cssGet('--accent2') || '#9a7bff';
    accentPreview.style.background = hex;
    accentHex.textContent = hex;
  }

  function setWheelMarkerFromHex(hex){
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const hsv = rgbToHsv(rgb.r,rgb.g,rgb.b);
    const rad = (hsv.h-90) * Math.PI/180;
    const r = (wheel.width/2) * hsv.s;
    const cx = wheel.width/2, cy = wheel.height/2;
    const x = cx + r*Math.cos(rad);
    const y = cy + r*Math.sin(rad);
    wheelMarker.style.left = `${x}px`;
    wheelMarker.style.top = `${y}px`;
  }

  function applyAccent2(hex){
    const t = THEMES[themeIndex];
    localStorage.setItem(LS.accent2Prefix+t.id, hex);
    document.documentElement.style.setProperty('--accent2', hex);
    syncAccentUI();
  }

  function resetAccent2(){
    const t = THEMES[themeIndex];
    localStorage.removeItem(LS.accent2Prefix+t.id);
    document.documentElement.style.setProperty('--accent2', t.vars['--accent2']);
    syncAccentUI();
  }

  function buildSwatches(){
    const colors = Array.from(new Set(THEMES.flatMap((theme) => theme.sw)));
    swatches.innerHTML = '';
    colors.forEach((c) => {
      const s = document.createElement('div');
      s.className = 'swatch';
      s.style.background = c;
      s.title = c;
      s.addEventListener('click', () => setAccent(c));
      swatches.appendChild(s);
    });
  }

  // ------------ Drawer / Modal ------------
  function openDrawer(){
    drawer.classList.add('open');
    scrim.classList.add('open');
  }
  function closeDrawer(){
    drawer.classList.remove('open');
    scrim.classList.remove('open');
  }

  function openModal(){ modalWrap.classList.add('open'); }
  function closeModal(){ modalWrap.classList.remove('open'); }

  // ------------ Init ------------
  function init(){
    buildSeg();
    buildPills();
    wireTabs(document);
    wireTabs(drawerTabs);
    initDials();
    drawWheel();
    buildSwatches();

    const savedTheme = localStorage.getItem(LS.theme);
    const startIndex = savedTheme ? themeFromId(savedTheme) : 0;
    setThemeByIndex(startIndex);

    const radius = parseInt(localStorage.getItem(LS.radius) || '18',10);
    const blur = parseInt(localStorage.getItem(LS.blur) || '18',10);
    slRadius.value = radius; vRadius.textContent = radius; document.documentElement.style.setProperty('--radius', radius+'px');
    slBlur.value = blur; vBlur.textContent = blur; document.documentElement.style.setProperty('--blur', blur+'px');

    const anim = localStorage.getItem(LS.anim);
    if (anim==='off'){ togAnim.checked=false; document.body.dataset.anim='off'; }
    const perf = localStorage.getItem(LS.perf);
    if (perf==='on'){ togPerf.checked=true; document.body.dataset.perf='on'; }

    syncAccentUI();
    setWheelMarkerFromHex(cssGet('--accent'));
    regenGraphs(false);
  }

  // ------------ Events ------------
  btnPrev.addEventListener('click', ()=>cycle(-1));
  btnNext.addEventListener('click', ()=>cycle(1));
  btnRand.addEventListener('click', ()=>setThemeByIndex(randInt(0, THEMES.length-1)));

  search.addEventListener('input', renderThemeList);
  btnClearSearch.addEventListener('click', ()=>{ search.value=''; renderThemeList(); });

  btnKiosk.addEventListener('click', ()=>{
    document.body.dataset.kiosk = document.body.dataset.kiosk==='on' ? 'off' : 'on';
  });
  btnModal.addEventListener('click', openModal);
  btnDrawer.addEventListener('click', openDrawer);
  scrim.addEventListener('click', closeDrawer);
  btnCloseDrawer.addEventListener('click', closeDrawer);
  btnCloseModal.addEventListener('click', closeModal);
  modalWrap.addEventListener('click', (e)=>{ if (e.target===modalWrap) closeModal(); });

  btnMenu.addEventListener('click', ()=> demoMenu.classList.toggle('open'));
  document.addEventListener('click', (e)=>{
    if (!demoMenu.contains(e.target) && e.target!==btnMenu) demoMenu.classList.remove('open');
  });

  demoMenu.addEventListener('click', (e)=>{
    const action = e.target?.dataset?.action;
    if (!action) return;
    if (action==='toast') toast('Menu', 'Hello from menu', 'ok');
    if (action==='regen') regenGraphs(true);
    if (action==='copycss') copyThemeCss();
    if (action==='perf') togglePerf();
    demoMenu.classList.remove('open');
  });

  togAnim.addEventListener('change', ()=>{
    document.body.dataset.anim = togAnim.checked ? 'on' : 'off';
    localStorage.setItem(LS.anim, togAnim.checked ? 'on' : 'off');
  });
  togPerf.addEventListener('change', ()=>{
    document.body.dataset.perf = togPerf.checked ? 'on' : 'off';
    localStorage.setItem(LS.perf, togPerf.checked ? 'on' : 'off');
  });

  slRadius.addEventListener('input', ()=>{
    const v = parseInt(slRadius.value,10); vRadius.textContent = v; document.documentElement.style.setProperty('--radius', v+'px');
    localStorage.setItem(LS.radius, v);
  });
  slBlur.addEventListener('input', ()=>{
    const v = parseInt(slBlur.value,10); vBlur.textContent = v; document.documentElement.style.setProperty('--blur', v+'px');
    localStorage.setItem(LS.blur, v);
  });

  btnToast.addEventListener('click', ()=>toast('Update', 'New theme tokens applied', 'ok'));

  btnProgress.addEventListener('click', ()=>{
    progress = clamp(progress + 10, 0, 100);
    progressFill.style.width = progress + '%';
    progressTxt.textContent = progress + '%';
  });

  btnRegenGraphs.addEventListener('click', ()=>regenGraphs(true));
  btnCopyCSS.addEventListener('click', copyThemeCss);
  btnCopyVars.addEventListener('click', copyTokenVars);
  btnResetAll.addEventListener('click', resetAll);

  btnCopyLog.addEventListener('click', ()=>{ navigator.clipboard.writeText(log.textContent || ''); toast('Log', 'Copied to clipboard', 'ok'); });
  btnAppendLog.addEventListener('click', ()=> logLine('Status ping ok'));

  btnDrawerToast.addEventListener('click', ()=>toast('Drawer', 'Quick action executed', 'ok'));
  btnDrawerRegen.addEventListener('click', ()=>regenGraphs(true));
  btnDrawerCopy.addEventListener('click', copyThemeCss);

  btnModalToast.addEventListener('click', ()=>toast('Modal', 'Preset action fired', 'ok'));
  btnModalRegen.addEventListener('click', ()=>regenGraphs(true));
  btnModalPerf.addEventListener('click', togglePerf);
  btnModalCopyBlock.addEventListener('click', copyThemeCss);

  btnSetAccent.addEventListener('click', ()=>{
    const rgb = hexToRgb(hexInput.value);
    if (!rgb) return toast('Accent', 'Invalid hex', 'warn');
    setAccent(rgbToHex(rgb.r,rgb.g,rgb.b));
  });

  btnApplyAccent2.addEventListener('click', ()=>{
    const rgb = hexToRgb(hexInput.value);
    if (!rgb) return toast('Accent', 'Invalid hex', 'warn');
    applyAccent2(rgbToHex(rgb.r,rgb.g,rgb.b));
  });
  btnResetAccent2.addEventListener('click', resetAccent2);

  wheel.addEventListener('pointerdown', (e)=>{
    const rect = wheel.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - rect.width/2;
    const dy = y - rect.height/2;
    const dist = Math.sqrt(dx*dx+dy*dy);
    if (dist > rect.width/2) return;
    const hue = (Math.atan2(dy,dx)*180/Math.PI + 360) % 360;
    const sat = dist/(rect.width/2);
    const rgb = hsvToRgb(hue, sat, 1);
    const hex = rgbToHex(rgb.r,rgb.g,rgb.b);
    setAccent(hex);
    wheelMarker.style.left = `${x}px`;
    wheelMarker.style.top = `${y}px`;
  });

  function copyThemeCss(){
    const t = THEMES[themeIndex];
    const acc2 = getAccent2Override(t.id) || t.vars['--accent2'];
    const lines = [':root{'];
    Object.entries({...t.vars, '--accent2': acc2}).forEach(([k,v])=>lines.push(`  ${k}:${v};`));
    lines.push('}');
    navigator.clipboard.writeText(lines.join('\n')).then(()=>toast('Theme', 'CSS copied', 'ok'));
  }

  function copyTokenVars(){
    const styles = getComputedStyle(document.documentElement);
    const keys = ['--bg','--panel','--panel2','--text','--muted','--accent','--accent2','--ok','--warn','--danger','--outline','--shadow','--radius','--radiusSoft','--blur','--font'];
    const lines = [':root{'];
    keys.forEach(k=>lines.push(`  ${k}:${styles.getPropertyValue(k).trim()};`));
    lines.push('}');
    navigator.clipboard.writeText(lines.join('\n')).then(()=>toast('Tokens', 'Copied vars', 'ok'));
  }

  function resetAll(){
    localStorage.removeItem(LS.theme);
    localStorage.removeItem(LS.radius);
    localStorage.removeItem(LS.blur);
    localStorage.removeItem(LS.anim);
    localStorage.removeItem(LS.perf);
    THEMES.forEach(t=> localStorage.removeItem(LS.accent2Prefix+t.id));
    location.reload();
  }

  function togglePerf(){
    const on = document.body.dataset.perf === 'on';
    document.body.dataset.perf = on ? 'off' : 'on';
    togPerf.checked = !on;
    localStorage.setItem(LS.perf, !on ? 'on' : 'off');
  }

  // clock + fps
  setInterval(()=>{
    const now = new Date();
    elClock.textContent = now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  }, 1000);

  function tick(){
    fpsCounter.frames++;
    const t = performance.now();
    if (t - fpsCounter.last > 1000){
      fpsCounter.fps = fpsCounter.frames; fpsCounter.frames = 0; fpsCounter.last = t;
      $('#stFps').textContent = fpsCounter.fps;
    }
    requestAnimationFrame(tick);
  }

  window.addEventListener('keydown', (e)=>{
    if (e.key==='[') cycle(-1);
    if (e.key===']') cycle(1);
    if (e.key==='f' || e.key==='F') document.body.dataset.kiosk = document.body.dataset.kiosk==='on' ? 'off' : 'on';
    if (e.key==='Escape') document.body.dataset.kiosk = 'off';
    if (e.key>='1' && e.key<='9'){
      const ids = filteredIds();
      const idx = parseInt(e.key,10)-1;
      if (ids[idx]) setThemeByIndex(themeFromId(ids[idx]));
    }
  });

  init();
  tick();
})();
