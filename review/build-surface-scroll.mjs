import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = '068ad226f53e1ca62d857f78bdc32f58f3c5fce7';
const upstream = (file) => execFileSync('git', ['show', `${base}:lib/${file}`], { cwd: root, encoding: 'utf8' });
const json = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');
export const runtime = {
  core: upstream('liquid-glass.js'),
  original: upstream('components.js'),
  candidate: readFileSync(new URL('../lib/components.js', import.meta.url), 'utf8'),
};
const candidateHash = createHash('sha256').update(runtime.candidate).digest('hex');
const evidence = process.env.EVIDENCE_DIR ? ['chromium', 'firefox', 'webkit'].flatMap(engine => {
  const file = `${process.env.EVIDENCE_DIR}/${engine}.json`;
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
}) : [];
if (evidence.some(row => row.candidateSha256 !== candidateHash)) throw new Error('Evidence belongs to a different candidate');
const phone = evidence.find(row => row.engine === 'chromium' && row.width === 390);
const phoneSummary = phone ? `Latest Chrome phone cross-comparison: ${phone.shots.map(s => s.originalCandidate.pixels).join(' / ')} pixels; Original repeat: ${phone.shots.map(s => s.originalRepeat.pixels).join(' / ')}; Candidate repeat: ${phone.shots.map(s => s.candidateRepeat.pixels).join(' / ')}, out of ${phone.shots[0].originalCandidate.totalPixels.toLocaleString('en-US')} pixels. Cross / Original-repeat / Candidate-repeat maximum channel deltas: ${['originalCandidate','originalRepeat','candidateRepeat'].map(k => Math.max(...phone.shots.map(s => s[k].maxChannelDelta))).join(' / ')}. Phone Chrome is not claimed to be pixel-exact. The retained pixel-outliers.json case shows one bare nested-gradient pixel at physical (568, 1158) flipping between its two pure fill colors, reaching 165; the same pixel also flips in Original and Candidate self-repeats. Most remaining channel differences are 1. Rows with zero changed pixels are exact for those captured states.` : '';
const evidenceTable = evidence.length ? `<section><h2>Recorded browser validation</h2><table><thead><tr><th>Engine / viewport / DPR</th><th>Geometry reads</th><th>Pixels changed · rest / moving / pressed</th></tr></thead><tbody>${evidence.map(row => `<tr><td>${row.engine === 'webkit' ? 'System WKWebView' : `${row.engine} ${row.runtime}`} · ${row.width} × ${row.height} · ${row.dpr || '2 native'}${row.motion === 'reduce' ? ' · reduced motion' : ''}</td><td>${row.counts[0].reads} → ${row.counts[1].reads}</td><td>${row.shots.map(s => s.originalCandidate.pixels).join(' / ')}</td></tr>`).join('')}</tbody></table><p>Chrome 156 / Blink and Firefox 157 / Gecko use the same 35-position replay. Native macOS WebKit uses a shorter 7-position replay because its large-scene frames were slow. Small pages: 532 → 198 reads on desktop, 532 → 205 on phone. Static and unrelated-scroll checks: zero candidate reads.</p><p>${phoneSummary}</p><details><summary>Behavior checked and evidence details</summary><p>Chrome and Gecko: same-frame scroll jump entry, nested and source-only scroll, transform followed by scroll, offscreen deformation/resume, display:none/show, host and viewport resize, real image load and 110px layout shift, same-image listener detach, reconnect, rapid press/cancel, pending-frame destruction, small pages and idle. Native WebKit: short replay, entry, nested/source-only movement, real layout-shift load and shared-source detach, rest/moving/pressed states. Native DPR 2 and the system motion setting were used; motion emulation and fractional DPR were checked in Chrome/Gecko.</p><p>Original code: <code>${base}</code>. Candidate components SHA-256: <code>${candidateHash}</code>. Repeated captures use fresh documents at the same physical viewport, DPR and fixed state. No clock-dependent fixture content or external images are used. Raw PNGs, JSON and native logs are in <code>/tmp/liquidglass-surface-scroll</code>; the earlier gradient-fixture run is preserved separately.</p><p>Firefox reproduction uses the isolated temporary launcher from <code>FIREFOX_EXECUTABLE</code> with the standard Firefox 157 UA and asserts <code>engine === 'gecko'</code>. Branding only avoids macOS app-data access during startup; production engine detection is unchanged.</p><p>Reproduce: <code>node review/build-surface-scroll.mjs</code>, then <code>PLAYWRIGHT_MODULE=/private/tmp/liquidglass-validation/node_modules/playwright/index.mjs node tests/surface-scroll.mjs chromium</code>. Use <code>firefox</code> with <code>FIREFOX_EXECUTABLE=/private/tmp/liquidglass-validation/firefox-isolated</code>. Native WebKit: compile <code>review/snap-surface-scroll.swift</code>, serve this checkout on port 4383 and run the same test with <code>webkit</code> and <code>SNAP_WEBKIT</code> pointing to that binary. Set <code>EVIDENCE_DIR</code> when rebuilding to embed a fresh matching report.</p></details></section>` : '';

export function fixture(core, components, count) {
  const wallpaper = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960"><rect width="720" height="960" fill="#183e56"/><path d="M0 0H340L720 380V700L0 90Z" fill="#b75b45"/><path d="M0 460L720 110V300L0 660Z" fill="#327d8b"/><path d="M0 780L720 430V620L0 960Z" fill="#dbb778"/><path d="M60 0V960M180 0V960M300 0V960M420 0V960M540 0V960M660 0V960M0 60H720M0 180H720M0 300H720M0 420H720M0 540H720M0 660H720M0 780H720M0 900H720" stroke="#fff" stroke-opacity=".4" fill="none"/></svg>');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><style>
*{box-sizing:border-box}html{scroll-behavior:auto}body{margin:0;font:15px system-ui;color:white;background:#17364b}
#scene{position:relative;height:${1100 + count * 180}px;overflow:clip}.wallpaper{position:absolute;inset:0;background:#183e56 url("data:image/svg+xml,${wallpaper}") repeat;background-size:720px 960px}
lg-panel{padding:20px;width:220px;height:94px}lg-panel b{display:block;font-size:19px;margin-bottom:4px}.item{position:absolute;left:28px}
#fixed{position:fixed;right:20px;top:20px;width:180px;z-index:4}#sticky-wrap{position:absolute;left:260px;top:170px;height:1500px;width:190px}#sticky{position:sticky;top:120px;width:180px}
#press{position:absolute;top:300px;left:28px}#nested{position:absolute;left:28px;top:420px;width:300px;height:180px;overflow:auto;border:1px solid #fff6}#nested-content{position:relative;height:900px}#nested-source{position:absolute;inset:0;background:repeating-linear-gradient(30deg,#732b6e 0 35px,#f5d09d 35px 70px)}#inside{position:absolute;top:80px;left:20px;width:210px}
#unrelated{position:absolute;top:640px;left:28px;width:100px;height:70px;overflow:auto;background:#fff3}#unrelated>div{height:600px}#source-scroller{position:absolute;top:430px;right:20px;width:90px;height:160px;overflow:auto}#moving-source{width:90px;height:800px;background:repeating-linear-gradient(#e65d43 0 40px,#f8e0ac 40px 80px)}#remote{position:absolute;top:300px;right:20px;width:180px}#plain{position:absolute;top:650px;right:20px;width:180px}
@media(max-width:500px){#sticky-wrap{left:185px;width:170px}#sticky{width:165px}#fixed{width:155px;right:15px}#remote{top:735px;right:15px;width:160px}#plain{top:930px;right:15px;width:160px}#source-scroller{top:735px;left:20px}#press{top:300px}}
</style><div id="scene" data-lg-backdrop=".wallpaper"><div id="wallpaper" class="wallpaper"></div>
<lg-panel id="flow" class="item" style="top:28px"><b>Same motion</b>Document backdrop</lg-panel>
<lg-panel id="fixed" backdrop="#wallpaper"><b>Fixed</b>Independent motion</lg-panel>
<div id="sticky-wrap"><lg-panel id="sticky" backdrop="#wallpaper"><b>Sticky</b>Crosses its threshold</lg-panel></div>
<lg-button id="press">Press and scroll</lg-button>
<div id="nested"><div id="nested-content"><div id="nested-source"></div><lg-panel id="inside" backdrop="#nested-source"><b>Nested</b>Local scrolling</lg-panel></div></div>
<div id="unrelated"><div>Unrelated scroll</div></div>
<div id="source-scroller"><div id="moving-source"></div></div><lg-panel id="remote" backdrop="#moving-source"><b>Remote source</b>Source scrolls alone</lg-panel>
<lg-panel id="plain" backdrop="none"><b>No source</b>Native backdrop / blur</lg-panel>
${Array.from({ length: count }, (_, i) => `<lg-panel class="item sparse" id="sparse-${i}" style="top:${1100 + i * 180}px"><b>Surface ${i + 1}</b>Same backdrop fixture</lg-panel>`).join('')}
</div><script type="module">
const core = URL.createObjectURL(new Blob([${json(core)}],{type:'text/javascript'}));
const componentCode = ${json(components)}.replaceAll("'./liquid-glass.js'",JSON.stringify(core));
const componentURL = URL.createObjectURL(new Blob([componentCode],{type:'text/javascript'}));
const runtime = await import(componentURL);
URL.revokeObjectURL(componentURL); URL.revokeObjectURL(core);
const metrics = {enabled:false,updates:0,aligns:0,offsets:0,rects:0};
for(const name of ['offsetWidth','offsetHeight']){
  const d=Object.getOwnPropertyDescriptor(HTMLElement.prototype,name);
  Object.defineProperty(HTMLElement.prototype,name,{...d,get(){if(metrics.enabled)metrics.offsets++;return d.get.call(this)}});
}
const rect=Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect=function(){if(metrics.enabled)metrics.rects++;return rect.call(this)};
const watch=(element)=>{
  const surface=element.surface;
  for(const method of ['update','align']){
    const original=surface[method];
    surface[method]=function(...args){if(metrics.enabled)metrics[method==='update'?'updates':'aligns']++;return original.apply(this,args)};
  }
};
document.querySelectorAll('lg-panel,lg-button').forEach(watch);
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const frames=async(n=3)=>{while(n-->0)await frame()};
window.fixture={
  engine:runtime.engine,metrics,frames,
  measure(on=true){Object.assign(metrics,{enabled:on,updates:0,aligns:0,offsets:0,rects:0})},
  sample(){metrics.enabled=false;return {...metrics,reads:metrics.offsets+metrics.rects}},
  scroll(y){scrollTo(0,y)},
  nested(y){document.querySelector('#nested').scrollTop=y},
  unrelated(y){document.querySelector('#unrelated').scrollTop=y},
  source(y){document.querySelector('#source-scroller').scrollTop=y},
  state(p=0){document.querySelector('#press').surface.setDelta({x:-5*p,y:2*p,w:10*p,h:-4*p})},
  geometry(visibleOnly=false){
    return [...document.querySelectorAll('lg-panel,lg-button')].filter(n=>n.surface?.mode==='copy').flatMap(n=>{
      const s=n.surface,lr=s.layer.getBoundingClientRect(),sr=s.source.getBoundingClientRect();
      if(visibleOnly&&(lr.bottom<0||lr.top>innerHeight||lr.right<0||lr.left>innerWidth))return [];
      const matrix=new DOMMatrix(getComputedStyle(s.copy).transform);
      return [{id:n.id,dx:matrix.m41-(sr.left-lr.left),dy:matrix.m42-(sr.top-lr.top),dw:parseFloat(s.copy.style.width)-sr.width,dh:parseFloat(s.copy.style.height)-sr.height,key:s.lastKey}];
    });
  },
  async image(){
    const image=document.createElement('img'); image.id='late-source';image.style.cssText='position:absolute;top:5px;left:5px';
    image.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="110"><rect width="240" height="110" fill="#d07842"/><circle cx="120" cy="55" r="40" fill="#213c68"/></svg>');
    document.querySelector('#scene').append(image);
    const panel=document.createElement('lg-panel');panel.id='late';panel.setAttribute('backdrop','#late-source');panel.style.cssText='position:fixed;left:20px;top:200px;width:170px;height:80px';panel.textContent='Delayed image';document.querySelector('#scene').append(panel);watch(panel);
    await image.decode();await frames();return this.geometry().find(g=>g.id==='late');
  },
  async layoutShiftImage(){
    const image=document.createElement('img');image.id='flow-image';image.style.display='block';
    document.body.prepend(image);
    const sourceTop=document.querySelector('#wallpaper').getBoundingClientRect().top;
    image.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="110"><rect width="240" height="110" fill="#b26b48"/></svg>');
    const panel=document.createElement('lg-panel');panel.id='flow-image-panel';panel.setAttribute('backdrop','#flow-image');panel.style.cssText='position:fixed;left:20px;top:220px;width:170px;height:80px';panel.textContent='Image in document flow';document.querySelector('#scene').append(panel);watch(panel);
    const detached=panel.cloneNode(false);detached.id='detached-image-panel';document.querySelector('#scene').append(detached);detached.remove();
    await image.decode();await frames(4);
    return {shift:document.querySelector('#wallpaper').getBoundingClientRect().top-sourceTop,geometry:this.geometry(true)};
  }
};
await frames(6);window.fixtureReady=true;
</script></html>`;
}

const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Surface scroll · Original / Candidate</title><style>
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui;color:var(--foreground,#172936)}main{max-width:1400px;margin:auto;padding:20px 0}h1{font-size:25px;margin:0 0 8px}p{margin:8px 0}button,select{font:inherit;padding:7px 11px;border:1px solid #8198a4;border-radius:7px;background:var(--card,#fff);color:inherit;cursor:pointer}button:focus-visible,select:focus-visible{outline:3px solid #1186db;outline-offset:2px}.controls{display:flex;gap:8px;flex-wrap:wrap;margin:15px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}.pane{min-width:0}.viewport{overflow:hidden;background:#17364b;position:relative;border-radius:10px}iframe{display:block;border:0;transform-origin:top left}h2{font-size:15px;margin:0 0 7px}.pair.overlay{display:block;position:relative}.overlay .pane:nth-child(2){position:absolute;inset:0}.overlay .pane:nth-child(2) iframe{opacity:.5}.pair.difference .pane:nth-child(2){mix-blend-mode:difference}.pair.difference .pane:nth-child(2) iframe{opacity:1}.notes{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:18px 0}table{border-collapse:collapse;width:100%}th,td{padding:6px 8px;text-align:left;border-bottom:1px solid #8198a444;font-variant-numeric:tabular-nums}.status{min-height:24px}.muted{color:var(--muted-foreground,#526775)}code{font-size:12px}details{margin:15px 0}summary{cursor:pointer;font-weight:600}@media(max-width:600px){main{padding:12px 0}.notes{display:block}.pair{gap:8px}}
</style><main><h1>Surface scroll</h1><p>Same engine, backdrop, viewport and actions. The candidate reduces Surface work during captured scroll events.</p>
<div class="controls"><select id="viewport" aria-label="Scenario viewport"><option value="1280,800">Desktop · 1280 × 800</option><option value="390,844">Phone · 390 × 844</option></select><select id="count" aria-label="Page size"><option value="240">Sparse page · 240 extra surfaces</option><option value="3">Small page · 3 extra surfaces</option></select><button id="replay">Synchronized scroll replay</button><button data-state="0">At rest</button><button data-state="0.5">Moving · p=0.5</button><button data-state="1">Pressed · p=1</button><button id="nested">Nested scroll</button><button id="source">Source only</button><button id="reset">Reset</button><select id="view" aria-label="Comparison mode"><option value="">Side by side</option><option value="overlay">50% overlay</option><option value="overlay difference">Difference blend</option></select></div>
<p class="status" id="status" role="status">Loading the original and candidate…</p><div class="pair" id="pair"><section class="pane"><h2>Original <code>068ad22</code></h2><div class="viewport"><iframe title="Original 068ad22"></iframe></div></section><section class="pane"><h2>Candidate</h2><div class="viewport"><iframe title="Candidate"></iframe></div></section></div>
<div class="notes"><section><h2>Live operation counts</h2><table><thead><tr><th>During replay</th><th>Original</th><th>Candidate</th></tr></thead><tbody id="counts"><tr><td colspan="3">Run synchronized replay</td></tr></tbody></table><p class="muted">Counts instrument actual Surface methods and geometry APIs. They are neither elapsed timings nor CPU percentages. Both panes run in the same engine at this page’s DPR.</p></section><section><h2>What to inspect</h2><p>Scroll the document and watch the fixed and sticky panels over the grid. Replay also crosses into surfaces that started offscreen. “Source only” moves a backdrop independently; “Nested scroll” moves a local scene. Pressed and moving controls set identical deterministic body deformation in both runtimes.</p><p class="muted">Difference blend highlights deviations; recorded capture limits are below. Live pointer input can be tested independently inside each pane. The deterministic buttons apply the same state to both.</p></section></div>
${evidenceTable}<details><summary>Implementation and limits</summary><p>The scroll path checks current layer bounds in its own animation frame, so it does not wait for IntersectionObserver to notice entry. It skips unrelated nested scrolls, source reads for offscreen layers and size reads already handled by ResizeObserver. Resize, image-load layout shifts and animated deformation still update normally. It still scans the Surface set and reads one rectangle per affected copy layer.</p><p>Desktop and phone viewports here are CSS sizes, not a physical iPhone. Rendering differs across engines; compare Original and Candidate within the same engine. The existing core requirement for ResizeObserver is unchanged; IntersectionObserver is not needed. Browser-tab suspension/resume and physical touch devices were not tested. No browser workaround or engine code is removed.</p><p>Rebuild from the unchanged base and working tree: <code>node review/build-surface-scroll.mjs</code>. The file embeds both real runtimes and uses no network resources or build step when opened. These checks cover the listed cases, not every possible layout.</p></details></main><script>
const runtime=${json(runtime)};
const json=${json.toString()};
const scenario=${fixture.toString().replaceAll('</script', '<\\/script')};
const frames=[...document.querySelectorAll('iframe')];
let ready,working=false;
function fit(){const [w,h]=document.querySelector('#viewport').value.split(',').map(Number);for(const frame of frames){const box=frame.parentElement,scale=box.clientWidth/w;frame.style.width=w+'px';frame.style.height=h+'px';frame.style.transform='scale('+scale+')';box.style.height=(h*scale)+'px'}}
async function load(){window.reviewReady=false;document.querySelector('#status').textContent='Loading identical scenarios…';const count=+document.querySelector('#count').value;await Promise.all(frames.map((frame,i)=>new Promise(resolve=>{frame.onload=resolve;frame.srcdoc=scenario(runtime.core,i?runtime.candidate:runtime.original,count)})));fit();await Promise.all(frames.map(frame=>new Promise((resolve,reject)=>{const start=performance.now();const check=()=>frame.contentWindow?.fixtureReady?resolve():performance.now()-start>20000?reject(new Error('Scenario did not initialize within 20 seconds')):setTimeout(check,40);check()})));await Promise.all(frames.map(f=>f.contentWindow.fixture.frames(8)));document.querySelector('#status').textContent=frames[0].contentWindow.fixture.engine+' · DPR '+devicePixelRatio+' · ready';window.reviewReady=true;}
const fixtures=()=>frames.map(f=>f.contentWindow.fixture);
const settle=()=>Promise.all(fixtures().map(f=>f.frames(3)));
async function action(fn){await ready;if(working)return;working=true;try{await fn();}finally{working=false}}
window.review={frames,fixtures,settle,load:()=>ready=load(),async replay(){await ready;fixtures().forEach(f=>f.measure());for(const y of [0,20,60,120,180,260,400,600,900,1100,1450,1800,2300,2800,3400,4100,4700,5400,6000,5400,4700,4100,3400,2800,2300,1800,1450,1100,900,600,400,260,120,60,0]){fixtures().forEach(f=>f.scroll(y));await settle()}const counts=fixtures().map(f=>f.sample());document.querySelector('#counts').innerHTML=['updates','aligns','offsets','rects','reads'].map(key=>'<tr><td>'+key+'</td><td>'+counts[0][key]+'</td><td>'+counts[1][key]+'</td></tr>').join('');document.querySelector('#status').textContent='Replay settled · geometry reads '+counts[0].reads+' → '+counts[1].reads;return counts}};
document.querySelector('#viewport').onchange=()=>ready=load();document.querySelector('#count').onchange=()=>ready=load();document.querySelector('#view').onchange=e=>{document.querySelector('#pair').className='pair '+e.target.value;fit()};
document.querySelector('#replay').onclick=()=>action(()=>review.replay());document.querySelectorAll('[data-state]').forEach(button=>button.onclick=()=>action(async()=>{fixtures().forEach(f=>f.state(+button.dataset.state));await settle()}));
document.querySelector('#nested').onclick=()=>action(async()=>{fixtures().forEach(f=>f.nested(130));await settle()});document.querySelector('#source').onclick=()=>action(async()=>{fixtures().forEach(f=>f.source(137));await settle()});document.querySelector('#reset').onclick=()=>action(async()=>{fixtures().forEach(f=>{f.scroll(0);f.nested(0);f.source(0);f.state(0)});await settle()});
new ResizeObserver(fit).observe(document.querySelector('#pair'));ready=load();
</script></html>`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('./surface-scroll.html', import.meta.url), html);
  console.log(`Wrote review/surface-scroll.html (${Buffer.byteLength(html)} bytes; original ${base})`);
}
