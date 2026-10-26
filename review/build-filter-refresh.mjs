import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { holdImageDecodes } from '../tests/helpers/hold-image-decodes.mjs';

const base = '068ad226f53e1ca62d857f78bdc32f58f3c5fce7';
const original = execFileSync('git', ['show', `${base}:lib/liquid-glass.js`], { encoding: 'utf8' });
const candidate = readFileSync(new URL('../lib/liquid-glass.js', import.meta.url), 'utf8');
const moduleURL = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const fixture = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="600"><defs><pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#d0e4f2"/><path d="M0 0H40V40H0Z" fill="none" stroke="#345169" stroke-width="2"/><path d="M0 20H40M20 0V40" stroke="#a4bcd5"/></pattern></defs><rect width="1280" height="600" fill="url(#p)"/><path d="M0 420L400 0L850 580L1280 80" stroke="#f25c46" stroke-width="28" fill="none"/><circle cx="220" cy="170" r="100" fill="#f7cf46"/><path d="M0 140H1280M0 280H1280" stroke="#213944" stroke-width="5"/><text x="22" y="65" font-family="sans-serif" font-size="30" fill="#142c40">REFRACTION · 0123456789</text></svg>`;

function frameRuntime(url) {
  const realTimeout = window.setTimeout.bind(window);
  const realClear = window.clearTimeout.bind(window);
  const pending = new Set();
  const decode = Image.prototype.decode;
  let decoding = 0;
  Image.prototype.decode = function () {
    decoding++;
    return decode.call(this).finally(() => { decoding--; });
  };
  const metrics = { idChanges: 0, attributes: 0, mapWrites: 0, retryTimers: 0, retriesFired: 0 };
  window.setTimeout = (fn, ms, ...args) => {
    if (ms !== 60 && ms !== 250) return realTimeout(fn, ms, ...args);
    metrics.retryTimers++;
    const timer = realTimeout(() => {
      pending.delete(timer);
      metrics.retriesFired++;
      fn(...args);
    }, ms);
    pending.add(timer);
    return timer;
  };
  window.clearTimeout = (timer) => { pending.delete(timer); realClear(timer); };
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.target.closest('filter')) metrics.attributes++;
      if (r.target.localName === 'filter' && r.attributeName === 'id') metrics.idChanges++;
      if (r.target.localName === 'feImage' && r.attributeName.endsWith('href')) metrics.mapWrites++;
    }
  }).observe(document.body, { attributes: true, subtree: true });
  const wait = (ms) => new Promise((resolve) => realTimeout(resolve, ms));
  const tick = () => new Promise(requestAnimationFrame);
  const settle = () => wait(360);
  const until = async (check) => {
    for (let i = 0; i < 200; i++) { if (check()) return; await wait(20); }
    throw Error('Timed out waiting for the final lens geometry/map');
  };
  window.ready = (async () => {
    const { createGlass, engine, reducedMotion } = await import(url);
    const target = document.querySelector('#target');
    const scene = document.querySelector('#scene');
    const defaults = { x: 30, y: 40, width: 180, height: 100, radius: 50, refraction: 24, chroma: 0.12, blur: 0, specular: 0.5 };
    let glass;
    let settings;
    let destroyed = false;
    let race = 0;
    let elapsedFlushMs = null;
    let checks = {};
    function mapSize() {
      const url = document.querySelector('feImage')?.getAttribute('href');
      if (!url) return null;
      const bytes = Uint8Array.from(atob(url.split(',')[1].slice(0, 44)), (c) => c.charCodeAt(0));
      const header = new DataView(bytes.buffer);
      return { width: header.getUint32(16), height: header.getUint32(20) };
    }
    async function captureReady() {
      await until(() => {
        if (decoding || pending.size) return false;
        if (destroyed || (settings.mode === 'backdrop' && engine !== 'blink')) return true;
        const p = glass.params;
        const W = target.offsetWidth, H = target.offsetHeight;
        if (settings.fit && (p.width !== W || p.height !== H)) return false;
        const scale = p.mapScale > 0 ? p.mapScale : Math.min(devicePixelRatio || 1, 2);
        const map = mapSize();
        if (map?.width !== Math.max(2, Math.round(p.width * scale)) || map?.height !== Math.max(2, Math.round(p.height * scale))) return false;
        if (!target.style.filter && !target.style.backdropFilter) return true;
        const image = document.querySelector('feImage');
        const snap = (value) => Math.round(value * devicePixelRatio) / devicePixelRatio;
        return Math.abs(Number(image.getAttribute('width')) - snap(p.width) / W) < 1e-10 &&
          Math.abs(Number(image.getAttribute('height')) - snap(p.height) / H) < 1e-10;
      });
      await tick();
      await tick();
    }
    function configure(next = {}) {
      glass?.destroy();
      destroyed = false;
      settings = { mode: 'content', clip: false, fit: false, sync: false, ...next };
      target.style.width = '';
      target.style.display = '';
      target.className = settings.mode === 'backdrop' ? 'backdrop' : '';
      glass = createGlass(target, { ...defaults, ...settings });
    }
    function snapshot() {
      const image = document.querySelector('feImage');
      return {
        engine, dpr: devicePixelRatio, reducedMotion: reducedMotion.matches, settings: { ...settings },
        metrics: { ...metrics, pendingRetries: pending.size }, elapsedFlushMs, checks: { ...checks },
        params: glass.params, filterId: glass.filterId, filter: target.style.filter,
        backdrop: target.style.backdropFilter || target.style.webkitBackdropFilter,
        clip: target.style.clipPath, box: { width: target.offsetWidth, height: target.offsetHeight },
        filters: document.querySelectorAll('filter').length,
        graph: { displacement: document.querySelectorAll('feDisplacementMap').length, blur: document.querySelectorAll('feGaussianBlur').length, hasMap: !!image?.getAttribute('href'), mapSize: mapSize() },
      };
    }
    const api = window.api = {
      configure,
      snapshot,
      settle,
      async state(name) {
        if (destroyed) { configure(); await settle(); }
        if (name === 'rest') glass.update({ ...defaults, hidden: false });
        if (name === 'pressed') glass.update({ x: 36, y: 35, width: 152, height: 126, radius: 48, refraction: 30, hidden: false });
        if (name === 'moving') glass.update({ ...defaults, x: Math.min(164, target.offsetWidth - 195), y: 140, hidden: false });
        if (name === 'hidden') glass.update({ hidden: true });
        await settle();
      },
      async step(i) {
        const x = 30 + Math.sin(i * Math.PI / 24) * Math.min(150, target.offsetWidth - 220);
        glass.update({ x, y: 40 + i * 3, width: 180 - i, height: 100 + i, radius: 50, hidden: false });
        await tick();
      },
      async run(name) {
        if (destroyed) { configure(); await settle(); }
        if (settings.fit && ['idle', 'rest', 'pressed', 'moving', 'replay', 'sequence'].includes(name)) {
          configure({ mode: settings.mode });
          await settle();
        }
        if (['idle', 'rest', 'pressed', 'moving', 'hidden'].includes(name)) await api.state(name === 'idle' ? 'rest' : name);
        else if (name === 'replay' || name === 'sequence') {
          const frames = reducedMotion.matches ? [24] : Array.from({ length: 25 }, (_, i) => i);
          for (const i of frames) await api.step(i);
          await settle();
          if (name === 'sequence') {
            for (const chroma of [0, 0.2, 0, 0.12]) {
              glass.update({ chroma, blur: chroma ? 2 : 0, specular: chroma ? 0.5 : 0 });
              await wait(100);
            }
            await settle();
          }
        } else if (name === 'flush') {
          const before = metrics.idChanges;
          const start = performance.now();
          for (let i = 0; i < 100; i++) glass.flush();
          elapsedFlushMs = performance.now() - start;
          await wait(0);
          checks.flushIdChanges = metrics.idChanges - before;
        } else if (name === 'no-op') {
          const before = { ...metrics };
          glass.update(glass.params);
          await wait(40);
          checks.noOpIdChanges = metrics.idChanges - before.idChanges;
          checks.noOpTimers = metrics.retryTimers - before.retryTimers;
          checks.noOpAttributes = metrics.attributes - before.attributes;
        } else if (name === 'fit') {
          configure({ fit: true, clip: true });
          await settle();
          target.style.width = '76%';
          await settle();
        } else if (name === 'sync') {
          configure({ sync: true, clip: true });
          await settle();
          await api.state('pressed');
        } else if (name === 'backdrop') {
          configure({ mode: 'backdrop', clip: true });
          await settle();
        } else if (name === 'resume') {
          target.style.display = 'none';
          await wait(100);
          glass.update({ x: 48, width: 174 });
          await wait(100);
          target.style.display = '';
          await settle();
        } else if (name === 'reconnect') {
          target.remove();
          await wait(80);
          scene.appendChild(target);
          glass.update({ x: 46, refraction: 28 });
          await settle();
        } else if (name === 'decode-race' || name === 'destroy') {
          configure({ sync: true, clip: true });
          await settle();
          race++;
          const gate = holdImageDecodes();
          const { releases } = gate;
          glass.update({ width: 137 + race / 10, curvature: 3 });
          glass.flush();
          await until(() => releases.length === 1);
          if (name === 'decode-race') {
            glass.update({ width: 139 + race / 10, curvature: 5, chroma: 0, blur: 1, specular: 0 });
            glass.flush();
            await until(() => releases.length === 2);
            releases[1]();
            await wait(40);
            const newest = document.querySelector('feImage').getAttribute('href');
            releases[0]();
            await settle();
            checks.newestMapKept = newest === document.querySelector('feImage').getAttribute('href');
            checks.graphRebuilt = document.querySelectorAll('feDisplacementMap').length === 1;
          } else {
            releases[0]();
            await wait(20);
            glass.update({ width: 141 + race / 10, curvature: 6 });
            await until(() => releases.length === 2);
            checks.pendingRetriesAtDestroy = pending.size;
            glass.destroy();
            destroyed = true;
            const before = metrics.idChanges;
            releases[1]();
            glass.flush();
            await settle();
            checks.destroyedStayedEmpty = document.querySelectorAll('filter').length === 0 && !target.style.filter;
            checks.idChangesAfterDestroy = metrics.idChanges - before;
          }
          gate.restore();
        } else throw Error(`Unknown scenario: ${name}`);
        await captureReady();
        if (name === 'fit') checks.fitWidth = glass.params.width === target.offsetWidth;
        return snapshot();
      },
    };
    configure();
    await settle();
    await captureReady();
    return snapshot();
  })().catch((error) => { window.failure = error.stack; throw error; });
}

function makeFrame(url, fixtureURL) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  *{box-sizing:border-box}body{margin:0;background:#e8eff5;color:#162e42;font-family:Arial,sans-serif}#scene{position:relative;height:420px;margin:16px;overflow:hidden}#scene,#target{background-image:url("${fixtureURL}");background-position:center;background-size:1280px 600px}#target{position:absolute;inset:0}span{position:absolute;left:22px;top:160px;font-size:28px;font-weight:700;white-space:nowrap}#target.backdrop{background:none}#target.backdrop span{display:none}.caption{margin:18px 16px;font-size:14px;line-height:1.5;color:#405566}
  </style><div id="scene"><span>Glass stays sharp</span><div id="target"><span>Glass stays sharp</span></div></div><p class="caption">One generated PNG map, a high contrast backdrop, and selectable text. The lens bends the grid and rim without changing the fixture.</p><script>${holdImageDecodes.toString()};(${frameRuntime.toString()})(${JSON.stringify(url)})</` + 'script></html>';
}

async function reviewRuntime(modules, fixtureURL) {
  const params = new URLSearchParams(location.search);
  const single = params.get('single');
  const names = single ? [single] : ['original', 'candidate'];
  const frames = [];
  if (single) document.body.classList.add('single');
  for (const name of names) {
    const article = document.createElement('article');
    article.innerHTML = `<h2>${name === 'original' ? 'Original 068ad22' : 'Candidate'}</h2>`;
    const frame = document.createElement('iframe');
    frame.title = name === 'original' ? 'Original 068ad22' : 'Candidate';
    frame.srcdoc = makeFrame(modules[name], fixtureURL);
    article.appendChild(frame);
    document.querySelector('#comparison').appendChild(article);
    frames.push(frame);
  }
  const loaded = frames.map((frame) => new Promise((resolve) => frame.addEventListener('load', resolve, { once: true })));
  const output = document.querySelector('#status');
  const display = () => {
    const results = frames.map((frame) => frame.contentWindow.api.snapshot());
    document.querySelector('#mode').value = results[0].settings.mode;
    document.querySelector('#live').textContent = results.map((r, i) => `${names[i]} · ${r.engine} · DPR ${r.dpr} · IDs ${r.metrics.idChanges} · retries ${r.metrics.retryTimers} scheduled / ${r.metrics.retriesFired} fired · filter attributes ${r.metrics.attributes}`).join('\n');
    return results;
  };
  window.comparisonReady = (async () => {
    await Promise.all(loaded);
    await Promise.all(frames.map((frame) => frame.contentWindow.ready));
    window.ready = true;
    output.textContent = 'Ready · both runtimes loaded';
    return display();
  })();
  window.runComparison = async (name) => {
    await window.comparisonReady;
    output.textContent = `Running ${name}…`;
    document.querySelectorAll('button,select').forEach((el) => { el.disabled = true; });
    try {
      const results = await Promise.all(frames.map((frame) => frame.contentWindow.api.run(name)));
      window.lastResult = { scenario: name, done: true, results };
      output.textContent = `Ready · ${name} complete`;
      display();
      return window.lastResult;
    } catch (error) {
      output.textContent = `Failed · ${error.message}`;
      window.lastResult = { done: false, error: error.stack };
      throw error;
    } finally { document.querySelectorAll('button,select').forEach((el) => { el.disabled = false; }); }
  };
  document.querySelectorAll('button[data-state]').forEach((button) => { button.onclick = () => window.runComparison(button.dataset.state); });
  document.querySelector('#mode').onchange = async (event) => {
    await window.comparisonReady;
    const mode = event.target.value;
    await Promise.all(frames.map(async (frame) => {
      frame.contentWindow.api.configure({ mode, clip: mode === 'backdrop' });
      await frame.contentWindow.api.settle();
    }));
    output.textContent = `Ready · ${mode} mode`;
    display();
  };
  document.querySelector('#overlay').onchange = (event) => { document.querySelector('#comparison').classList.toggle('overlay', event.target.checked); };
  document.querySelector('#opacity').oninput = (event) => {
    document.querySelector('#comparison').style.setProperty('--opacity', event.target.value);
  };
  if (params.has('scenario')) await window.runComparison(params.get('scenario'));
}

let evidence = null;
const evidencePath = process.env.LG_EVIDENCE_JSON || new URL('filter-refresh-evidence.json', import.meta.url);
if (existsSync(evidencePath)) evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
if (evidence?.summary.candidateSHA256 !== createHash('sha256').update(candidate).digest('hex')) evidence = null;
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const evidenceHTML = evidence ? `<p><b>${evidence.summary.pixelIdentical}/${evidence.summary.comparisons} capture pairs matched every RGBA pixel.</b> ${evidence.summary.date}. Measurements use the embedded candidate's SHA-256 <code>${evidence.summary.candidateSHA256.slice(0, 16)}</code>.</p>
<div class="table-wrap"><table><thead><tr><th>Runtime</th><th>Exact pairs</th><th>Initial IDs</th><th>Retry timers</th><th>Initial SVG writes</th><th>IDs / 100 flushes</th></tr></thead><tbody>${evidence.summary.runtimes.map((r) => `<tr><td>${escape(r.runtime)}</td><td>${r.pixelIdentical}/${r.comparisons}</td><td>${r.idle.original.idChanges} → ${r.idle.candidate.idChanges}</td><td>${r.idle.original.retryTimers} → ${r.idle.candidate.retryTimers}</td><td>${r.idle.original.attributes} → ${r.idle.candidate.attributes}</td><td>${r.flush100.originalIdChanges} → ${r.flush100.candidateIdChanges}</td></tr>`).join('')}</tbody></table></div>
<p>Each arrow is Original → Candidate. Blink/Gecko: 1280×800 and 390×844, DPR 1/2, phone DPR 1.25 and reduced motion at DPR 2. Native WebKit: both widths, display DPR 2, normal motion. Original-vs-original and original-vs-candidate native fit controls also matched.</p>
<p>States: idle, pressed, moving pose, numbered squish replay, graph zero crossings, hidden/re-show, resize/fit/clip, sync/async, fallback, reverse decode completion, destruction, no-op and repeated flush. Blink/Gecko also resumed an iframe moved outside the viewport. Captures check fixed poses and replay endpoints; they do not compare every animation frame.</p>
<details><summary>Raw measurement summary and limits</summary><pre>${escape(JSON.stringify(evidence, null, 2))}</pre></details>` : '<p>No recorded matrix is embedded. Live counters measure the code in this file.</p>';
const script = `const holdImageDecodes=${holdImageDecodes.toString()};const frameRuntime=${frameRuntime.toString()};const makeFrame=${makeFrame.toString()};(${reviewRuntime.toString()})(${JSON.stringify({ original: moduleURL(original), candidate: moduleURL(candidate) })},${JSON.stringify(`data:image/svg+xml;base64,${Buffer.from(fixture).toString('base64')}`)});`;
writeFileSync(new URL('filter-refresh.html', import.meta.url), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Filter refresh · original and candidate</title><style>
*{box-sizing:border-box}body{margin:0 auto;max-width:1500px;padding:24px;font:15px/1.5 system-ui,sans-serif;color:var(--foreground,#172c3c);background:transparent}h1{font-size:26px;margin:0 0 8px}h2{font-size:17px;margin:12px 0}p{max-width:85ch}button,select{font:inherit;padding:8px 12px;border:1px solid var(--border,#a3b6c5);border-radius:8px;background:var(--card,#f3f7fa);color:inherit}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #d76b35;outline-offset:3px}button:disabled{opacity:.55}.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}article{min-width:0}iframe{display:block;width:100%;height:510px;border:1px solid #b5c7d4;border-radius:10px;background:#e8eff5}pre{font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--secondary,#edf3f7);padding:16px;border-radius:10px}#status{font-weight:650;margin:12px 0}label{display:inline-flex;align-items:center;gap:6px}input[type=range]{width:120px}.overlay{grid-template-columns:1fr}.overlay article{grid-area:1/1}.overlay article:last-child{opacity:var(--opacity,.5);pointer-events:none}.overlay h2{visibility:hidden}.single{max-width:none;padding:0;background:#e8eff5}.single header,.single .controls,.single #status,.single #live,.single details{display:none}.single .pair{display:block}.single h2{display:none}.single iframe{border:0;border-radius:0;height:510px}@media(max-width:700px){body{padding:16px}.pair{grid-template-columns:1fr}h1{font-size:22px}.single{padding:0}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
code{overflow-wrap:anywhere}.table-wrap{width:100%;max-width:100%;min-width:0;overflow-x:auto}table{border-collapse:collapse;min-width:650px;width:100%;font-size:13px}th,td{padding:10px 8px;text-align:left;border-bottom:1px solid var(--border,#bdcbd6)}td:not(:first-child){white-space:nowrap}
</style></head><body><header><h1>Filter refresh</h1><p>Blink and Gecko retain one filter ID and skip the 60/250 ms map-settling retries. WebKit and unknown engines keep the original cache workaround. Each isolated frame embeds its actual runtime; the original comes from <code>git show ${base}:lib/liquid-glass.js</code>.</p></header>
<div class="controls"><button data-state="rest">At rest</button><button data-state="pressed">Pressed</button><button data-state="moving">Moving frame</button><button data-state="replay">Replay together</button><button data-state="sequence">Rapid swaps + graph</button><button data-state="hidden">Hidden</button><button data-state="resume">Resume</button><button data-state="fit">Fit + resize</button><button data-state="sync">Sync + clip</button><button data-state="reconnect">Reconnect</button><button data-state="flush">100 flushes</button><button data-state="no-op">No-op</button><button data-state="decode-race">Decode race</button><button data-state="destroy">Destroy pending</button><label>Mode <select id="mode"><option value="content">Content</option><option value="backdrop">Backdrop / fallback</option></select></label><label><input type="checkbox" id="overlay">Overlay</label><label>Candidate opacity<input id="opacity" type="range" min="0" max="1" step=".05" value=".5"></label></div>
<p id="status" role="status" aria-live="polite">Loading runtimes…</p><div id="comparison" class="pair"></div><pre id="live"></pre>
<details open><summary>Measured evidence</summary>${evidenceHTML}<p>Counts are DOM mutations and timer operations, not CPU percentages. The optional 100-flush duration is elapsed JavaScript time in the current browser; concurrent work and instrumentation can affect it.</p></details><details><summary>Scope and reproducibility</summary><p>The backdrop is embedded SVG, displacement maps are generated by each actual runtime, and replay uses the same numbered frames. At rest, pressed and moving controls wait 360 ms for settling. No network, build or CDN is needed to open this HTML.</p><p>Live frames use identical dimensions in this browser. Overlay puts them in the same cell; wait for resize settling before judging. Single-runtime captures use <code>?single=original</code> or <code>?single=candidate</code>, plus <code>&amp;scenario=pressed</code>. Automation can await <code>window.comparisonReady</code> and use <code>runComparison(name)</code>; <code>window.lastResult.done</code> confirms completion.</p><p>Desktop browser emulation does not establish physical iPhone behavior. Native WebKit runs at the display's DPR 2. Hidden-element/offscreen tests do not prove every background-tab suspension policy. Results apply to tested states and browser builds.</p></details>
<script>${script.replaceAll('</script', '<\\/script')}</script></body></html>`);
console.log('Built review/filter-refresh.html from the fixed baseline and current lib/liquid-glass.js');
