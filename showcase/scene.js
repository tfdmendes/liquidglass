import { percentile, summarizeFrames } from './metrics.js';

const search = new URLSearchParams(location.search);
const build = ['original', 'previous', 'current'].includes(search.get('build')) ? search.get('build') : 'current';
const world = document.querySelector('#world');
const canvas = world.querySelector('canvas');
const runtime = await import(`./builds/${build}/liquid-glass.js`);
const webgl = await import(`./builds/${build}/glass-webgl.js`);
let controls = [], renderer, bitmap, photo, frame = 0, running = false, generation = 0;
let settings = { count: 1, renderer: 'svg', workload: 'reshape', backdrop: 'city' };
let geometry = [], size = { width: 0, height: 0 };
let activeRun = false, resizedDuringRun = false, hiddenDuringRun = false;
let configured = false;
let wantsPlayback = false;

const nextFrame = () => new Promise(requestAnimationFrame);
const checkVisible = () => {
  if (!configured) throw Error('The scene changed while measuring; wait for it to load and run again');
  if (document.hidden || hiddenDuringRun) throw Error('The tab was hidden during measurement; keep it visible and run again');
  if (resizedDuringRun) throw Error('The scene resized during measurement; run again at the new size');
};

function halt() {
  running = false;
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
}

function stop() {
  wantsPlayback = false;
  halt();
}

function dispose(keepPlayback = false) {
  generation++;
  configured = false;
  if (keepPlayback) halt(); else stop();
  controls.forEach(control => control.destroy()); controls = [];
  renderer?.destroy(); renderer = null;
  bitmap?.close?.(); bitmap = null;
  world.querySelectorAll('.glass').forEach(element => element.remove());
}

function lensOptions(seconds, index) {
  const base = geometry[index];
  const phase = seconds * 2.2 + index * 0.67;
  const width = settings.workload === 'reshape' ? base.width * (0.85 + 0.15 * Math.cos(phase)) : base.width;
  const height = settings.workload === 'reshape' ? base.height * (0.85 + 0.15 * Math.sin(phase * 1.17)) : base.height;
  const x = base.x + (base.boxWidth - width) / 2 + Math.sin(phase) * base.travelX;
  const y = base.y + (base.boxHeight - height) / 2 + Math.cos(phase * 0.7) * base.travelY;
  return { x, y, width, height, radius: height / 2, refraction: Math.min(18, height * 0.2),
    ...(settings.workload === 'reshape' ? { lightAngle: -120 + Math.sin(phase) * 24 } : {}) };
}

function step(seconds) {
  if (!configured) return;
  for (let index = 0; index < geometry.length; index++) {
    const next = lensOptions(seconds, index);
    if (renderer) renderer.updateLens(index, next);
    else controls[index].update({ ...next, x: next.x - geometry[index].x, y: next.y - geometry[index].y });
  }
  renderer?.render();
}

async function configure(options = {}) {
  dispose(true);
  const request = ++generation;
  settings = { ...settings, ...options };
  settings.count = Math.max(1, Math.min(48, Number(settings.count) || 1));
  if (!['svg', 'webgl'].includes(settings.renderer)) throw Error('Unknown renderer');
  if (!['reshape', 'move'].includes(settings.workload)) throw Error('Unknown workload');
  if (!['city', 'beach', 'wave', 'portrait'].includes(settings.backdrop)) throw Error('Unknown backdrop');
  size = { width: world.clientWidth, height: world.clientHeight };
  if (!size.width || !size.height) throw Error('Scene needs a visible size');
  const image = new Image();
  image.src = `./media/${settings.backdrop}.jpg`;
  await image.decode();
  if (request !== generation) return;
  photo = image;
  world.style.backgroundImage = `url("${image.src}")`;
  const columns = settings.count === 1 ? 1 : Math.ceil(Math.sqrt(settings.count * size.width / size.height));
  const rows = Math.ceil(settings.count / columns);
  const cellWidth = size.width / columns, cellHeight = size.height / rows;
  geometry = Array.from({ length: settings.count }, (_, index) => ({
    x: index % columns * cellWidth, y: Math.floor(index / columns) * cellHeight,
    boxWidth: cellWidth, boxHeight: cellHeight,
    width: Math.min(settings.count === 1 ? 300 : 180, cellWidth * 0.82),
    height: Math.min(settings.count === 1 ? 160 : 88, cellHeight * 0.70),
    travelX: cellWidth * 0.035, travelY: cellHeight * 0.035,
  }));
  canvas.hidden = settings.renderer !== 'webgl';
  if (settings.renderer === 'webgl') {
    const source = document.createElement('canvas');
    source.width = Math.round(size.width * 2); source.height = Math.round(size.height * 2);
    const scale = Math.max(source.width / image.width, source.height / image.height);
    source.getContext('2d').drawImage(image, (source.width - image.width * scale) / 2, (source.height - image.height * scale) / 2, image.width * scale, image.height * scale);
    const nextBitmap = await createImageBitmap(source);
    if (request !== generation) { nextBitmap.close(); return; }
    bitmap = nextBitmap;
    renderer = webgl.createGlassRenderer(canvas, bitmap, { pixelRatio: 2 });
    renderer.setLenses(geometry.map((_, index) => ({ ...lensOptions(0, index), chroma: 0.12, mapScale: 2 })));
    renderer.render();
  } else {
    const scale = Math.max(size.width / image.width, size.height / image.height);
    const imageWidth = image.width * scale, imageHeight = image.height * scale;
    for (const [index, base] of geometry.entries()) {
      const element = world.appendChild(document.createElement('div'));
      element.className = 'glass';
      element.style.cssText = `left:${base.x}px;top:${base.y}px;width:${base.boxWidth}px;height:${base.boxHeight}px;background-image:url("${image.src}");background-size:${imageWidth}px ${imageHeight}px;background-position:${(size.width - imageWidth) / 2 - base.x}px ${(size.height - imageHeight) / 2 - base.y}px`;
      const next = lensOptions(0, index);
      controls.push(runtime.createGlass(element, { ...next, x: next.x - base.x, y: next.y - base.y, clip: true, sync: true, mapScale: 2, chroma: 0.12 }));
    }
    const deadline = performance.now() + 10000;
    while (controls.some(control => !control.filterId)) {
      if (performance.now() > deadline) throw Error('Initial SVG maps did not decode');
      await nextFrame();
      if (request !== generation) return;
    }
  }
  if (request !== generation) return;
  configured = true;
  resizedDuringRun = false; hiddenDuringRun = false;
  step(0);
}

function start() {
  wantsPlayback = true;
  if (running) return;
  running = true;
  let startTime, sampleStart, frames = 0;
  const tick = timestamp => {
    if (!running) return;
    if (!configured) { frame = requestAnimationFrame(tick); return; }
    startTime ??= timestamp; sampleStart ??= timestamp;
    step((timestamp - startTime) / 1000);
    if (timestamp !== sampleStart) frames++;
    if (timestamp - sampleStart >= 800) {
      parent.postMessage({ type: 'glass-preview-fps', build, fps: frames * 1000 / (timestamp - sampleStart) }, location.origin);
      sampleStart = timestamp; frames = 0;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

async function calibrate(frames = 45) {
  stop();
  const times = [];
  let before = await nextFrame();
  for (let index = 0; index < frames; index++) {
    const now = await nextFrame(); times.push(now - before); before = now;
  }
  checkVisible();
  return { refreshMs: percentile(times, 0.5), intervals: times };
}

async function run({ durationMs = 3000, warmupMs = 1000, refreshMs } = {}) {
  stop();
  checkVisible();
  activeRun = true; resizedDuringRun = false; hiddenDuringRun = false;
  const intervals = [], updates = [];
  const begin = await nextFrame();
  let before = begin, lastUpdate = 0;
  try {
    while (true) {
      const now = await nextFrame();
      checkVisible();
      const elapsed = now - begin;
      // A frame interval includes the preceding update and browser work, so pair it with that update
      if (before - begin >= warmupMs) { intervals.push(now - before); updates.push(lastUpdate); }
      if (elapsed >= warmupMs + durationMs) break;
      const start = performance.now();
      step(elapsed / 1000);
      lastUpdate = performance.now() - start;
      before = now;
    }
    if (intervals.length < 2) throw Error('Not enough frames for a valid sample');
    return { ...summarizeFrames(intervals, updates, refreshMs), intervals, updates, settings: { ...settings },
      viewport: { ...size }, mapScale: 2, build, engine: runtime.engine, refreshMs, visibility: 'visible', durationMs, warmupMs };
  } finally { activeRun = false; }
}

addEventListener('visibilitychange', () => { if (document.hidden && activeRun) hiddenDuringRun = true; });
const resize = new ResizeObserver(() => {
  if (world.clientWidth === size.width && world.clientHeight === size.height) return;
  if (activeRun) { resizedDuringRun = true; return; }
  const pending = configure();
  const request = generation;
  // Resizing keeps Play intent, while a later Pause or benchmark disposal cancels it
  pending.then(() => { if (wantsPlayback && generation === request) start(); }).catch(showError);
});

function showError(error) {
  const target = document.querySelector('#error'); target.textContent = error.message; target.hidden = false;
  parent.postMessage({ type: 'glass-scene-error', build, error: error.message }, location.origin);
}

window.scene = { build, configure, start, stop, step, calibrate, run, dispose,
  get settings() { return { ...settings }; }, get engine() { return runtime.engine; } };
window.sceneReady = configure().then(() => {
  resize.observe(world);
  return true;
}).catch(error => { showError(error); throw error; });
addEventListener('pagehide', () => { resize.disconnect(); dispose(); });
