import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, sep } from 'node:path';
import { after, before, test } from 'node:test';

const playwright = await import(process.env.LG_PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.LG_BROWSER || 'chromium';
const root = resolve(new URL('..', import.meta.url).pathname);
const server = createServer((request, response) => {
  const path = resolve(root, `.${new URL(request.url, 'http://localhost').pathname}`);
  if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('content-type', path.endsWith('.html') ? 'text/html' : 'text/javascript');
    response.end(readFileSync(path));
  } catch { response.writeHead(404).end(); }
});
let browser;
let url;

before(async () => {
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  url = `http://127.0.0.1:${server.address().port}/tests/fixtures/segmented.html`;
  browser = await playwright[engine].launch({ headless: true, executablePath: engine === 'firefox'
    ? process.env.LG_FIREFOX_EXECUTABLE : process.env.LG_CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
});
after(async () => {
  await browser?.close();
  await new Promise((done) => server.close(done));
});

async function open(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'no-preference', ...options });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'No browser errors'));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#library').glass?.filterId);
  await page.evaluate(() => {
    window.changes = [];
    document.addEventListener('change', (e) => changes.push({ id: e.target.id, ...e.detail }));
  });
  await settle(page);
  return page;
}

async function settle(page, id = 'library') {
  await page.waitForFunction((id) => {
    const c = document.getElementById(id);
    return c.xs.value === c.xs.target && c.ps.value === c.ps.target;
  }, id);
}

async function grab(page, id = 'library', option = 0, inset) {
  const box = await page.locator(`#${id} > button`).nth(option).boundingBox();
  const point = { x: box.x + (inset ?? box.width / 2), y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  return point;
}

test('click, keyboard, disabled options and group keep radio semantics', async (t) => {
  const page = await open(t);
  await page.locator('#library > button').nth(1).click();
  assert.equal(await page.locator('#library').evaluate((c) => c.value), 'collections');
  assert.equal(await page.evaluate(() => changes.length), 1);
  await page.keyboard.press('Home');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#library').evaluate((c) => c.value), 'library');
  await page.locator('#range > button').first().focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#range').evaluate((c) => c.value), 'month');
  await page.keyboard.press(' ');
  assert.equal(await page.locator('#range > [aria-checked="true"]').count(), 1);
  assert.equal(await page.locator('#disabled').getAttribute('aria-disabled'), 'true');
  assert.deepEqual(await page.locator('#disabled > button').evaluateAll((buttons) => buttons.map((b) => b.tabIndex)), [-1, -1]);
  await page.locator('#disabled > button').last().click({ force: true });
  assert.equal(await page.locator('#disabled').evaluate((c) => c.value), 'a');
});

test('drag follows the grab offset, refracts fixed labels and commits once on release', async (t) => {
  const page = await open(t);
  const start = await grab(page, 'library', 0, 10);
  const before = await page.locator('#library').evaluate((c) => ({ x: c.x, copies: [...c.refract.children].map((n) => n.getBoundingClientRect().x), width: c.glass.params.width }));
  await page.mouse.move(start.x + 65, start.y, { steps: 8 });
  await page.waitForFunction(() => document.querySelector('#library').press > 0.95);
  const during = await page.locator('#library').evaluate((c) => ({ x: c.x, value: c.value, copies: [...c.refract.children].map((n) => n.getBoundingClientRect().x), p: c.glass.params, g: c.geometry(), offset: c.copyOffset.x }));
  assert.equal(during.x, before.x + 65);
  assert.deepEqual(during.copies, before.copies);
  assert.equal(during.value, 'library');
  assert.equal(await page.evaluate(() => changes.length), 0);
  assert(during.p.refraction > 5);
  assert(during.g.h > 64);
  assert(during.p.width > before.width);
  assert.equal(during.p.x, during.g.x - during.offset);
  await page.mouse.move(start.x + 132, start.y, { steps: 6 });
  await page.mouse.up();
  await settle(page);
  assert.equal(await page.locator('#library').evaluate((c) => c.value), 'collections');
  assert.deepEqual(await page.evaluate(() => changes), [{ id: 'library', value: 'collections', index: 1 }]);
  assert.equal(await page.locator('#library').evaluate((c) => c.glass.params.refraction), 5);
});

for (const cancellation of ['pointercancel', 'lostcapture', 'escape', 'blur', 'disable', 'resize', 'remove']) {
  test(`${cancellation} cancels a drag without changing selection`, async (t) => {
    const page = await open(t);
    const start = await grab(page);
    await page.mouse.move(start.x + 132, start.y, { steps: 5 });
    if (cancellation === 'escape') await page.keyboard.press('Escape');
    else if (cancellation === 'resize') await page.setViewportSize({ width: 430, height: 844 });
    else await page.locator('#library').evaluate((c, kind) => {
      if (kind === 'pointercancel') c.dispatchEvent(new PointerEvent('pointercancel', { pointerId: c.gesture.id }));
      if (kind === 'lostcapture') c.releasePointerCapture(c.gesture.id);
      if (kind === 'blur') window.dispatchEvent(new Event('blur'));
      if (kind === 'disable') c.setAttribute('disabled', '');
      if (kind === 'remove') { window.detached = c; c.remove(); }
    }, cancellation);
    await page.mouse.move(start.x + 133, start.y);
    await page.mouse.up();
    if (cancellation === 'remove') {
      assert.equal(await page.evaluate(() => detached.gesture), null);
      await page.evaluate(() => document.querySelector('main').prepend(detached));
    }
    await settle(page);
    assert.equal(await page.locator('#library').evaluate((c) => c.value), 'library');
    assert.equal(await page.locator('#library').evaluate((c) => c.gesture), null);
    assert.equal(await page.evaluate(() => changes.length), 0);
  });
}

test('drag reversals, bounds and an interrupted snap keep their current position', async (t) => {
  const page = await open(t);
  const start = await grab(page);
  await page.mouse.move(start.x + 90, start.y, { steps: 4 });
  await page.mouse.move(start.x + 20, start.y, { steps: 4 });
  assert.equal(await page.locator('#library').evaluate((c) => c.x), 24);
  await page.mouse.move(start.x - 100, start.y, { steps: 4 });
  const x = await page.locator('#library').evaluate((c) => c.x);
  assert(x < 4 && x > -12);
  await page.mouse.move(start.x + 100, start.y, { steps: 4 });
  await page.mouse.up();
  await page.locator('#library').evaluate((c) => { c.xs.set(60, { immediate: true }); c.xs.set(c.metrics[1].x); });
  const point = await page.locator('#library').evaluate((c) => ({ x: c.getBoundingClientRect().x + c.x + 30, y: c.getBoundingClientRect().y + 32 }));
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  const caught = await page.locator('#library').evaluate((c) => ({ x: c.x, origin: c.gesture.origin, target: c.metrics[1].x }));
  assert.equal(caught.x, caught.origin);
  assert.notEqual(caught.x, caught.target);
  await page.mouse.move(point.x - 30, point.y);
  assert.equal(await page.locator('#library').evaluate((c) => c.x), caught.x - 30);
  await page.mouse.up();
  await settle(page);
});

test('unequal widths, RTL and refreshed labels retain copy alignment', async (t) => {
  const page = await open(t);
  await page.locator('#range').evaluate((c) => { c.dir = 'rtl'; c.buttons[2].textContent = 'A full month'; c.refresh(); });
  await settle(page, 'range');
  const start = await grab(page, 'range');
  const last = await page.locator('#range > button').last().boundingBox();
  await page.mouse.move(last.x + last.width / 2, start.y, { steps: 8 });
  await page.mouse.up();
  await settle(page, 'range');
  assert.equal(await page.locator('#range').evaluate((c) => c.value), 'month');
  const aligned = await page.locator('#range').evaluate((c) => c.buttons.every((b, i) => {
    const original = b.getBoundingClientRect(), copy = c.refract.children[i].getBoundingClientRect();
    return Math.abs(original.x - copy.x) < 0.02 && Math.abs(original.width - copy.width) < 0.02 && Math.abs(original.y - copy.y) < 0.02;
  }));
  assert(aligned);
});

test('reduced motion and forced colors keep selection usable without optical motion', async (t) => {
  const page = await open(t, { reducedMotion: 'reduce' });
  const start = await grab(page);
  await page.mouse.move(start.x + 132, start.y, { steps: 6 });
  assert.equal(await page.locator('#library').evaluate((c) => c.geometry().p), 0);
  assert.equal(await page.locator('#library').evaluate((c) => c.geometry().h), 64);
  await page.mouse.up();
  assert.equal(await page.locator('#library').evaluate((c) => c.value), 'collections');
  await page.emulateMedia({ forcedColors: 'active' });
  assert.equal(await page.locator('#library .lg-refract').evaluate((n) => getComputedStyle(n).display), 'none');
  assert.equal(await page.locator('#library > [aria-checked="true"]').evaluate((n) => getComputedStyle(n).outlineStyle), 'solid');
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const again = await grab(page, 'library', 1);
  await page.mouse.move(again.x - 80, again.y);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Chrome can update the media query before delivering its change event
  await page.mouse.move(again.x - 81, again.y);
  await page.waitForFunction(() => !document.querySelector('#library').gesture);
  await page.mouse.up();
  assert.equal(await page.locator('#library').evaluate((c) => c.value), 'collections');
});

test('spring accepts release velocity and leaves no animation work after teardown', async (t) => {
  const page = await open(t);
  const result = await page.evaluate(async () => {
    const { createSpring } = await import('/lib/liquid-glass.js');
    let spring;
    const first = await new Promise((done, reject) => {
      const timeout = setTimeout(() => reject(new Error('Release velocity did not move the spring')), 1000);
      spring = createSpring(100, (value, velocity) => {
        if (value === 100) return;
        clearTimeout(timeout);
        done({ value, velocity });
      });
      spring.set(100, { velocity: 300 });
    });
    spring.stop();
    return first;
  });
  assert(result.value > 100 && result.velocity !== 0);
  const start = await grab(page);
  await page.mouse.move(start.x + 100, start.y);
  await page.locator('#library').evaluate((c) => {
    window.removed = c;
    c.remove();
    window.framesAfterRemoval = 0;
    c.render = () => framesAfterRemoval++;
  });
  await page.mouse.up();
  await page.evaluate(() => new Promise((done) => setTimeout(done, 150)));
  assert.equal(await page.evaluate(() => framesAfterRemoval), 0);
  assert.equal(await page.evaluate(() => removed.glass), null);
});

test('trusted touch drag commits while vertical scrolling cancels', { skip: engine !== 'chromium' }, async (t) => {
  const page = await open(t, { hasTouch: true, isMobile: true });
  const cdp = await page.context().newCDPSession(page);
  const box = await page.locator('#library > button').first().boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const touch = (type, px, py) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py, id: 1 }] });
  await touch('touchStart', x, y);
  for (const dx of [10, 35, 70, 100, 132]) await touch('touchMove', x + dx, y);
  assert.equal(await page.evaluate(() => changes.length), 0);
  await touch('touchEnd');
  await settle(page);
  assert.equal(await page.locator('#library').evaluate((c) => c.value), 'collections');
  await touch('touchStart', x + 132, y);
  for (const dy of [12, 40, 80, 120]) await touch('touchMove', x + 132, y - dy);
  await touch('touchEnd');
  await page.waitForFunction(() => scrollY > 0);
  assert.equal(await page.locator('#library').evaluate((c) => c.gesture), null);
  assert.equal(await page.evaluate(() => changes.length), 1);
});

test('capture a pressed capsule and verify settled idle rendering', async (t) => {
  const page = await open(t);
  const start = await grab(page);
  await page.mouse.move(start.x + 60, start.y, { steps: 6 });
  await page.waitForFunction(() => document.querySelector('#library').press > 0.99);
  if (process.env.LG_EVIDENCE_DIR) {
    mkdirSync(process.env.LG_EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.LG_EVIDENCE_DIR}/${engine}-pressed.png` });
  }
  await page.mouse.up();
  await settle(page);
  await page.evaluate(() => new Promise((done) => setTimeout(done, 320)));
  const mutations = await page.locator('#library').evaluate(async (c) => {
    let count = 0;
    const observer = new MutationObserver((records) => { count += records.length; });
    observer.observe(c, { attributes: true, childList: true, subtree: true });
    await new Promise((done) => setTimeout(done, 100));
    observer.disconnect();
    return count;
  });
  assert.equal(mutations, 0);
});
