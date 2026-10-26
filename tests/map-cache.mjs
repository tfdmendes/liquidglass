import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { baseline, comparisonDocument, frameDocument } from '../review/build-map-cache.mjs';

// Use an isolated Playwright install without adding a production dependency
if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to an isolated Playwright index.mjs path');
const { chromium, firefox } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const isFirefox = process.env.BROWSER === 'firefox';
const browser = await (isFirefox ? firefox : chromium).launch({ headless: true, executablePath: isFirefox ? process.env.FIREFOX_EXECUTABLE : (process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') });
const oldSource = baseline();
const source = process.argv.includes('--baseline') ? oldSource : readFileSync('lib/liquid-glass.js', 'utf8');
const userAgent = isFirefox ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0' : undefined;
const evidence = { browser: await browser.version(), engine: isFirefox ? 'gecko' : 'blink', baseline: process.argv.includes('--baseline'), tests: [], visuals: [] };
const out = process.env.MAP_EVIDENCE_DIR;
if (out) mkdirSync(out, { recursive: true });
const fixture = async (code = source, extra = {}) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, userAgent, ...extra });
  const page = await context.newPage();
  await page.bringToFront();
  await page.setContent(frameDocument(code));
  assert.equal(await page.evaluate(() => mapFixture.ready), evidence.engine);
  return { page, context };
};
const check = async (name, fn) => {
  try { const result = await fn(); evidence.tests.push({ name, passed: true, result }); console.log(`PASS ${name} ${JSON.stringify(result ?? '')}`); }
  catch (error) { evidence.tests.push({ name, passed: false, error: String(error) }); console.error(`FAIL ${name}: ${error}`); process.exitCode = 1; }
};

try {
  if (!process.argv.includes('--visual-only')) {
  await check('Exact pixels across fractional geometry, optics and map scales', async () => {
    const original = await fixture(oldSource);
    const candidate = await fixture();
    const maps = async (page) => page.evaluate(() => {
      const cases = [
        { width: 123.456, height: 45.678, radius: 21.987, bezel: 0.373, curvature: 3.7, ior: 1.47, specular: 0.63, specularWidth: 1.375, lightAngle: -113.25 },
        { width: 103.4999999, height: 39.5000001, radius: Infinity },
        { width: 103.5000001, height: 39.4999999, radius: -1, bezel: 0, specularWidth: 0 },
        { width: 70.125, height: 51.875, radius: 7.625, invert: true, specular: 0 },
      ];
      return cases.flatMap((p) => [0.75, 1, 1.25, 2, 2.5].map((scale) => mapFixture.runtime.renderLensMap(p, scale).canvas.toDataURL()));
    });
    assert.deepEqual(await maps(candidate.page), await maps(original.page));
    await original.context.close(); await candidate.context.close();
    return { maps: 20, changedBytes: 0 };
  });
  await check('Near-identical shapes share one exact PNG and decode', async () => {
    const { page, context } = await fixture();
    const result = await page.evaluate(async () => {
      const f = mapFixture, p = { width: 103.125, height: 43.875, radius: 20.1, mapScale: 1.25 };
      const before = f.runtime.renderLensMap(p, 1.25).canvas.toDataURL();
      const after = f.runtime.renderLensMap({ ...p, width: p.width + 1e-10 }, 1.25).canvas.toDataURL();
      const target = document.body.appendChild(document.createElement('div'));
      target.style.cssText = 'width:260px;height:100px;background:repeating-linear-gradient(90deg,red 0 5px,blue 5px 10px)';
      f.resetStats();
      const glass = f.runtime.createGlass(target, { ...p, sync: true });
      await f.settle();
      glass.update({ width: p.width + 1e-10 }); await f.settle();
      glass.update({ width: p.width }); await f.settle();
      const stats = { ...f.stats }, href = document.querySelector(`#${glass.filterId} feImage`).getAttribute('href');
      glass.destroy(); target.remove();
      return { pixelsEqual: before === after, correctURL: href === after, ...stats };
    });
    assert.equal(result.pixelsEqual, true); assert.equal(result.correctURL, true);
    assert.equal(result.encodes, 1); assert.equal(result.decodes, 1); assert.equal(result.rasterizations, 2);
    await context.close(); return result;
  });
  await check('LRU retains recent maps and evicts at 48 entries', async () => {
    const { page, context } = await fixture();
    const result = await page.evaluate(async () => {
      const f = mapFixture, target = document.body.appendChild(document.createElement('div'));
      target.style.cssText = 'width:300px;height:80px;background:white';
      f.resetStats();
      const glass = f.runtime.createGlass(target, { width: 51, height: 19, radius: 4, mapScale: 1, sync: true });
      for (let width = 52; width <= 99; width++) glass.update({ width });
      await f.settle(); const filled = f.stats.encodes;
      glass.update({ width: 98 }); await f.settle(); const recent = f.stats.encodes;
      glass.update({ width: 51 }); await f.settle(); const evicted = f.stats.encodes;
      glass.destroy(); target.remove(); return { filled, recent, evicted };
    });
    assert.equal(result.filled, 49); assert.equal(result.recent, 49); assert.equal(result.evicted, 50);
    await context.close(); return result;
  });
  await check('Large maps keep geometry-cache hits after RGBA buffers are released', async () => {
    const { page, context } = await fixture();
    const result = await page.evaluate(async () => {
      const f = mapFixture, target = document.body.appendChild(document.createElement('div'));
      target.style.cssText = 'width:1100px;height:1100px;background:white';
      f.resetStats();
      const glass = f.runtime.createGlass(target, { width: 1030, height: 1024, radius: 48, mapScale: 1, sync: true });
      glass.update({ width: 1031 }); glass.update({ width: 1032 }); await f.settle();
      const filled = f.stats.encodes;
      glass.update({ width: 1030 }); await f.settle();
      const reused = f.stats.encodes; glass.destroy(); target.remove();
      return { filled, reused, generatedRGBABytes: (1030 + 1031 + 1032) * 1024 * 4 };
    });
    assert.equal(result.filled, 3); assert.equal(result.reused, 3);
    await context.close(); return result;
  });
  await check('Pending decode ordering, first render and destruction', async () => {
    const { page, context } = await fixture();
    const result = await page.evaluate(async () => {
      const f = mapFixture, target = document.body.appendChild(document.createElement('div'));
      target.style.cssText = 'width:270px;height:100px;background:white';
      f.hold(true); f.resetStats();
      const glass = f.runtime.createGlass(target, { width: 113.25, height: 41.5, radius: 17.75, mapScale: 1, sync: true });
      const firstUnfiltered = target.style.filter === '';
      glass.update({ width: 113.25 + 1e-10 });
      const sharedPending = f.gates.length === 1 && f.stats.decodes === 1;
      glass.update({ width: 118.75 });
      f.gates[1].resolve(); await new Promise((r) => setTimeout(r, 60));
      const newer = document.querySelector(`#${glass.filterId} feImage`).getAttribute('href');
      f.gates[0].resolve(); await f.settle();
      const preserved = document.querySelector(`#${glass.filterId} feImage`).getAttribute('href') === newer;
      glass.update({ width: 137.75 });
      const filter = document.getElementById(glass.filterId); glass.destroy();
      f.gates[2].resolve(); await f.settle();
      const destroyed = !filter.isConnected && target.style.filter === '';
      f.hold(false); target.remove(); return { firstUnfiltered, sharedPending, preserved, destroyed };
    });
    assert.deepEqual(result, { firstUnfiltered: true, sharedPending: true, preserved: true, destroyed: true });
    await context.close(); return result;
  });
  await check('Hidden, offscreen, resize, reconnect and fallback paths', async () => {
    const { page, context } = await fixture();
    const result = await page.evaluate(async () => {
      const f = mapFixture, target = document.body.appendChild(document.createElement('div'));
      target.style.cssText = 'width:149px;height:61px;background:white';
      let glass = f.runtime.createGlass(target, { fit: true, clip: true, sync: true }); await f.settle();
      glass.update({ hidden: true }); const hidden = target.style.filter === '';
      target.style.width = '173px'; target.style.transform = 'translateY(2000px)';
      await new Promise((r) => setTimeout(r, 60)); glass.update({ hidden: false }); await f.settle();
      const resized = glass.params.width === 173 && !!target.style.filter;
      glass.destroy(); target.remove(); document.body.appendChild(target);
      glass = f.runtime.createGlass(target, { fit: true, sync: true, mapScale: 0.75 }); await f.settle();
      const reconnected = !!target.style.filter; glass.destroy();
      glass = f.runtime.createGlass(target, { mode: 'backdrop', fit: true, sync: true }); await f.settle();
      const backdrop = f.runtime.engine === 'blink' ? target.style.backdropFilter.startsWith('url(') : target.style.backdropFilter.includes('blur');
      glass.destroy(); target.remove(); return { hidden, resized, reconnected, backdrop };
    });
    assert.deepEqual(result, { hidden: true, resized: true, reconnected: true, backdrop: true });
    await context.close(); return result;
  });

  }
  if (process.argv.includes('--visual')) {
    const configurations = [
      { width: 1280, height: 900, dpr: 1 }, { width: 1280, height: 900, dpr: 2 },
      { width: 390, height: 844, dpr: 1 }, { width: 390, height: 844, dpr: 2 },
      { width: 390, height: 844, dpr: 1.25 }, { width: 390, height: 844, dpr: 2, motion: 'reduce' },
    ];
    for (const config of configurations) await check(`Rendered comparison ${JSON.stringify(config)}`, async () => {
      const options = { viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.dpr, reducedMotion: config.motion ?? 'no-preference' };
      const original = await fixture(oldSource, options), candidate = await fixture(source, options);
      const pages = [original.page, candidate.page], errors = [];
      pages.forEach((page) => page.on('pageerror', (error) => errors.push(String(error))));
      const states = [];
      for (const state of ['idle', 'pressed', 'moving', 'settled', 'rapid']) {
        const images = [];
        for (const page of pages) {
          await page.bringToFront();
          await page.goto('about:blank');
          await page.setContent(frameDocument(page === pages[0] ? oldSource : source));
          await page.evaluate(async (state) => { await mapFixture.ready; await mapFixture.action(state); }, state);
          await page.waitForTimeout(320);
          await page.evaluate(() => mapFixture.flush());
          await page.waitForTimeout(50);
          const box = await page.locator('#fixture').boundingBox();
          images.push(await page.screenshot({ clip: box }));
        }
        const delta = await pages[0].evaluate(async (urls) => {
          const buffers = [];
          for (const url of urls) {
            const img = new Image(); img.src = url; await img.decode();
            const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0); buffers.push(ctx.getImageData(0, 0, img.width, img.height));
          }
          let maxDelta = 0, changedPixels = 0;
          const [a, b] = buffers;
          if (a.width !== b.width || a.height !== b.height) throw new Error('Capture sizes differ');
          for (let i = 0; i < a.data.length; i += 4) { let changed = false; for (let j = 0; j < 4; j++) { const d = Math.abs(a.data[i+j] - b.data[i+j]); maxDelta = Math.max(maxDelta, d); changed ||= d !== 0; } changedPixels += Number(changed); }
          return { width: a.width, height: a.height, maxDelta, changedPixels };
        }, images.map((buffer) => `data:image/png;base64,${buffer.toString('base64')}`));
        if (out) images.forEach((buffer, i) => writeFileSync(`${out}/${evidence.engine}-${config.width}-dpr${config.dpr}-${config.motion ?? 'normal'}-${state}-${i ? 'candidate' : 'original'}.png`, buffer));
        states.push({ state, ...delta });
        const threshold = isFirefox ? 0 : 1;
        assert.ok(delta.maxDelta <= threshold, `${state}, threshold ${threshold}: ${JSON.stringify(delta)}`);
      }
      await pages[0].goto('about:blank');
      await pages[0].setContent(comparisonDocument(source));
      await pages[0].evaluate(() => mapReview.ready);
      const counts = await pages[0].evaluate(() => mapReview.measure());
      assert.deepEqual(errors, []);
      const result = { ...config, threshold: isFirefox ? 0 : 1, states, counts, errors }; evidence.visuals.push(result);
      await original.context.close(); await candidate.context.close(); return result;
    });
  }
} finally {
  await browser.close();
  if (out) writeFileSync(`${out}/${evidence.engine}${evidence.baseline ? '-baseline-control' : ''}.json`, JSON.stringify(evidence, null, 2) + '\n');
}
