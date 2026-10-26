import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { combinedDocument, manifest, reviewDocument } from '../review/combined-fixture.mjs';
import { holdImageDecodes } from './helpers/hold-image-decodes.mjs';
import { comparePixels } from './helpers/compare-pixels.mjs';

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to the existing Playwright index.mjs; this runner installs nothing');
const moduleURL = pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE));
const playwright = await import(moduleURL.href);
const { PNG } = await import(new URL('../playwright-core/lib/utilsBundle.js', moduleURL));
const engine = process.argv[2] || 'chromium';
assert(['chromium', 'firefox'].includes(engine));
const output = process.env.COMBINED_EVIDENCE_DIR || '/tmp/liquidglass-fork-validation/combined';
mkdirSync(output, { recursive: true });
const report = { date: new Date().toISOString(), ...manifest, engine, cases: [], limitations: [
  'This suite covers core/component composition; separate runs cover the current core and WebGL renderer',
  'DOM captures report raw differences; Chrome is not claimed to be pixel-identical',
  'Viewport emulation is not a physical iPhone; no real background-tab suspension was tested',
  'Operation counts are not CPU benchmarks',
] };
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions++; };
const digest = value => createHash('sha256').update(value).digest('hex');
const difference = (left, right) => {
  const result = comparePixels(PNG.sync.read(left), PNG.sync.read(right));
  assertions++;
  return result;
};
const browser = await playwright[engine].launch({ headless: true, executablePath: engine === 'firefox'
  ? process.env.FIREFOX_EXECUTABLE : process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
report.browser = browser.version();
const documents = ['original', 'candidate'].map(variant => combinedDocument(variant));
const align = async (page, label) => {
  const geometry = await page.evaluate(() => fixture.geometry(true));
  check(geometry.length > 0, `${label}: no visible copy surfaces`);
  for (const item of geometry) for (const key of ['dx', 'dy', 'dw', 'dh']) check(Math.abs(item[key]) < 0.02, `${label}: ${item.id} ${key}=${item[key]}`);
};
try {
  for (const config of [
    { width: 1280, height: 800, dpr: 1, motion: 'no-preference' },
    { width: 390, height: 844, dpr: 2, motion: 'no-preference' },
    { width: 390, height: 844, dpr: 2, motion: 'reduce' },
  ]) {
    const row = { ...config, checks: {}, shots: [] };
    const before = assertions;
    report.cases.push(row);
    const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.dpr, reducedMotion: config.motion,
      ...(engine === 'firefox' ? { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0' } : {}) });
    const errors = [];
    const open = async (html) => {
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      await page.setContent(html);
      await page.waitForFunction(() => window.fixtureReady);
      check(await page.evaluate(() => fixture.engine) === (engine === 'firefox' ? 'gecko' : 'blink'), 'Unexpected production engine detection');
      return page;
    };
    try {
      const pages = [];
      for (const document of documents) pages.push(await open(document));
      const [original, candidate] = pages;
      row.checks.loaded = await candidate.evaluate(() => ({ variant: combined.variant, manifest: combined.manifest, reducedMotion: combined.runtime.engine && matchMedia('(prefers-reduced-motion: reduce)').matches }));
      check(row.checks.loaded.reducedMotion === (config.motion === 'reduce'), 'Motion preference was not applied');
      const maps = [];
      for (const page of pages) maps.push(await page.evaluate(() => [
        { width: 123.456, height: 45.678, radius: 21.987, bezel: 0.373, curvature: 3.7, ior: 1.47, specularWidth: 1.375 },
        { width: 70.125, height: 51.875, radius: 7.625, invert: true, specular: 0 },
      ].flatMap(p => [1, 1.25].map(scale => combined.runtime.renderLensMap(p, scale).canvas.toDataURL()))));
      check(maps[0].every((url, i) => url === maps[1][i]), 'Combined runtime changed map bytes');
      row.checks.mapBytes = { maps: maps[0].length, changedBytes: 0, sha256: maps[0].map(digest) };
      row.checks.cacheAndFilter = await candidate.evaluate(async () => {
        const target = document.body.appendChild(document.createElement('div'));
        target.style.cssText = 'width:260px;height:80px;background:#abc';
        combined.counters.reset();
        const glass = combined.runtime.createGlass(target, { width: 103.125, height: 43.875, radius: 20.1, mapScale: 1.25, sync: true });
        await combined.settle();
        const id = glass.filterId;
        glass.update({ width: 103.125 + 1e-10 }); await combined.settle();
        glass.update({ width: 103.125 }); await combined.settle();
        const reuse = combined.counters.read();
        glass.update({ chroma: 0, blur: 1, specular: 0 }); await combined.settle();
        glass.update({ hidden: true }); const hidden = target.style.filter === '';
        glass.update({ hidden: false }); await combined.settle();
        const result = { reuse, hidden, stableId: id === glass.filterId, filterApplied: target.style.filter.includes(id), retryTimers: combined.counters.read().retryTimers };
        glass.destroy(); target.remove(); return result;
      });
      const cache = row.checks.cacheAndFilter;
      check(cache.reuse.encodes === 1 && cache.reuse.decodes === 1, 'Equal maps did not share their PNG and decode in the component runtime');
      check(cache.hidden && cache.stableId && cache.filterApplied && cache.retryTimers === 0, 'Cache reuse broke the stable filter lifecycle');
      await candidate.addScriptTag({ content: `window.holdCombinedDecodes=${holdImageDecodes.toString()}` });
      row.checks.decodeOrdering = await candidate.evaluate(async () => {
        const gate = holdCombinedDecodes(), target = document.body.appendChild(document.createElement('div'));
        target.style.cssText = 'width:260px;height:80px;background:#abc';
        const glass = combined.runtime.createGlass(target, { width: 163.125, height: 47.875, radius: 13.1, mapScale: 1, sync: true });
        const firstUnfiltered = target.style.filter === '';
        glass.update({ width: 163.125 + 1e-10 });
        const sharedPending = gate.releases.length === 1;
        glass.update({ width: 169.625, curvature: 5, chroma: 0, blur: 1, specular: 0 });
        gate.releases[1](); await new Promise(resolve => setTimeout(resolve, 80)); await fixture.frames(2);
        const newest = document.querySelector(`#${glass.filterId} feImage`).getAttribute('href');
        gate.releases[0](); await new Promise(resolve => setTimeout(resolve, 80)); await fixture.frames(2);
        const preserved = !!newest && document.querySelector(`#${glass.filterId} feImage`).getAttribute('href') === newest;
        glass.update({ width: 177.875 });
        const filter = document.getElementById(glass.filterId);
        glass.destroy(); gate.releases[2](); gate.restore(); await combined.settle();
        const destroyed = !filter.isConnected && target.style.filter === '';
        target.remove(); return { firstUnfiltered, sharedPending, preserved, destroyed, gates: gate.releases.length };
      });
      check(Object.entries(row.checks.decodeOrdering).every(([key, value]) => key === 'gates' ? value === 3 : value === true), 'Pending decode ordering or destruction failed');
      row.checks.pointerMotion = [];
      for (const page of pages) {
        await page.evaluate(() => {
          combined.counters.reset(); window.motionSamples = [];
          const surface = document.querySelector('#press').surface, update = surface.setDelta;
          window.pressFilterId = surface.glass.filterId;
          surface.setDelta = function (delta) { motionSamples.push({ ...delta }); return update.call(this, delta); };
        });
        const box = await page.locator('#press button').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForFunction(() => document.querySelector('#press').surface.delta.w === 10);
        await page.mouse.up();
        await page.waitForFunction(() => document.querySelector('#press').surface.delta.w === 0);
        await page.evaluate(() => combined.settle());
        const motion = await page.evaluate(() => ({ samples: motionSamples.length, intermediate: motionSamples.some(d => d.w > 0 && d.w < 10), stableId: pressFilterId === document.querySelector('#press').surface.glass.filterId, ...combined.counters.read() }));
        check(config.motion === 'reduce' ? motion.samples === 2 && !motion.intermediate : motion.samples > 2 && motion.intermediate, 'Real pointer input did not exercise the expected spring behaviour');
        row.checks.pointerMotion.push(motion);
      }
      check(row.checks.pointerMotion[1].stableId && row.checks.pointerMotion[1].retryTimers === 0, 'Component motion reissued a stable filter or scheduled a retry');
      const repeats = [];
      if (config.width === 390 && config.motion === 'no-preference') for (const document of documents) repeats.push(await open(document));
      for (const state of [0, 0.5, 1]) {
        const images = [];
        for (const [index, page] of [...pages, ...repeats].entries()) {
          await page.evaluate(async value => { fixture.state(value); await combined.settle(); }, state);
          await page.waitForTimeout(400);
          const key = `${engine}-${config.width}-${config.motion}-p${state}-${index % 2 ? 'candidate' : 'original'}${index > 1 ? '-repeat' : ''}`;
          images.push(await page.screenshot({ path: `${output}/${key}.png` }));
        }
        const shot = { state, originalCandidate: difference(images[0], images[1]) };
        if (repeats.length) { shot.originalRepeat = difference(images[0], images[2]); shot.candidateRepeat = difference(images[1], images[3]); }
        if (engine === 'firefox') check(shot.originalCandidate.pixels === 0, 'Gecko combined DOM capture differs from upstream');
        row.shots.push(shot);
      }
      for (const page of repeats) await page.close();
      row.checks.scroll = [];
      for (const page of pages) {
        const ids = await page.evaluate(() => combined.ids());
        await page.evaluate(async () => { fixture.state(0); await combined.settle(); fixture.measure(); });
        for (const y of [0, 120, 400, 1100, 3100, 0]) {
          await page.evaluate(async y => { fixture.scroll(y); await fixture.frames(3); }, y);
          await align(page, `scroll ${y}`);
        }
        const counts = await page.evaluate(() => fixture.sample());
        await page.evaluate(async () => { fixture.nested(130); fixture.source(137); await fixture.frames(3); });
        await align(page, 'nested/source-only scroll');
        const unrelated = await page.evaluate(async () => { fixture.measure(); fixture.unrelated(40); await fixture.frames(4); return fixture.sample(); });
        const shifted = await page.evaluate(() => fixture.layoutShiftImage());
        check(shifted.shift === 110, 'Image did not cause the expected real layout shift');
        await align(page, 'loaded image layout shift');
        const late = await page.evaluate(() => fixture.image());
        check(['dx', 'dy', 'dw', 'dh'].every(key => Math.abs(late[key]) < 0.02), 'Late image source is not aligned');
        await page.evaluate(async () => { const node = document.querySelector('#late'); node.remove(); document.querySelector('#late-source').dispatchEvent(new Event('load')); document.querySelector('#scene').append(node); await combined.settle(); });
        await align(page, 'reconnected image surface');
        const afterIds = await page.evaluate(() => combined.ids());
        const stableIds = ids.every(item => afterIds.some(next => next.id === item.id && next.filterId === item.filterId));
        row.checks.scroll.push({ counts, unrelated, imageShift: shifted.shift, stableIds });
      }
      check(row.checks.scroll[1].counts.reads < row.checks.scroll[0].counts.reads, 'Combined scroll did not remove geometry reads');
      check(row.checks.scroll[1].unrelated.reads === 0 && row.checks.scroll[1].stableIds, 'Combined scroll woke unrelated surfaces or changed existing filter IDs');
      row.checks.rapidAndTeardown = await candidate.evaluate(async () => {
        fixture.scroll(0); fixture.nested(0); fixture.source(0); await combined.settle();
        const button = document.querySelector('#press button');
        for (let i = 0; i < 8; i++) { button.dispatchEvent(new PointerEvent('pointerdown')); button.dispatchEvent(new PointerEvent('pointercancel')); }
        await new Promise(resolve => setTimeout(resolve, 700)); await combined.settle();
        const released = document.querySelector('#press').surface.delta.w === 0;
        fixture.measure(); await fixture.frames(8); const idle = fixture.sample();
        dispatchEvent(new Event('scroll')); document.querySelectorAll('lg-panel,lg-button').forEach(node => node.remove());
        document.querySelectorAll('img').forEach(image => image.dispatchEvent(new Event('load')));
        await fixture.frames(4); await new Promise(resolve => setTimeout(resolve, 320));
        return { released, idle, remainingFilters: document.querySelectorAll('filter').length };
      });
      check(row.checks.rapidAndTeardown.released && row.checks.rapidAndTeardown.idle.reads === 0 && row.checks.rapidAndTeardown.remainingFilters === 0, 'Rapid input, idle or queued-frame teardown failed');
      check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
      row.pageErrors = errors;
      row.passed = true;
      console.log(`PASS ${engine} ${config.width} ${config.motion}: geometry ${row.checks.scroll.map(r => r.counts.reads).join(' -> ')}; DOM differing pixels ${row.shots.map(s => s.originalCandidate.pixels).join('/')}`);
    } catch (error) {
      row.passed = false; row.error = error.stack; row.pageErrors = errors; process.exitCode = 1;
      console.error(`FAIL ${engine} ${config.width} ${config.motion}: ${error.stack}`);
    } finally {
      row.assertions = assertions - before;
      await context.close();
      writeFileSync(`${output}/${engine}.json`, JSON.stringify({ ...report, assertions }, null, 2) + '\n');
    }
  }
  const page = await browser.newPage({ ...(engine === 'firefox' ? { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0' } : {}) });
  await page.setContent(reviewDocument()); await page.waitForFunction(() => window.reviewReady);
  check(await page.locator('iframe').count() === 2, 'Standalone combined review did not initialize both actual runtimes');
  await page.close();
} finally {
  await browser.close();
  writeFileSync(`${output}/${engine}.json`, JSON.stringify({ ...report, assertions }, null, 2) + '\n');
}
