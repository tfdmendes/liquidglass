import { loadPlaywright, launchOptions } from '../review/browser-runtime.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, sep } from 'node:path';
import { after, before, test } from 'node:test';

const playwright = await loadPlaywright();
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
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  url = `http://127.0.0.1:${server.address().port}/tests/fixtures/navbar.html`;
  browser = await playwright[engine].launch(launchOptions(engine));
});
after(async () => {
  await browser?.close();
  await new Promise((done) => server.close(done));
});

async function open(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 700, height: 700 }, reducedMotion: 'no-preference', ...options });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'No browser errors'));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#navigation').glass?.filterId);
  await settle(page);
  return page;
}

async function settle(page, id = 'navigation') {
  await page.waitForFunction((id) => {
    const c = document.getElementById(id);
    return c.xs.value === c.xs.target && c.ps.value === c.ps.target && c.ss.value === c.ss.target;
  }, id);
}

async function grab(page, id = 'navigation', index = 0, inset = 15) {
  const item = page.locator(`#${id} > a, #${id} > button`).nth(index);
  const box = await item.boundingBox();
  const point = { x: box.x + inset, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);
  await settle(page, id);
  await page.mouse.down();
  return point;
}

test('press lifts the lens, drag keeps the grab offset and fixed labels, release selects without navigation', async (t) => {
  const page = await open(t);
  const start = await grab(page);
  await page.waitForFunction(() => document.querySelector('#navigation').press > 0.95);
  const pressed = await page.locator('#navigation').evaluate((c) => ({ p: c.glass.params, g: c.geometry(), labels: [...c.copy.children].map((n) => n.getBoundingClientRect().x), original: c.metrics[0] }));
  assert(pressed.g.h > pressed.original.h);
  assert(pressed.g.y < 0);
  assert(pressed.p.refraction > 8);
  assert.equal(pressed.p.x, pressed.g.x + 16);
  assert.equal(pressed.p.y, pressed.g.y + 16);
  await page.mouse.move(start.x + 130, start.y, { steps: 8 });
  const during = await page.locator('#navigation').evaluate((c) => ({ x: c.x, current: c.current, labels: [...c.copy.children].map((n) => n.getBoundingClientRect().x), origin: c.gesture.origin, captured: c.gesture.link.hasPointerCapture(c.gesture.id) }));
  assert.equal(during.x, during.origin + 130);
  assert.equal(during.current, 0);
  assert.deepEqual(during.labels, pressed.labels);
  assert(during.captured);
  await page.mouse.up();
  await settle(page);
  assert.deepEqual(await page.evaluate(() => changes), [{ id: 'navigation', index: 1, value: '#months', item: 'Months' }]);
  assert.deepEqual(await page.evaluate(() => activations), []);
  assert.equal(new URL(page.url()).hash, '');
  assert.equal(await page.locator('#navigation > [aria-current="page"]').textContent(), 'Months');
  assert.equal(await page.locator('#navigation').evaluate((c) => c.glass.params.refraction), 8);
});

test('native click, keyboard activation, form submit and programmatic selection keep their contracts', async (t) => {
  const page = await open(t);
  await page.locator('#navigation > a').nth(1).click();
  assert.equal(new URL(page.url()).hash, '#months');
  assert.equal(await page.locator('#navigation').evaluate((c) => c.current), 1);
  assert.equal(await page.evaluate(() => changes.length), 1);
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Library');
  assert.equal(await page.locator('#navigation').evaluate((c) => c.current), 1);
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#library');
  await page.keyboard.press('End');
  await page.keyboard.press(' ');
  assert.equal(await page.locator('#navigation').evaluate((c) => c.current), 2);
  await page.locator('#form > button').nth(1).click();
  assert.equal(await page.evaluate(() => submits), 1);
  const count = await page.evaluate(() => changes.length);
  await page.locator('#navigation').evaluate((c) => { c.setCurrent(1); c.setCurrent(1, { emit: true }); });
  assert.equal(await page.evaluate(() => changes.length), count);
  await page.locator('#navigation').evaluate((c) => c.setCurrent(0, { emit: true }));
  assert.equal(await page.evaluate(() => changes.length), count + 1);
});

test('modified, middle, target and download links retain native defaults and do not change current', async (t) => {
  const page = await open(t);
  const defaults = await page.locator('#navigation > a').nth(1).evaluate((link) => {
    const results = [];
    link.addEventListener('click', (e) => { results.push(!e.defaultPrevented); e.preventDefault(); });
    for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, [modifier]: true }));
    link.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
    return { results, current: link.parentElement.current };
  });
  assert.deepEqual(defaults, { results: [true, true, true, true], current: 0 });
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('#native > a').nth(1).click()]);
  await popup.waitForLoadState();
  assert.equal(new URL(popup.url()).hash, '#new-tab');
  await popup.close();
  const download = await Promise.all([page.waitForEvent('download'), page.locator('#native > a').nth(2).click()]);
  assert.equal(download[0].suggestedFilename(), 'navbar.html');
  assert.equal(await page.locator('#native').evaluate((c) => c.current), 0);
});

test('trusted middle clicks open enabled links but never disabled items or groups', async (t) => {
  const page = await open(t);
  const context = page.context();
  const [enabled] = await Promise.all([context.waitForEvent('page'), page.locator('#navigation > a').nth(1).click({ button: 'middle' })]);
  await enabled.close();
  const popups = [];
  context.on('page', (popup) => { popups.push(popup); });
  await page.locator('#disabled-items > a').nth(1).click({ button: 'middle', force: true });
  await page.locator('#navigation').evaluate((c) => c.setAttribute('disabled', ''));
  await page.locator('#navigation > a').nth(1).click({ button: 'middle', force: true });
  await page.waitForTimeout(200);
  assert.equal(popups.length, 0);
  assert.equal(await page.evaluate(() => changes.length), 0);
});

test('consumer click cancellation is honored after target and ancestor listeners finish', async (t) => {
  const page = await open(t);
  await page.locator('#navigation > a').nth(1).click();
  assert.equal(await page.locator('#navigation').evaluate((c) => c.current), 1);
  await page.locator('#navigation > a').first().evaluate((link) => {
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  });
  await page.locator('#navigation > a').first().click();
  assert.equal(await page.locator('#navigation').evaluate((c) => c.current), 1);
  assert.equal(new URL(page.url()).hash, '#months');
  await page.evaluate(() => document.addEventListener('click', (event) => event.preventDefault(), { once: true }));
  await page.locator('#navigation > button').click();
  assert.equal(await page.locator('#navigation').evaluate((c) => c.current), 1);
  assert.equal(await page.evaluate(() => changes.length), 1);
});

for (const kind of ['pointercancel', 'lostcapture', 'escape', 'blur', 'resize', 'disable', 'item-disable', 'scroll', 'vertical', 'outside', 'remove']) {
  test(`${kind} cancels without committing or activating a link`, async (t) => {
    const page = await open(t);
    const start = await grab(page);
    if (kind === 'vertical') await page.mouse.move(start.x + 2, start.y + 20);
    else {
      await page.mouse.move(start.x + 130, start.y, { steps: 5 });
      if (kind === 'escape') await page.keyboard.press('Escape');
      else if (kind === 'resize') await page.setViewportSize({ width: 740, height: 700 });
      else if (kind === 'outside') await page.mouse.move(start.x + 130, start.y + 100);
      else await page.locator('#navigation').evaluate((c, kind) => {
        if (kind === 'pointercancel') c.dispatchEvent(new PointerEvent('pointercancel', { pointerId: c.gesture.id }));
        if (kind === 'lostcapture') c.gesture.link.releasePointerCapture(c.gesture.id);
        if (kind === 'blur') window.dispatchEvent(new Event('blur'));
        if (kind === 'disable') c.setAttribute('disabled', '');
        if (kind === 'item-disable') c.links[1].setAttribute('aria-disabled', 'true');
        if (kind === 'scroll') window.dispatchEvent(new Event('scroll'));
        if (kind === 'remove') { window.detached = c; c.remove(); }
      }, kind);
    }
    await page.mouse.move(start.x + 131, kind === 'outside' ? start.y + 101 : start.y);
    await page.mouse.up();
    if (kind === 'remove') await page.evaluate(() => document.querySelector('main').prepend(detached));
    await settle(page);
    assert.equal(await page.locator('#navigation').evaluate((c) => c.current), 0);
    assert.equal(await page.locator('#navigation').evaluate((c) => c.gesture), null);
    assert.deepEqual(await page.evaluate(() => changes), []);
    assert.deepEqual(await page.evaluate(() => activations), []);
    assert.equal(new URL(page.url()).hash, '');
  });
}

test('disabled entries are skipped, host disable blocks navigation and native tab stops return on enable', async (t) => {
  const page = await open(t);
  await page.locator('#disabled-items > a').first().focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Finish');
  await page.locator('#disabled-items > a').nth(1).click({ force: true });
  assert.equal(new URL(page.url()).hash, '');
  await page.locator('#navigation').evaluate((c) => c.setAttribute('disabled', ''));
  await page.locator('#navigation > a').nth(1).click({ force: true });
  assert.equal(new URL(page.url()).hash, '');
  assert.deepEqual(await page.locator('#navigation').evaluate((c) => c.links.map((link) => link.tabIndex)), [-1, -1, -1]);
  await page.locator('#navigation').evaluate((c) => c.removeAttribute('disabled'));
  assert.deepEqual(await page.locator('#navigation').evaluate((c) => c.links.map((link) => link.tabIndex)), [0, 0, 0]);
  const start = await grab(page, 'disabled-items');
  await page.mouse.move(start.x + 180, start.y, { steps: 8 });
  await page.mouse.up();
  await settle(page, 'disabled-items');
  assert.equal(await page.locator('#disabled-items').evaluate((c) => c.current), 3);
});

test('reduced motion keeps drag direct, suppresses enlargement and settles release immediately', async (t) => {
  const page = await open(t, { reducedMotion: 'reduce' });
  const start = await grab(page);
  await page.mouse.move(start.x + 130, start.y, { steps: 3 });
  const geometry = await page.locator('#navigation').evaluate((c) => ({ g: c.geometry(), expected: c.metrics[0].h, optics: c.glass.params.refraction }));
  assert.equal(geometry.g.h, geometry.expected);
  assert.equal(geometry.g.p, 0);
  assert.equal(geometry.optics, 8);
  await page.mouse.up();
  assert.equal(await page.locator('#navigation').evaluate((c) => c.xs.value === c.xs.target), true);
  assert.equal(await page.locator('#navigation').evaluate((c) => c.current), 1);
  await page.emulateMedia({ forcedColors: 'active' });
  assert.equal(await page.locator('#navigation .lg-nav__copy').evaluate((copy) => getComputedStyle(copy).display), 'none');
  assert.equal(await page.locator('#navigation > [aria-current="page"]').evaluate((item) => getComputedStyle(item).outlineStyle), 'solid');
});

test('trusted horizontal touch selects while vertical touch scroll cancels without navigation', { skip: engine !== 'chromium' }, async (t) => {
  const page = await open(t, { hasTouch: true, isMobile: true });
  const cdp = await page.context().newCDPSession(page);
  const box = await page.locator('#navigation > a').first().boundingBox();
  const x = box.x + 20, y = box.y + box.height / 2;
  const touch = (type, px, py) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py, id: 1 }] });
  await touch('touchStart', x, y);
  for (const dx of [10, 35, 70, 100, 130]) await touch('touchMove', x + dx, y);
  await touch('touchEnd');
  await settle(page);
  assert.equal(await page.locator('#navigation').evaluate((c) => c.current), 1);
  assert.equal(new URL(page.url()).hash, '');
  await touch('touchStart', x + 130, y);
  for (const dy of [12, 40, 80, 120]) await touch('touchMove', x + 130, y - dy);
  await touch('touchEnd');
  await page.waitForFunction(() => scrollY > 0);
  assert.equal(await page.locator('#navigation').evaluate((c) => c.gesture), null);
  assert.equal(await page.evaluate(() => changes.length), 1);
});

test('motion preference changes cancel, RTL and scaled layouts preserve drag geometry', async (t) => {
  const page = await open(t);
  const start = await grab(page);
  await page.mouse.move(start.x + 130, start.y);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(start.x + 131, start.y);
  await page.mouse.up();
  assert.equal(await page.locator('#navigation').evaluate((c) => c.current), 0);
  await page.locator('#navigation').evaluate((c) => { c.dir = 'rtl'; c.style.transformOrigin = 'left top'; c.style.transform = 'scale(.8)'; c.refresh(); });
  await settle(page);
  const rtlStart = await grab(page);
  const target = await page.locator('#navigation > a').nth(1).boundingBox();
  await page.mouse.move(target.x + 15, rtlStart.y, { steps: 8 });
  await page.mouse.up();
  assert.equal(await page.locator('#navigation').evaluate((c) => c.current), 1);
  assert.equal(await page.locator('#navigation').evaluate((c) => Math.abs(c.copy.children[1].getBoundingClientRect().x - c.links[1].getBoundingClientRect().x) < .02), true);
});

test('indicator optics update separately, refresh aligns copies, and empty/reconnected navbars remain valid', async (t) => {
  const page = await open(t);
  const values = await page.locator('#navigation').evaluate((c) => {
    c.setAttribute('indicator-refraction', '6');
    c.setAttribute('indicator-specular', '0.2');
    c.setAttribute('indicator-blur', '2');
    c.removeAttribute('indicator-blur');
    c.setAttribute('refraction', '22');
    c.links[1].textContent = 'Updated months';
    c.refresh();
    return { indicator: c.glass.params.refraction, body: c.surface.glass.params.refraction, specular: c.glass.params.specular, blur: c.glass.params.blur, dx: c.copy.children[1].getBoundingClientRect().x - c.links[1].getBoundingClientRect().x };
  });
  assert.deepEqual(values, { indicator: 6, body: 22, specular: 0.2, blur: 0, dx: 0 });
  assert.equal(await page.locator('#empty').evaluate((c) => c.copy.style.filter), '');
  assert.equal(await page.locator('#empty').evaluate((c) => c.shadow.style.opacity), '0');
  const start = await grab(page);
  await page.mouse.move(start.x + 70, start.y);
  await page.locator('#navigation').evaluate((c) => { c.remove(); document.querySelector('main').prepend(c); });
  await page.mouse.up();
  await settle(page);
  assert.equal(await page.locator('#navigation').evaluate((c) => c.geometry().p), 0);
});

test('release passes live velocity into the spring and an interrupted snap starts at its visible position', async (t) => {
  const page = await open(t);
  const result = await page.locator('#navigation').evaluate((c) => {
    const make = (type, x, time) => ({ type, target: c.links[0], isPrimary: true, button: 0, pointerId: 99, clientX: c.getBoundingClientRect().left + x, clientY: c.getBoundingClientRect().top + 20, timeStamp: time });
    const capture = c.links[0].setPointerCapture;
    c.links[0].setPointerCapture = () => {};
    c.beginDrag(make('pointerdown', 20, 100));
    c.moveDrag(make('pointermove', 110, 130));
    const before = { x: c.x, velocity: c.v };
    const set = c.xs.set;
    let releaseVelocity;
    c.xs.set = (target, options) => { if (!options?.immediate) releaseVelocity = options?.velocity; return set(target, options); };
    c.endDrag(make('pointerup', 110, 130));
    c.xs.set = set;
    c.links[0].setPointerCapture = capture;
    return { before, afterX: c.x, releaseVelocity };
  });
  assert.equal(result.afterX, result.before.x);
  assert.equal(result.releaseVelocity, result.before.velocity);
  assert(result.releaseVelocity > 0);
  await page.locator('#navigation').evaluate((c) => { c.xs.set(50, { immediate: true }); c.xs.set(c.metrics[1].x); });
  const point = await page.locator('#navigation').evaluate((c) => ({ x: c.getBoundingClientRect().left + c.x + 20, y: c.getBoundingClientRect().top + 20 }));
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  const caught = await page.locator('#navigation').evaluate((c) => ({ x: c.x, origin: c.gesture.origin }));
  assert.equal(caught.x, caught.origin);
  await page.mouse.up();
});
