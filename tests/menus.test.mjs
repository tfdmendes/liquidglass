import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, sep } from 'node:path';
import { after, before, test } from 'node:test';
import { loadPlaywright, launchOptions } from '../review/browser-runtime.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const playwright = await loadPlaywright();
const engine = process.env.LG_BROWSER || 'chromium';
const server = createServer((request, response) => {
  const path = resolve(root, `.${new URL(request.url, 'http://localhost').pathname}`);
  if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('content-type', path.endsWith('.html') ? 'text/html' : path.endsWith('.js') ? 'text/javascript' : 'image/jpeg');
    response.end(readFileSync(path));
  } catch { response.writeHead(404).end(); }
});
let browser, url;
before(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  url = `http://127.0.0.1:${server.address().port}/tests/fixtures/menus.html`;
  browser = await playwright[engine].launch(launchOptions(engine));
});
after(async () => { await browser?.close(); await new Promise(done => server.close(done)); });

async function open(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, ...options });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#nav').glass?.filterId);
  await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
  return page;
}

async function settle(page, id = 'file') {
  await page.waitForFunction(id => {
    const c = document.getElementById(id);
    return c.os.value === c.os.target && c.ys.value === c.ys.target;
  }, id);
}

test('opening and closing keep a stable optical map instead of encoding each spring frame', async t => {
  const page = await open(t);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.encodes = 0;
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) { encodes++; return original.apply(this, args); };
  });
  await page.locator('#file > button').click();
  await settle(page);
  await page.locator('#file > button').click();
  await settle(page);
  assert(await page.evaluate(() => encodes) <= 2, 'A menu should encode at most its full-size panel map');
  assert.equal(await page.locator('#file .lg-menu__panel').evaluate(n => n.hidden), true);
});

test('pointer switching, keyboard navigation and selection keep menu semantics', async t => {
  const page = await open(t);
  await page.locator('#file > button').focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.value), 'new');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.value), 'open');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#edit > button').getAttribute('aria-expanded'), 'true');
  await page.locator('#view > button').hover();
  assert.equal(await page.locator('#edit > button').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#view > button').getAttribute('aria-expanded'), 'true');
  await page.locator('#file > button').hover();
  await page.evaluate(() => {
    window.selections = [];
    document.addEventListener('select', e => selections.push(e.detail.value));
  });
  await page.locator('#file .lg-menu__items > button').nth(1).click();
  assert.deepEqual(await page.evaluate(() => selections), ['open']);
  assert.equal(await page.locator('#file > button').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#file').trigger), true);
});

test('rapid reversal and disconnect/reconnect leave no stale spring callbacks', async t => {
  const page = await open(t);
  await page.locator('#file > button').click();
  await page.waitForTimeout(70);
  await page.evaluate(() => { const c = document.querySelector('#file'); c.close(); c.show(); });
  await settle(page);
  assert.equal(await page.locator('#file .lg-menu__panel').evaluate(n => n.hidden), false);
  await page.evaluate(() => {
    const c = document.querySelector('#file');
    c.highlight(0);
    c.highlight(3);
    c.close();
    window.removed = c;
    c.remove();
    window.callbacks = 0;
    const render = c.renderRow.bind(c);
    c.renderRow = () => { callbacks++; render(); };
  });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => callbacks), 0);
  await page.evaluate(() => document.querySelector('lg-menubar').prepend(removed));
  await page.locator('#file > button').click();
  await settle(page);
  assert.equal(await page.locator('#file .lg-menu__panel').evaluate(n => n.hidden), false);
  assert.equal(await page.locator('#file').evaluate(c => c.surface.glass.params.height), await page.locator('#file .lg-menu__panel').evaluate(n => n.offsetHeight));
});

test('navbar and row springs avoid layout reads on every frame and refresh resized labels', async t => {
  const page = await open(t);
  await page.locator('#file > button').click();
  await settle(page);
  await page.evaluate(() => {
    window.reads = 0;
    for (const key of ['offsetLeft', 'offsetTop', 'offsetWidth', 'offsetHeight']) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key);
      Object.defineProperty(HTMLElement.prototype, key, { ...descriptor, get() {
        if (this.matches('#nav > button, #file .lg-menu__items > button')) reads++;
        return descriptor.get.call(this);
      } });
    }
    document.querySelector('#nav').moveTo(2);
    const c = document.querySelector('#file');
    c.highlight(0);
    c.highlight(3);
  });
  await page.waitForTimeout(800);
  assert(await page.evaluate(() => reads) < 40, 'Animation should use measured geometry');
  await page.evaluate(() => {
    const nav = document.querySelector('#nav');
    nav.links[0].textContent = 'A substantially longer label';
    nav.refresh();
    nav.setCurrent(0);
  });
  await page.waitForFunction(() => { const c = document.querySelector('#nav'); return c.xs.value === c.xs.target; });
  assert(await page.locator('#nav').evaluate(c => Math.abs(c.glass.params.width - c.links[0].offsetWidth) <= 0.5));
  await page.evaluate(() => {
    const c = document.querySelector('#nav');
    c.style.width = '1100px';
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const c = document.querySelector('#nav');
    c.style.justifyContent = 'space-between';
    c.moveTo(3);
  });
  await page.waitForFunction(() => { const c = document.querySelector('#nav'); return c.xs.value === c.xs.target; });
  assert.equal(await page.locator('#nav').evaluate(c => c.x), await page.locator('#nav > button').last().evaluate(n => n.offsetLeft));
});

test('navbar keeps the committed section through hover and focus until activation', async t => {
  const page = await open(t);
  const options = page.locator('#nav > button');
  await options.nth(2).hover();
  assert.equal(await page.locator('#nav').evaluate(nav => nav.target), 0);
  assert.equal(await options.first().getAttribute('aria-current'), 'page');
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => document.querySelector('#nav').target === 0);
  await options.nth(1).focus();
  assert.equal(await page.locator('#nav').evaluate(nav => nav.target), 0);
  assert.equal(await options.first().getAttribute('aria-current'), 'page');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#nav').current === 1);
  assert.equal(await options.nth(1).getAttribute('aria-current'), 'page');
});

test('menu highlights refresh after position-only row layout changes', async t => {
  const page = await open(t);
  await page.locator('#file > button').click();
  await settle(page);
  await page.locator('#file').evaluate(menu => {
    menu.list.style.display = 'flex';
    menu.list.style.flexDirection = 'column';
  });
  await page.waitForTimeout(100);
  const result = await page.locator('#file').evaluate(menu => {
    const before = [menu.list.offsetWidth, menu.list.offsetHeight, menu.items[0].offsetWidth, menu.items[0].offsetHeight];
    menu.items[0].style.order = '1';
    menu.highlight(0);
    return {
      before,
      after: [menu.list.offsetWidth, menu.list.offsetHeight, menu.items[0].offsetWidth, menu.items[0].offsetHeight],
      target: menu.ys.target,
      actual: menu.items[0].offsetTop,
    };
  });
  assert.deepEqual(result.after, result.before);
  assert.equal(result.target, result.actual);
});

test('closing menus leave Tab traversal while the exit animation runs', async t => {
  const page = await open(t);
  const trigger = page.locator('#file > button');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await settle(page);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#file').trigger), true);
  assert.equal(await page.locator('#file .lg-menu__panel').evaluate(node => node.inert), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#edit').trigger), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#file').trigger), true);
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#edit').items[0]), true);
});

test('Tab and Shift+Tab from a focused row move outside the closing menu', async t => {
  const page = await open(t);
  for (const [key, next] of [['Tab', 'edit'], ['Shift+Tab', 'file']]) {
    await page.locator('#file > button').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#file').items[0]), true);
    await page.keyboard.press(key);
    assert.equal(await page.evaluate(id => document.activeElement === document.getElementById(id).trigger, next), true);
    assert.equal(await page.locator('#file .lg-menu__panel').evaluate(node => node.inert), true);
  }
});

test('navbar glass and shadow share each painted frame and stop work when idle or removed', async t => {
  const page = await open(t);
  const frames = await page.locator('#nav').evaluate(async nav => {
    let mismatch = 0;
    let checked = 0;
    nav.moveTo(3);
    await new Promise(done => requestAnimationFrame(function sample() {
      const inset = nav.copy.style.clipPath.match(/inset\((.*?) round/);
      if (inset) {
        const [top, right = top, bottom = top, left = right] = inset[1].split(/\s+/).map(parseFloat);
        const rect = nav.copy.getBoundingClientRect();
        const host = nav.getBoundingClientRect();
        const shadow = new DOMMatrixReadOnly(nav.shadow.style.transform);
        mismatch = Math.max(mismatch, Math.abs(rect.left + left - host.left - shadow.e), Math.abs(rect.top + top - host.top - shadow.f),
          Math.abs(rect.width - left - right - parseFloat(nav.shadow.style.width)),
          Math.abs(rect.height - top - bottom - parseFloat(nav.shadow.style.height)));
        checked++;
      }
      if (checked === 20) nav.moveTo(0);
      if (checked >= 80) done();
      else requestAnimationFrame(sample);
    }));
    return { checked, mismatch };
  });
  assert.equal(frames.checked, 80);
  assert(frames.mismatch <= 0.51, `Glass and shadow differed by ${frames.mismatch}px`);
  await page.waitForFunction(() => {
    const nav = document.querySelector('#nav');
    return nav.xs.value === nav.xs.target && !nav.paintFrame && !nav.paintQueued;
  });
  await page.evaluate(() => {
    const nav = document.querySelector('#nav');
    window.paints = 0;
    const update = nav.glass.update;
    nav.glass.update = (...args) => { paints++; return update(...args); };
  });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => paints), 0);
  await page.evaluate(() => {
    window.detachedNav = document.querySelector('#nav');
    detachedNav.moveTo(3);
    detachedNav.remove();
  });
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => paints), 0);
  assert.equal(await page.evaluate(() => detachedNav.paintFrame), 0);
});

test('backdrop coordinates stay stable through scaled frames, reversal, scroll and resize', async t => {
  const page = await open(t);
  await page.locator('#file > button').click();
  await settle(page);
  const result = await page.locator('#file').evaluate(async c => {
    const original = c.surface.copy.style.transform;
    c.os.set(0.5, { immediate: true });
    c.surface.update();
    const scaled = c.surface.copy.style.transform;
    c.close();
    c.show();
    const reversed = c.surface.copy.style.transform;
    window.scrollTo(0, 40);
    await new Promise(requestAnimationFrame);
    c.surface.align();
    return { original, scaled, reversed, scrolled: c.surface.copy.style.transform };
  });
  assert.equal(result.scaled, result.original);
  assert.equal(result.reversed, result.original);
  assert.equal(result.scrolled, result.original);
  await page.setViewportSize({ width: 1100, height: 800 });
  await settle(page);
  assert(await page.locator('#file').evaluate(c => {
    const sr = c.surface.source.getBoundingClientRect(), lr = c.surface.layer.getBoundingClientRect();
    const matrix = new DOMMatrixReadOnly(c.surface.copy.style.transform);
    return Math.abs(matrix.e - (sr.left - lr.left)) < 0.02 && Math.abs(matrix.f - (sr.top - lr.top)) < 0.02;
  }));
});

test('reduced motion, plain backdrops and phone layout retain usable menus', async t => {
  const page = await open(t, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  for (const id of ['file', 'plain']) {
    await page.locator(`#${id} > button`).click();
    assert.equal(await page.locator(`#${id}`).evaluate(c => c.os.value), 1);
    await page.locator(`#${id} .lg-menu__items > button`).first().focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator(`#${id} .lg-menu__panel`).evaluate(n => n.hidden), true);
  }
  await page.locator('#file > button').click();
  if (process.env.LG_EVIDENCE_DIR) {
    mkdirSync(process.env.LG_EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.LG_EVIDENCE_DIR}/${engine}-menus-phone.png` });
  }
});
