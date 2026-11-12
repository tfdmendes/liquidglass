import { loadPlaywright, executablePath } from '../review/browser-runtime.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { holdImageDecodes } from '../review/hold-image-decodes.mjs';

const { chromium, firefox } = await loadPlaywright();
const source = readFileSync(process.env.LG_LIBRARY_FILE || new URL('../lib/liquid-glass.js', import.meta.url), 'utf8');
const moduleURL = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const firefoxUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0';

async function open(t, type, executablePath, userAgent) {
  const browser = await type.launch({ headless: true, executablePath });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 600, height: 400 }, userAgent });
  await page.setContent('<div id="target" style="width:480px;height:280px;background:repeating-linear-gradient(45deg,#abc 0 10px,#345 10px 20px)">Refracted content</div>');
  await page.evaluate(async (url) => {
    const realTimeout = window.setTimeout;
    window.retryCount = 0;
    window.retriesFired = 0;
    window.setTimeout = (fn, ms, ...args) => {
      if (ms === 60 || ms === 250) {
        window.retryCount++;
        return realTimeout(() => { window.retriesFired++; fn(...args); }, ms);
      }
      return realTimeout(fn, ms, ...args);
    };
    window.library = await import(url);
    window.target = document.querySelector('#target');
    window.glass = library.createGlass(target, { width: 160, height: 90, radius: 40, sync: true, clip: true });
    window.initialFilter = target.style.filter;
  }, moduleURL);
  await page.waitForFunction(() => glass.filterId);
  await page.waitForTimeout(320);
  return page;
}

for (const [engine, type, path, ua] of [
  ['blink', chromium, executablePath('chromium')],
  ['gecko', firefox, executablePath('firefox'), firefoxUA],
]) {
  test(`${engine}: reuse the filter through updates, graph rebuilds and re-show`, async (t) => {
    const page = await open(t, type, path, ua);
    assert.equal(await page.evaluate(() => library.engine), engine);
    assert.equal(await page.evaluate(() => initialFilter), '');
    const id = await page.evaluate(() => glass.filterId);
    await page.evaluate(() => {
      glass.update({ x: 40, refraction: 30 });
      glass.update({ chroma: 0, blur: 2, specular: 0 });
    });
    await page.waitForFunction(() => document.querySelector('feImage')?.getAttribute('href'));
    await page.evaluate(() => {
      glass.update({ hidden: true });
      if (target.style.filter !== '' || target.style.clipPath !== 'inset(50%)') throw Error('Hidden lens remained visible');
      glass.update({ hidden: false });
      for (let i = 0; i < 20; i++) glass.flush();
      glass.update(glass.params);
    });
    assert.equal(await page.evaluate(() => glass.filterId), id);
    assert.equal(await page.evaluate(() => retryCount), 0);
    assert.match(await page.evaluate(() => target.style.filter), new RegExp(id));
    assert.equal(await page.locator('feDisplacementMap').count(), 1);
    assert.equal(await page.locator('feGaussianBlur').count(), 1);
    const scale = await page.locator('feDisplacementMap').getAttribute('scale');
    await page.evaluate(() => { target.style.width = '360px'; });
    await page.waitForFunction((previous) => document.querySelector('feDisplacementMap').getAttribute('scale') !== previous, scale);
    assert.equal(await page.evaluate(() => glass.filterId), id);
  });

  test(`${engine}: delayed maps cannot replace a newer graph or revive a destroyed lens`, async (t) => {
    const page = await open(t, type, path, ua);
    await page.addScriptTag({ content: holdImageDecodes.toString() });
    await page.evaluate(() => {
      window.mapGate = holdImageDecodes();
      glass.update({ width: 171, curvature: 3 });
      glass.update({ width: 172, curvature: 5, chroma: 0, blur: 1, specular: 0 });
    });
    await page.waitForFunction(() => mapGate.releases.length === 2);
    await page.evaluate(() => mapGate.releases[1]());
    await page.waitForFunction(() => glass.params.width === 172 && document.querySelector('feImage').getAttribute('href'));
    const newest = await page.locator('feImage').getAttribute('href');
    await page.evaluate(() => mapGate.releases[0]());
    await page.waitForTimeout(30);
    assert.equal(await page.locator('feImage').getAttribute('href'), newest);
    assert.equal(await page.locator('feDisplacementMap').count(), 1);
    await page.evaluate(() => glass.update({ width: 173, curvature: 6 }));
    await page.waitForFunction(() => mapGate.releases.length === 3);
    await page.evaluate(() => {
      glass.destroy();
      mapGate.releases[2]();
      mapGate.restore();
      glass.flush();
    });
    await page.waitForTimeout(320);
    assert.equal(await page.locator('filter').count(), 0);
    assert.equal(await page.evaluate(() => target.style.filter), '');
    assert.equal(await page.evaluate(() => target.style.clipPath), '');
  });

  test(`${engine}: cached movement updates only changed filter values`, async (t) => {
    const page = await open(t, type, path, ua);
    await page.evaluate(() => {
      glass.update({ blur: 2 });
      window.writes = [];
      window.watch = new MutationObserver((records) => writes.push(...records.map(record => record.attributeName)));
      watch.observe(document.querySelector('filter'), { attributes: true, subtree: true });
      glass.flush();
      glass.update({ x: 0.2, y: 0.2 });
    });
    assert.deepEqual(await page.evaluate(() => writes), []);
    await page.evaluate(() => glass.update({ x: 2.2, y: 1.2 }));
    assert.deepEqual(await page.evaluate(() => [...new Set(writes)].sort()), ['x', 'y']);
    const moved = await page.locator('feImage').evaluate(node => ({
      x: Number(node.getAttribute('x')), y: Number(node.getAttribute('y')),
      width: Number(node.getAttribute('width')), height: Number(node.getAttribute('height')),
    }));
    assert.deepEqual(moved, { x: 2 / 480, y: 1 / 280, width: 160 / 480, height: 90 / 280 });

    await page.evaluate(() => {
      writes.length = 0;
      glass.update({ refraction: 30, chroma: 0.25, blur: 4 });
    });
    assert(await page.evaluate(() => writes.includes('scale') && writes.includes('stdDeviation')));
    const expectedScale = engine === 'gecko' ? 60 / Math.sqrt((480 ** 2 + 280 ** 2) / 2) : 60 / 480;
    assert.deepEqual(await page.locator('feDisplacementMap').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('scale')))),
      [expectedScale, expectedScale * 1.125, expectedScale * 1.25]);
    assert.equal(await page.locator('feGaussianBlur').getAttribute('stdDeviation'), `${4 / 480} ${4 / 280}`);

    await page.evaluate(() => { target.style.width = '360px'; target.style.height = '240px'; });
    await page.waitForFunction(() => Number(document.querySelector('feImage').getAttribute('width')) === 160 / 360);
    assert.equal(Number(await page.locator('feImage').getAttribute('height')), 90 / 240);
    assert.equal(await page.locator('feGaussianBlur').getAttribute('stdDeviation'), `${4 / 360} ${4 / 240}`);

    await page.evaluate(() => {
      glass.update({ chroma: 0, specular: 0, blur: 0 });
      glass.update({ hidden: true });
      glass.update({ hidden: false });
    });
    await page.waitForFunction(() => document.querySelector('feImage')?.getAttribute('href'));
    assert.equal(await page.locator('feDisplacementMap').count(), 1);
    assert.equal(await page.locator('feGaussianBlur').count(), 0);
    assert.equal(Number(await page.locator('feImage').getAttribute('x')), 2 / 360);
    assert.equal(Number(await page.locator('feImage').getAttribute('width')), 160 / 360);
    const restoredScale = engine === 'gecko' ? 60 / Math.sqrt((360 ** 2 + 240 ** 2) / 2) : 60 / 360;
    assert.equal(Number(await page.locator('feDisplacementMap').getAttribute('scale')), restoredScale);
    assert(await page.evaluate(() => target.style.filter.includes(`#${glass.filterId}`)));
    assert.notEqual(await page.evaluate(() => target.style.clipPath), 'inset(50%)');
    await page.evaluate(async () => {
      writes.length = 0;
      glass.flush();
      await Promise.resolve();
      watch.disconnect();
    });
    assert.deepEqual(await page.evaluate(() => writes), []);
  });
}

test('unknown engines retain settling and cancel it on destroy', async (t) => {
  const page = await open(t, chromium, executablePath('chromium'), 'UnknownValidation/1.0');
  assert.equal(await page.evaluate(() => library.engine), 'unknown');
  assert.equal(await page.evaluate(() => retryCount), 2);
  const id = await page.evaluate(() => glass.filterId);
  await page.evaluate(() => glass.update({ x: 35 }));
  assert.notEqual(await page.evaluate(() => glass.filterId), id);
  await page.evaluate(() => glass.update({ width: 174 }));
  await page.waitForFunction(() => retryCount === 4);
  const firedAtDestroy = await page.evaluate(() => {
    glass.destroy();
    return retriesFired;
  });
  await page.waitForTimeout(320);
  assert.equal(await page.locator('filter').count(), 0);
  assert.equal(await page.evaluate(() => target.style.filter), '');
  assert.equal(await page.evaluate(() => retriesFired), firedAtDestroy);
});
