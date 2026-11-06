import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { loadPlaywright, launchOptions } from '../review/browser-runtime.mjs';
import { serveShowcase } from '../scripts/serve-showcase.mjs';

const { server, url, directory } = await serveShowcase();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch(launchOptions('chromium'));
const output = process.env.LG_SHOWCASE_EVIDENCE || '/tmp/liquidglass-showcase-checks';
mkdirSync(output, { recursive: true });
const results = { browser: browser.version(), layouts: [], checks: [] };
const lifecycleOnly = process.argv.includes('--lifecycle-only');
try {
  for (const path of ['showcase/builds', 'showcase/media', 'showcase/LICENSE']) assert(!existsSync(path), `Generated files belong in dist: ${path}`);
  const manifest = JSON.parse(readFileSync(join(directory, 'builds/manifest.json'), 'utf8'));
  for (const name of ['original', 'previous', 'current']) for (const file of ['liquid-glass.js', 'components.js', 'glass-webgl.js']) {
    const contents = readFileSync(join(directory, `builds/${name}/${file}`));
    assert.equal(createHash('sha256').update(contents).digest('hex'), manifest.builds[name].sha256[file]);
    if (name === 'current') assert.deepEqual(contents, readFileSync(`lib/${file}`));
  }
  assert.notEqual(manifest.builds.previous.sha256['liquid-glass.js'], manifest.builds.current.sha256['liquid-glass.js']);
  const recorded = JSON.parse(readFileSync('showcase/recorded-fps.json', 'utf8'));
  for (const [build, hashes] of Object.entries(recorded.sourceSHA256)) assert.deepEqual(hashes, manifest.builds[build].sha256);
  assert(recorded.configurations.every(item => !('trials' in item)));
  assert(readFileSync('showcase/recorded-fps.json').length < 15000);
  for (const path of ['docs/performance/raster-results.json', 'docs/performance/raster-spans-results.json']) {
    const summary = JSON.parse(readFileSync(path, 'utf8'));
    assert(!('samples' in summary));
    assert(summary.sampleCount > 0 && summary.summary.length > 0);
  }
  results.checks.push('All snapshot hashes match; current source equals lib; previous core differs');
  results.checks.push('Generated duplicates stay outside source; recorded data contains compact summaries');
  const original = await browser.newPage();
  await original.goto(`${url}/scene.html?build=original`);
  await original.waitForFunction(() => window.sceneReady);
  await original.evaluate(() => sceneReady);
  for (const renderer of ['svg', 'webgl']) {
    await original.evaluate(renderer => scene.configure({ renderer, count: 4 }), renderer);
    const sample = await original.evaluate(() => scene.run({ durationMs: 250, warmupMs: 100, refreshMs: 16.7 }));
    assert.equal(sample.build, 'original');
    assert(sample.frames > 0);
  }
  await original.close();
  results.checks.push('Generated original build renders and animates with SVG and WebGL');
  for (const width of lifecycleOnly ? [] : [1440, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(url);
      await page.waitForFunction(() => window.comparison && [...document.querySelectorAll('.preview-build iframe')].every(frame => frame.contentWindow.scene));
      await page.evaluate(() => Promise.all([...document.querySelectorAll('.preview-build iframe')].map(frame => frame.contentWindow.sceneReady)));
      await page.waitForTimeout(1200);
      const geometry = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
        headingWidth: document.querySelector('h1').getBoundingClientRect().width,
        previews: [...document.querySelectorAll('.preview-build iframe')].map(frame => ({ build: frame.contentWindow.scene.build, renderer: frame.contentWindow.scene.settings.renderer })) }));
      assert(geometry.scroll <= geometry.client, `Painted overflow at ${width}: ${JSON.stringify(geometry)}`);
      await page.screenshot({ path: `${output}/${width}-page.png`, fullPage: true });
      await page.locator('[data-backdrop="wave"]').click();
      await page.waitForFunction(() => [...document.querySelectorAll('.preview-build iframe')].every(frame => frame.contentWindow.scene.settings.backdrop === 'wave'));
      await page.selectOption('#renderer', 'webgl');
      await page.waitForFunction(() => [...document.querySelectorAll('.preview-build iframe')].every(frame => frame.contentWindow.scene.settings.renderer === 'webgl'));
      await page.waitForTimeout(500);
      await page.selectOption('#renderer', 'svg');
      if (width === 1440) {
        await page.click('#run-benchmark-inline');
        await page.waitForFunction(() => comparison.measuring);
        await page.click('#cancel-benchmark');
        await page.waitForFunction(() => !comparison.measuring, null, { timeout: 3000 });
        assert.match(await page.locator('#status').textContent(), /cancelled/);
        await page.click('#run-benchmark-inline');
        await page.waitForFunction(() => comparison.measuring);
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          dispatchEvent(new Event('visibilitychange'));
        });
        await page.waitForFunction(() => !comparison.measuring, null, { timeout: 3000 });
        assert.match(await page.locator('#status').textContent(), /hidden/);
        await page.evaluate(() => { delete document.hidden; });
        await page.click('#run-benchmark-inline');
        await page.waitForFunction(() => comparison.measuring);
        await page.setViewportSize({ width: 1430, height: 900 });
        await page.waitForFunction(() => !comparison.measuring, null, { timeout: 3000 });
        assert.match(await page.locator('#status').textContent(), /resized/);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.click('#run-benchmark-inline');
        await page.waitForFunction(() => comparison.measuring);
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await page.waitForFunction(() => !comparison.measuring, null, { timeout: 3000 });
        assert.match(await page.locator('#status').textContent(), /fully visible/);
        await page.selectOption('#density', '4');
        await page.click('#run-benchmark-inline');
        await page.waitForFunction(() => comparison.report && !comparison.measuring, null, { timeout: 75000 });
        const report = await page.evaluate(() => comparison.report);
        assert.equal(report.trials.length, 6);
        assert.deepEqual(report.builds, ['previous', 'current']);
        for (const trial of report.trials) {
          assert.equal(trial.visibility, 'visible');
          assert(trial.frames > 10 && trial.fps > 0 && trial.fps < 1000);
        }
        assert.equal(await page.locator('#result-rows tr').count(), 2);
        const download = page.waitForEvent('download');
        await page.click('#download-results');
        const path = `${output}/download.json`;
        await (await download).saveAs(path);
        assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), report);
        results.checks.push('Real full UI run: 6 sequential trials, populated results and exact downloaded JSON');
        results.checks.push('Cancellation, real viewport resize, scroll-out and synthetic visibility invalidation recover without partial reports');
        await page.screenshot({ path: `${output}/completed-page.png`, fullPage: true });
      }
      if (width === 390) {
        await page.click('#run-benchmark-inline');
        await page.waitForFunction(() => comparison.measuring);
        const visible = await page.locator('#benchmark-stage').boundingBox();
        assert(visible.y >= 0 && visible.y + visible.height <= 844);
        await page.click('#cancel-benchmark');
        await page.waitForFunction(() => !comparison.measuring, null, { timeout: 3000 });
        results.checks.push('Phone benchmark centers the complete scene before sampling');
      }
      assert.deepEqual(errors, []);
      results.layouts.push({ width, ...geometry, errors });
      console.log(`PASS showcase at ${width}px: no overflow, backdrop and renderer switches`);
    } finally { await page.close(); }
  }
  const reduced = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await reduced.goto(url);
  await reduced.waitForFunction(() => window.comparison);
  assert.match(await reduced.locator('#preview-toggle').textContent(), /Play preview/);
  await reduced.screenshot({ path: `${output}/390-reduced.png`, fullPage: true });
  await reduced.close();
  results.checks.push('Reduced motion keeps previews paused and content available');
  const delayed = await browser.newPage();
  await delayed.route('**/builds/*/liquid-glass.js', async route => { await new Promise(resolve => setTimeout(resolve, 700)); await route.continue(); });
  await delayed.goto(url, { waitUntil: 'domcontentloaded' });
  await delayed.waitForFunction(() => window.comparison);
  await delayed.click('#preview-toggle');
  await delayed.waitForFunction(() => [...document.querySelectorAll('.preview-build iframe')].every(frame => frame.contentWindow.scene));
  await delayed.waitForTimeout(1500);
  assert.deepEqual(await delayed.locator('.live-fps output').allTextContents(), ['—', '—']);
  await delayed.close();
  results.checks.push('Pause during delayed module loading prevents late preview startup');
  const race = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await race.goto(url);
  await race.waitForFunction(() => [...document.querySelectorAll('.live-fps output')].every(output => output.textContent !== '—'));
  await race.evaluate(() => {
    const win = document.querySelector('#preview-previous').contentWindow;
    const decode = win.HTMLImageElement.prototype.decode;
    win.HTMLImageElement.prototype.decode = function (...args) {
      const loaded = decode.apply(this, args);
      if (!this.src.endsWith('/media/city.jpg')) return loaded;
      return Promise.all([loaded, new Promise(resolve => {
        win.resizeReleases ??= [];
        win.resizeReleases.push(resolve);
        win.releaseResizeDecode = resolve;
      })]);
    };
    const frame = win.requestAnimationFrame;
    win.frameRequests = 0;
    win.requestAnimationFrame = function (callback) { win.frameRequests++; return frame.call(this, callback); };
  });
  await race.setViewportSize({ width: 1190, height: 900 });
  await race.waitForFunction(() => document.querySelector('#preview-previous').contentWindow.releaseResizeDecode);
  await race.setViewportSize({ width: 1180, height: 900 });
  await race.waitForFunction(() => document.querySelector('#preview-previous').contentWindow.resizeReleases.length >= 2);
  await race.evaluate(() => {
    const win = document.querySelector('#preview-previous').contentWindow;
    win.frameRequests = 0; win.resizeReleases.forEach(release => release());
  });
  await race.waitForFunction(() => document.querySelector('#preview-previous').contentWindow.frameRequests > 5, null, { timeout: 3000 });
  await race.evaluate(() => { document.querySelector('#preview-previous').contentWindow.releaseResizeDecode = null; });
  await race.setViewportSize({ width: 1170, height: 900 });
  await race.waitForFunction(() => document.querySelector('#preview-previous').contentWindow.releaseResizeDecode);
  await race.click('#preview-toggle');
  await race.evaluate(() => document.querySelector('#preview-previous').contentWindow.releaseResizeDecode());
  await race.waitForTimeout(400);
  await race.evaluate(() => { document.querySelector('#preview-previous').contentWindow.frameRequests = 0; });
  await race.waitForTimeout(400);
  assert.equal(await race.evaluate(() => document.querySelector('#preview-previous').contentWindow.frameRequests), 0);
  await race.click('#preview-toggle');
  await race.evaluate(() => { document.querySelector('#preview-previous').contentWindow.releaseResizeDecode = null; });
  await race.setViewportSize({ width: 1160, height: 900 });
  await race.waitForFunction(() => document.querySelector('#preview-previous').contentWindow.releaseResizeDecode);
  await race.click('#run-benchmark-inline');
  await race.waitForFunction(() => comparison.measuring);
  await race.evaluate(() => {
    const win = document.querySelector('#preview-previous').contentWindow;
    win.frameRequests = 0; win.releaseResizeDecode();
  });
  await race.waitForTimeout(400);
  assert.equal(await race.evaluate(() => document.querySelector('#preview-previous').contentWindow.frameRequests), 0);
  await race.click('#cancel-benchmark');
  await race.waitForFunction(() => !comparison.measuring);
  await race.close();
  results.checks.push('Repeated resizes preserve Play; paused or disposed previews cannot restart after a delayed resize decode');
  writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(lifecycleOnly ? 'PASS lifecycle: reduced motion, delayed startup and resize/pause isolation' : 'PASS completed benchmark, cancellation, visibility guard, JSON download and reduced motion');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
