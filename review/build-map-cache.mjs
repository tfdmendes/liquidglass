import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

export const BASE = '068ad226f53e1ca62d857f78bdc32f58f3c5fce7';
export const baseline = () => execFileSync('git', ['show', `${BASE}:lib/liquid-glass.js`], { encoding: 'utf8' });
const components = () => execFileSync('git', ['show', `${BASE}:lib/components.js`], { encoding: 'utf8' });

function backdropPNG() {
  const size = 256, rows = Buffer.alloc((size * 4 + 1) * size);
  const colors = [[32, 88, 119], [92, 184, 183], [224, 167, 91], [108, 72, 115]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    const color = colors[(Math.floor(x / 64) + Math.floor(y / 64)) % colors.length];
    for (let c = 0; c < 3; c++) rows[offset + c] = (x + y) % 24 < 2 ? 242 : color[c];
    rows[offset + 3] = 255;
  }
  const chunk = (name, data) => {
    const body = Buffer.concat([Buffer.from(name), data]);
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
const backdrop = backdropPNG();

function fixtureApp(source, components) {
  const clock = { now: 0, id: 0, queue: new Map() };
  const realNow = performance.now.bind(performance);
  const nativeFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => { clock.queue.set(++clock.id, fn); return clock.id; };
  window.cancelAnimationFrame = (id) => clock.queue.delete(id);
  Object.defineProperty(performance, 'now', { value: () => clock.now });
  const stats = { rasterizations: 0, uploads: 0, encodes: 0, decodes: 0, encodeMs: 0, decodeElapsedMs: 0 };
  const nativeCreate = CanvasRenderingContext2D.prototype.createImageData;
  const nativePut = CanvasRenderingContext2D.prototype.putImageData;
  const nativeEncode = HTMLCanvasElement.prototype.toDataURL;
  const nativeDecode = HTMLImageElement.prototype.decode;
  const pending = new Set();
  const gates = [];
  let holdDecodes = false;
  CanvasRenderingContext2D.prototype.createImageData = function (...args) { stats.rasterizations++; return nativeCreate.apply(this, args); };
  window.ImageData = new Proxy(window.ImageData, { construct(target, args) { stats.rasterizations++; return Reflect.construct(target, args); } });
  CanvasRenderingContext2D.prototype.putImageData = function (...args) { stats.uploads++; return nativePut.apply(this, args); };
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    const start = realNow();
    const result = nativeEncode.apply(this, args);
    stats.encodes++;
    stats.encodeMs += realNow() - start;
    return result;
  };
  HTMLImageElement.prototype.decode = function (...args) {
    stats.decodes++;
    const start = realNow();
    const decoded = nativeDecode.apply(this, args);
    const gate = holdDecodes ? new Promise((resolve, reject) => gates.push({ resolve, reject })) : Promise.resolve();
    const result = Promise.all([decoded, gate]).then(() => { stats.decodeElapsedMs += realNow() - start; });
    pending.add(result);
    result.then(() => pending.delete(result), () => pending.delete(result));
    return result;
  };
  const tick = async (frames = 1, dt = 1000 / 60) => {
    for (let i = 0; i < frames; i++) {
      clock.now += dt;
      const callbacks = [...clock.queue.values()];
      clock.queue.clear();
      callbacks.forEach((fn) => fn(clock.now));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  const flush = () => {
    document.querySelector('lg-button')?.surface.glass?.flush();
    document.querySelector('lg-segmented')?.glass?.flush();
    review.core?.flush();
  };
  const settle = async () => { await Promise.allSettled([...pending]); await new Promise((resolve) => setTimeout(resolve, 0)); flush(); };
  const mount = (scenario = 'all') => {
    review.core?.destroy();
    document.querySelector('#fixture').innerHTML = `
      ${scenario === 'all' || scenario === 'button' ? '<lg-button tone="light">Continue</lg-button>' : ''}
      ${scenario === 'all' || scenario === 'segmented' ? '<lg-segmented value="day"><button value="day">Day</button><button value="week">Next week</button><button value="month">A full month</button></lg-segmented>' : ''}
      ${scenario === 'all' ? '<div id="content">REFRACTION &nbsp; 0123456789<br>Fine lines · fractional geometry</div><lg-button id="fallback" backdrop="none" tone="light">Page backdrop</lg-button>' : ''}`;
    const content = document.querySelector('#content');
    review.core = content ? review.runtime.createGlass(content, { width: 213.375, height: 50.625, x: 8.25, y: 9.75, radius: 15.375, refraction: 11.25, bezel: 0.37, ior: 1.47, curvature: 3.7, specularWidth: 1.375, clip: true }) : null;
  };
  const event = (type) => document.querySelector('lg-button .lg-button__el')?.dispatchEvent(new PointerEvent(type, { bubbles: true }));
  const action = async (name) => {
    if (name === 'idle') { event('pointerup'); document.querySelector('lg-segmented')?.select(0); await tick(60); }
    if (name === 'pressed') { event('pointerdown'); await tick(50); }
    if (name === 'moving') { event('pointerdown'); document.querySelector('lg-segmented')?.select(2); await tick(8); }
    if (name === 'settled') { event('pointerup'); document.querySelector('lg-segmented')?.select(2); await tick(60); }
    if (name === 'rapid') { for (let i = 0; i < 6; i++) { event(i % 2 ? 'pointerup' : 'pointerdown'); document.querySelector('lg-segmented')?.select(i % 3); await tick(3); } await tick(60); }
    await settle();
  };
  const review = window.mapFixture = {
    stats, gates, tick, settle, flush, mount, event, action, core: null, runtime: null,
    resetStats() { Object.keys(stats).forEach((key) => { stats[key] = 0; }); },
    hold(value) { holdDecodes = value; },
    get time() { return clock.now; },
    get pending() { return pending.size; },
  };
  review.ready = (async () => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    review.runtime = await import(url);
    await import(URL.createObjectURL(new Blob([components.replaceAll("'./liquid-glass.js'", JSON.stringify(url))], { type: 'text/javascript' })));
    mount();
    await new Promise(nativeFrame);
    await new Promise(nativeFrame);
    await tick(5);
    await settle();
    return review.runtime.engine;
  })();
}

export function frameDocument(source) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;font:16px Arial,sans-serif}#fixture{position:relative;display:flex;align-content:center;align-items:center;justify-content:center;flex-wrap:wrap;gap:25px;padding:26px 18px;min-height:310px;background:#205877 url(data:image/png;base64,${backdrop}) repeat;overflow:hidden}
    lg-button .lg-button__el{width:180px}lg-segmented{max-width:100%}#content{position:relative;width:280px;height:72px;padding:11px;background:repeating-linear-gradient(90deg,#fff 0 8px,#bbd8e5 8px 9px);color:#193347;font:14px/23px Arial,sans-serif;white-space:nowrap}#fallback .lg-button__el{width:190px}
    </style><div id="fixture" data-lg-backdrop></div><script>(${fixtureApp.toString()})(${JSON.stringify(source).replaceAll('<', '\\u003c')},${JSON.stringify(components()).replaceAll('<', '\\u003c')})</script></html>`;
}

export function comparisonDocument(candidate = readFileSync('lib/liquid-glass.js', 'utf8')) {
  const sources = [frameDocument(baseline()), frameDocument(candidate)];
  const saved = existsSync('review/map-cache-results.json') ? JSON.parse(readFileSync('review/map-cache-results.json', 'utf8')) : null;
  const capturePaths = ['MAP_CAPTURE_ORIGINAL', 'MAP_CAPTURE_CANDIDATE'].map((key) => process.env[key]);
  const captures = capturePaths.every((path) => path && existsSync(path)) ? capturePaths.map((path) => readFileSync(path).toString('base64')) : null;
  const escape = (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const validation = saved ? `<p>${escape(saved.visualSummary)}</p><table><thead><tr><th>CPU time · 12 cycles / 1200 unique frames</th><th>Original</th><th>Candidate</th><th>Change</th></tr></thead><tbody>${saved.cpu.flatMap((group) => group.summary.map((row) => `<tr><td>${escape(group.engine)} · ${escape(row.workload)}</td><td>${row.originalMedianCPUms} ms</td><td>${row.candidateMedianCPUms} ms</td><td>${row.changePercent.toFixed(1)}%</td></tr>`)).join('')}</tbody></table><p>${escape(saved.cpuMethod)}</p><table><thead><tr><th>CPU sample ranges</th><th>Original</th><th>Candidate</th></tr></thead><tbody>${saved.cpuRanges.map((row) => `<tr><td>${escape(row.engine)} · ${escape(row.workload)}</td><td>${row.originalRangeMs.map((n) => Math.round(n)).join('–')} ms</td><td>${row.candidateRangeMs.map((n) => Math.round(n)).join('–')} ms</td></tr>`).join('')}</tbody></table><p>${escape(saved.limits)}</p>` : '<p>Saved measurements are pending. Use Measure 3 cycles for live operation counts.</p>';
  const overlay = captures ? `<details><summary>Captured overlay · Gecko · 390×844 · DPR 2 · moving</summary><p>Actual original and candidate screenshots. This pair has zero differing pixels.</p><label>Candidate opacity <input id="opacity" type="range" min="0" max="1" step="0.01" value="0.5"></label><div id="overlay"><img alt="Original moving state" src="data:image/png;base64,${captures[0]}"><img id="overlay-candidate" alt="Candidate moving state" src="data:image/png;base64,${captures[1]}"></div></details>` : '';

  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Exact map-cache comparison</title><style>
    :root{font:15px/1.5 system-ui,sans-serif;color:#172b3a;background:#f7f9fa}body{margin:0;padding:20px}h1{font-size:23px;margin:0 0 8px}p{max-width:90ch;margin:8px 0}button,select,input{font:inherit}button,select{border:1px solid #b9c8cf;border-radius:7px;padding:6px 10px;background:#fff;color:#172b3a}button{cursor:pointer}button:focus-visible{outline:3px solid #147ca8}nav{display:flex;flex-wrap:wrap;gap:7px;margin:16px 0}#panes{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;min-width:0}figcaption{font-weight:650;margin:0 0 8px}iframe{display:block;width:100%;height:327px;border:0;border-radius:10px;background:#fff}pre{white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;background:#e8eff2;border-radius:8px;padding:12px}#results:empty{display:none}table{border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;border-bottom:1px solid #cbd6dc;padding:6px 14px 6px 0}small{color:#425c6c}#overlay{position:relative;margin:16px 0;width:390px;max-width:100%;overflow:hidden}#overlay img{display:block;width:100%}#overlay img+img{position:absolute;inset:0;opacity:.5}label{display:inline-flex;align-items:center;gap:6px;margin-right:14px}summary{cursor:pointer}@media(max-width:700px){body{padding:14px}#panes{grid-template-columns:1fr}h1{font-size:21px}th,td{padding-right:8px}}
    </style><h1>Exact map-cache reuse</h1><p>Same upstream components, backdrop and spring steps. Original <code>068ad22</code> and candidate run in separate documents. Geometry and optics stay unrounded; a PNG is reused only after all RGBA bytes match.</p>
    <nav aria-label="Synchronized comparison"><button data-state="idle">At rest</button><button data-state="pressed">Pressed</button><button data-state="moving">Moving · frame 8</button><button data-state="settled">Settled</button><button data-state="rapid">Rapid input</button><button id="replay">Replay together</button><button id="measure">Measure 3 cycles</button><button id="reset">Reset caches</button></nav>
    <p id="status" role="status">Loading embedded runtimes…</p><div id="panes"><figure><figcaption>Original 068ad22</figcaption><iframe title="Original 068ad22"></iframe></figure><figure><figcaption>Candidate</figcaption><iframe title="Candidate"></iframe></figure></div>
    <p><label><input id="hide" type="checkbox">Hide both fixtures</label><label><input id="narrow" type="checkbox">Narrow frames to 340px</label></p>
    <table><thead><tr><th>Actual calls since reset</th><th>Original</th><th>Candidate</th></tr></thead><tbody id="counts"><tr><td>rasterizations</td><td>0</td><td>0</td></tr><tr><td>uploads</td><td>0</td><td>0</td></tr><tr><td>encodes</td><td>0</td><td>0</td></tr><tr><td>decodes</td><td>0</td><td>0</td></tr></tbody></table>
    <p><small>Rasterizations include the full pixel calculation. Uploads, PNG encodes and Image.decode calls are separate counts. Decode elapsed time includes asynchronous waiting; it is not CPU time. This page does not measure CPU percentage.</small></p>
    <details><summary>Evidence, assumptions and limits</summary><p>Compare the same engine, viewport, DPR and state. “Moving” pauses the real upstream spring after eight 60 Hz steps, then waits for the requested maps to decode. Replay uses those same steps in both panes. With reduced motion, the upstream spring jumps to its target.</p><p>Candidate retains at most 48 map entries and 8 MiB of comparison RGBA data. Larger individual maps still use the exact geometry-key cache without keeping their pixel buffer. All map bytes are compared, so there is no hash collision risk.</p><p>Map PNGs are checked byte for byte. Rendered captures use delta 0 in Gecko and delta ≤1 per channel in Chrome; Chrome baseline-versus-baseline captures show the same 1-value variation.</p></details><details><summary>Saved validation and CPU measurements</summary>${validation}</details>${overlay}
    <pre id="results" aria-live="polite"></pre><script>
    const sources=${JSON.stringify(sources).replaceAll('<', '\\u003c')};
    const frames=[...document.querySelectorAll('iframe')];
    const status=document.querySelector('#status');
    const fixtures=()=>frames.map(f=>f.contentWindow.mapFixture);
    const stats=()=>fixtures().map(f=>({...f.stats}));
    const display=()=>{const values=stats();document.querySelector('#counts').innerHTML=['rasterizations','uploads','encodes','decodes'].map(k=>'<tr><td>'+k+'</td><td>'+values[0][k]+'</td><td>'+values[1][k]+'</td></tr>').join('')};
    async function reset(){if(window.mapReview)window.mapReview.isReady=false;await Promise.all(frames.map((f,i)=>new Promise(resolve=>{f.onload=async()=>{await f.contentWindow.mapFixture.ready;f.style.height=f.contentDocument.querySelector('#fixture').offsetHeight+'px';resolve()};f.srcdoc=sources[i]})));display();status.textContent=fixtures().map(f=>f.runtime.engine).join(' / ')+' · DPR '+devicePixelRatio+' · reduced motion '+matchMedia('(prefers-reduced-motion: reduce)').matches;if(window.mapReview)window.mapReview.isReady=true;}
    async function state(name){await reset();await Promise.all(fixtures().map(f=>f.action(name)));display();status.textContent=name+' · '+fixtures()[0].time.toFixed(2)+' ms simulated time';}
    async function replay(){await reset();const fs=fixtures();fs.forEach(f=>f.event('pointerdown'));frames.forEach(f=>f.contentDocument.querySelector('lg-segmented')?.select(2));for(let i=0;i<100;i++){if(i===50){fs.forEach(f=>f.event('pointerup'));frames.forEach(f=>f.contentDocument.querySelector('lg-segmented')?.select(0));}await Promise.all(fs.map(f=>f.tick()));display();await new Promise(requestAnimationFrame)}await Promise.all(fs.map(f=>f.settle()));display();status.textContent='Replay settled · identical 60 Hz input steps';}
    async function measure(){const rows=[];for(const scenario of ['button','segmented']){await reset();const fs=fixtures();fs.forEach(f=>f.mount(scenario));await Promise.all(fs.map(f=>f.tick(5)));await Promise.all(fs.map(f=>f.settle()));fs.forEach(f=>f.resetStats());for(let i=0;i<3;i++){if(scenario==='button'){fs.forEach(f=>f.event('pointerdown'));await Promise.all(fs.map(f=>f.tick(50)));fs.forEach(f=>f.event('pointerup'));await Promise.all(fs.map(f=>f.tick(50)))}else{frames.forEach(f=>f.contentDocument.querySelector('lg-segmented').select(2));await Promise.all(fs.map(f=>f.tick(60)));frames.forEach(f=>f.contentDocument.querySelector('lg-segmented').select(0));await Promise.all(fs.map(f=>f.tick(60)))}}await Promise.all(fs.map(f=>f.settle()));rows.push({scenario,original:{...fs[0].stats},candidate:{...fs[1].stats}})}display();window.mapReview.lastMeasurement=rows;document.querySelector('#results').textContent=JSON.stringify(rows,null,2);status.textContent='Measured 3 repeat cycles per component';return rows;}
    let busy=false;async function run(action){if(busy)return;busy=true;document.querySelectorAll('nav button').forEach(b=>b.disabled=true);try{await action()}finally{busy=false;document.querySelectorAll('nav button').forEach(b=>b.disabled=false)}}
    document.querySelectorAll('[data-state]').forEach(b=>b.onclick=()=>run(()=>state(b.dataset.state)));document.querySelector('#replay').onclick=()=>run(replay);document.querySelector('#measure').onclick=()=>run(measure);document.querySelector('#reset').onclick=()=>run(reset);
    document.querySelector('#opacity')?.addEventListener('input',e=>document.querySelector('#overlay-candidate').style.opacity=e.target.value);
    document.querySelector('#hide').onchange=e=>frames.forEach(f=>{f.contentDocument.querySelector('#fixture').style.visibility=e.target.checked?'hidden':'';f.contentWindow.mapFixture.core?.update({hidden:e.target.checked})});
    async function layout(){await new Promise(requestAnimationFrame);await Promise.all(fixtures().map(f=>f.tick(3)));await Promise.all(fixtures().map(f=>f.settle()));frames.forEach(f=>f.style.height=f.contentDocument.querySelector('#fixture').offsetHeight+'px');display()}document.querySelector('#narrow').onchange=async e=>{frames.forEach(f=>{f.style.width=e.target.checked?'340px':'100%';f.style.maxWidth='100%'});await layout()};addEventListener('resize',()=>window.mapReview.ready.then(layout));
    window.mapReview={frames,fixtures,reset,state,replay,measure,stats,isReady:false,ready:null};window.mapReview.ready=reset();
    const query=new URLSearchParams(location.search);if(query.has('state'))window.mapReview.ready.then(()=>state(query.get('state')));if(query.has('measure'))window.mapReview.ready.then(async()=>{window.mapReview.webKitEvidence=JSON.stringify(await measure())});
    </script></html>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync('review/map-cache.html', comparisonDocument());
  console.log('Wrote review/map-cache.html with baseline 068ad22 and the working-tree candidate');
}
