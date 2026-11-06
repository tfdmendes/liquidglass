import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadPlaywright, launchOptions } from './browser-runtime.mjs';

const previousFile = process.env.LG_RASTER_FILE;
const baseline = previousFile ? `file:${previousFile}` : process.env.LG_RASTER_BASE || '862e553fae1b97968af4206add31539534764919';
const sources = {
  previous: previousFile ? readFileSync(previousFile, 'utf8') : execFileSync('git', ['show', `${baseline}:lib/liquid-glass.js`], { encoding: 'utf8' }),
  new: readFileSync(process.env.LG_RASTER_CANDIDATE || 'lib/liquid-glass.js', 'utf8'),
};
const engine = process.env.LG_BROWSER || 'chromium';
const playwright = await loadPlaywright();
const browser = await playwright[engine].launch(launchOptions(engine));
const workloads = [
  { name: 'button map', width: 120, height: 64, radius: 32, count: 120, mode: 'map' },
  { name: 'panel map', width: 640, height: 360, radius: 32, count: 24, mode: 'map' },
  { name: 'capsule map', width: 240, height: 64, radius: 32, count: 100, mode: 'map' },
  { name: 'unique lens updates', width: 181.25, height: 53.75, radius: 17.125, count: 120, mode: 'update' },
];
const report = {
  baseline, sourceSHA256: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, createHash('sha256').update(source).digest('hex')])),
  date: new Date().toISOString(), browser: browser.version(), engine,
  method: 'Seven alternating paired samples after warmup, elapsed performance.now time in a real headless browser. Map cases include ImageData allocation, pixel generation, canvas creation and putImageData at mapScale 2. Updates start after createGlass setup and initial decode, and include synchronous update, cache lookup, map generation, PNG encoding and SVG attribute writes. Asynchronous replacement decode and browser paint are excluded. Fresh page per pair. No FPS, GPU or energy claim.',
  samples: [], correctness: null, summary: [],
};
try {
  const validation = await browser.newPage();
  await validation.goto('about:blank');
  report.correctness = await validation.evaluate(async (sources) => {
    const modules = await Promise.all(Object.values(sources).map(source => import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })))));
    let seed = 123456789;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    const cases = [
      { width: 1, height: 1, radius: 0 },
      { width: 640, height: 360, radius: 32 },
      { width: 103.4999999, height: 39.5000001, radius: Infinity },
      { width: 103.5000001, height: 39.4999999, radius: -1, bezel: 0, specularWidth: 0 },
      ...[NaN, Infinity, undefined, Number.MAX_VALUE].map(lightAngle => ({ lightAngle })),
    ];
    for (let i = 0; i < 120; i++) cases.push({
      width: 2 + random() * 320, height: 2 + random() * 160,
      radius: random() * 100, bezel: random() * 1.5, curvature: 2 + random() * 6,
      ior: 1 + random() * 1.5, invert: random() > 0.5,
      specular: i % 3 ? random() : 0, specularWidth: random() * 8, lightAngle: random() * 720 - 360,
    });
    let captured;
    window.ImageData = new Proxy(window.ImageData, { construct(target, args) {
      captured = Reflect.construct(target, args);
      return captured;
    } });
    let maps = 0, bytes = 0;
    for (const options of cases) for (const scale of [0.75, 1, 1.25, 2, 2.5]) {
      const images = modules.map(module => {
        module.renderLensMap(options, scale);
        return captured.data;
      });
      if (images[0].length !== images[1].length) throw Error('Map dimensions changed');
      for (let i = 0; i < images[0].length; i++) if (images[0][i] !== images[1][i]) {
        throw Error(`Pixel mismatch at byte ${i}: ${JSON.stringify({ options, scale })}`);
      }
      maps++; bytes += images[0].length;
    }
    return { maps, bytes, changedBytes: 0 };
  }, sources);
  await validation.close();
  console.log(JSON.stringify({ correctness: report.correctness }));
  for (const workload of workloads) {
    for (let sample = 0; sample < 7; sample++) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
      try {
        await page.evaluate(async (sources) => {
          window.runtimes = {};
          for (const [name, source] of Object.entries(sources)) runtimes[name] = await import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
        }, sources);
        const run = async (variant, count, offset) => page.evaluate(async ({ variant, workload, count, offset }) => {
          const runtime = runtimes[variant];
          const options = { width: workload.width, height: workload.height, radius: workload.radius, mapScale: 2, sync: true };
          const target = document.body.appendChild(document.createElement('div'));
          target.style.cssText = 'width:300px;height:120px;background:white';
          const glass = workload.mode === 'update' ? runtime.createGlass(target, options) : null;
          if (glass) {
            const deadline = performance.now() + 5000;
            while (!target.style.filter) {
              if (performance.now() > deadline) throw Error('Initial lens decode timed out');
              await new Promise(requestAnimationFrame);
            }
          }
          const start = performance.now();
          for (let i = 0; i < count; i++) {
            const change = { curvature: 2.8 + (i + offset) * 0.0035, lightAngle: -120 + (i + offset) * 0.71 };
            if (glass) glass.update(change);
            else runtime.renderLensMap({ ...options, ...change }, 2);
          }
          const elapsedMs = performance.now() - start;
          glass?.destroy(); target.remove();
          return elapsedMs;
        }, { variant, workload, count, offset });
        for (const variant of ['previous', 'new']) await run(variant, workload.count, 10000);
        for (const variant of sample % 2 ? ['new', 'previous'] : ['previous', 'new']) {
          const elapsedMs = await run(variant, workload.count, sample * 200);
          report.samples.push({ workload: workload.name, variant, sample, count: workload.count, elapsedMs, msPerOperation: elapsedMs / workload.count });
        }
      } finally { await page.close(); }
    }
  }
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  report.summary = workloads.map(workload => {
    const values = variant => report.samples.filter(row => row.workload === workload.name && row.variant === variant).map(row => row.msPerOperation);
    const previous = values('previous'), next = values('new');
    const previousMs = median(previous), newMs = median(next);
    assert(previousMs > 0 && newMs > 0);
    return { workload: workload.name, previousMs, newMs, reductionPercent: (1 - newMs / previousMs) * 100, speedup: previousMs / newMs,
      previousRangeMs: [Math.min(...previous), Math.max(...previous)], newRangeMs: [Math.min(...next), Math.max(...next)] };
  });
  writeFileSync(process.env.LG_RASTER_OUT || '/tmp/liquidglass-raster-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.summary, null, 2));
} finally { await browser.close(); }
