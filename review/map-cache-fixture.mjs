import { crc32, deflateSync } from 'node:zlib';

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

export function frameDocument(source, components) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;font:16px Arial,sans-serif}#fixture{position:relative;display:flex;align-content:center;align-items:center;justify-content:center;flex-wrap:wrap;gap:25px;padding:26px 18px;min-height:310px;background:#205877 url(data:image/png;base64,${backdrop}) repeat;overflow:hidden}
    lg-button .lg-button__el{width:180px}lg-segmented{max-width:100%}#content{position:relative;width:280px;height:72px;padding:11px;background:repeating-linear-gradient(90deg,#fff 0 8px,#bbd8e5 8px 9px);color:#193347;font:14px/23px Arial,sans-serif;white-space:nowrap}#fallback .lg-button__el{width:190px}
    </style><div id="fixture" data-lg-backdrop></div><script>(${fixtureApp.toString()})(${JSON.stringify(source).replaceAll('<', '\\u003c')},${JSON.stringify(components).replaceAll('<', '\\u003c')})</script></html>`;
}
