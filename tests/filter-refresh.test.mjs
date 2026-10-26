import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { holdImageDecodes } from './helpers/hold-image-decodes.mjs';

const { chromium, firefox } = await import(process.env.LG_PLAYWRIGHT_MODULE || 'playwright');
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
  ['blink', chromium, process.env.LG_CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  ['gecko', firefox, process.env.LG_FIREFOX_EXECUTABLE, firefoxUA],
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
}

test('unknown engines retain settling and cancel it on destroy', async (t) => {
  const page = await open(t, chromium, process.env.LG_CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'UnknownValidation/1.0');
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
