import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixture as surfaceFixture } from './build-surface-scroll.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const base = '068ad226f53e1ca62d857f78bdc32f58f3c5fce7';
const names = ['liquid-glass.js', 'components.js', 'glass-webgl.js'];
const original = Object.fromEntries(names.map(name => [name, execFileSync('git', ['show', `${base}:lib/${name}`], { cwd: root, encoding: 'utf8' })]));
const candidate = Object.fromEntries(names.map(name => [name, readFileSync(new URL(`../lib/${name}`, import.meta.url), 'utf8')]));
export const manifest = {
  base,
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sha256: Object.fromEntries(Object.entries({ original, candidate }).map(([variant, sources]) => [variant,
    Object.fromEntries(names.map(name => [name, createHash('sha256').update(sources[name]).digest('hex')]))])),
  scope: ['lib/liquid-glass.js', 'lib/components.js'],
};

function counters() {
  const stats = { encodes: 0, decodes: 0, retryTimers: 0 };
  const pending = new Set();
  const encode = HTMLCanvasElement.prototype.toDataURL;
  const decode = HTMLImageElement.prototype.decode;
  const timeout = window.setTimeout;
  HTMLCanvasElement.prototype.toDataURL = function (...args) { stats.encodes++; return encode.apply(this, args); };
  HTMLImageElement.prototype.decode = function (...args) {
    stats.decodes++;
    const promise = decode.apply(this, args);
    pending.add(promise);
    promise.then(() => pending.delete(promise), () => pending.delete(promise));
    return promise;
  };
  window.setTimeout = function (fn, ms, ...args) {
    if (ms === 60 || ms === 250) stats.retryTimers++;
    return timeout(fn, ms, ...args);
  };
  window.combinedCounters = {
    read: () => ({ ...stats }),
    reset() { Object.keys(stats).forEach(key => { stats[key] = 0; }); },
    settle: async () => { await Promise.allSettled([...pending]); },
  };
}

export function combinedDocument(variant = 'candidate', count = 32) {
  if (!['original', 'candidate'].includes(variant)) throw new Error('Expected original or candidate');
  const sources = variant === 'original' ? original : candidate;
  let html = surfaceFixture(sources['liquid-glass.js'], sources['components.js'], count);
  const anchor = 'await frames(6);window.fixtureReady=true;';
  if (!html.includes(anchor)) throw new Error('The Surface fixture readiness hook changed');
  html = html.replace('<script type="module">', `<script>(${counters.toString()})()</script><script type="module">`);
  return html.replace(anchor, `
window.combined={runtime,variant:${JSON.stringify(variant)},manifest:${JSON.stringify(manifest)},counters:combinedCounters,
  async settle(){for(let i=0;i<3;i++){await frames(2);await combinedCounters.settle()}},
  ids(){return [...document.querySelectorAll('lg-panel,lg-button')].flatMap(n=>n.surface?.glass?[{id:n.id,filterId:n.surface.glass.filterId}]:[])}
};
await frames(6);await combined.settle();window.fixtureReady=true;`);
}

export function reviewDocument() {
  const documents = ['original', 'candidate'].map(variant => combinedDocument(variant));
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Combined core and components</title><style>
*{box-sizing:border-box}body{margin:16px;font:15px/1.5 system-ui;color:#193347}h1{font-size:24px;margin:0}p{max-width:90ch}button,select{font:inherit;padding:6px 10px}nav{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pane{min-width:0}h2{font-size:16px}.viewport{overflow:hidden;background:#17364b}iframe{display:block;border:0;transform-origin:top left}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}button:focus-visible,select:focus-visible{outline:3px solid #147ca8;outline-offset:2px}@media(max-width:600px){body{margin:10px}.pair{gap:6px}}
</style><h1>Combined core and components</h1><p>Actual upstream at <code>068ad22</code> and the current core plus components. The Surface scene is reused from the scroll fixture. This page does not run WebGL or measure CPU time.</p>
<nav><select id="viewport" aria-label="Fixture viewport"><option value="1280,800">1280 × 800</option><option value="390,844">390 × 844</option></select><button data-state="0">Rest</button><button data-state="0.5">Deformed halfway</button><button data-state="1">Deformed fully</button><button id="replay">Scroll replay</button><button id="image">Load layout-shift image</button></nav>
<p id="status" role="status">Loading…</p><div class="pair"><section class="pane"><h2>Original 068ad22</h2><div class="viewport"><iframe title="Original core and components"></iframe></div></section><section class="pane"><h2>Current combination</h2><div class="viewport"><iframe title="Current core and components"></iframe></div></section></div>
<details><summary>Source hashes and scope</summary><pre>${JSON.stringify(manifest, null, 2)}</pre></details><p>Compare within one browser and viewport. The deformation buttons set identical geometry; the test runner separately exercises real pointer input and springs. Chrome screenshots can contain subpixel noise. No physical iPhone or real background-tab coverage is implied.</p>
<script>
const documents=${JSON.stringify(documents).replaceAll('<', '\\u003c')};
const frames=[...document.querySelectorAll('iframe')];
function fit(){const [w,h]=document.querySelector('#viewport').value.split(',').map(Number);for(const frame of frames){const box=frame.parentElement,scale=box.clientWidth/w;Object.assign(frame.style,{width:w+'px',height:h+'px',transform:'scale('+scale+')'});box.style.height=h*scale+'px'}}
const settle=()=>Promise.all(frames.map(frame=>frame.contentWindow.combined.settle()));
window.combinedReview={frames,settle,ready:Promise.all(frames.map((frame,i)=>new Promise(resolve=>{frame.onload=async()=>{while(!frame.contentWindow.fixtureReady)await new Promise(r=>setTimeout(r,20));resolve()};frame.srcdoc=documents[i]}))).then(async()=>{fit();await settle();document.querySelector('#status').textContent=frames.map(f=>f.contentWindow.fixture.engine).join(' / ')+' · ready';window.reviewReady=true})};
document.querySelector('#viewport').onchange=async()=>{fit();await settle()};
document.querySelectorAll('[data-state]').forEach(button=>button.onclick=async()=>{await combinedReview.ready;frames.forEach(f=>f.contentWindow.fixture.state(+button.dataset.state));await settle()});
document.querySelector('#replay').onclick=async()=>{await combinedReview.ready;for(const y of [0,120,400,1100,3100,0]){frames.forEach(f=>f.contentWindow.fixture.scroll(y));await settle()}};
document.querySelector('#image').onclick=async()=>{await combinedReview.ready;await Promise.all(frames.map(f=>f.contentWindow.fixture.layoutShiftImage()))};
new ResizeObserver(fit).observe(document.querySelector('.pair'));
</script></html>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('./combined.html', import.meta.url), reviewDocument());
  console.log('Wrote review/combined.html with the actual upstream and current core/component pair');
}
