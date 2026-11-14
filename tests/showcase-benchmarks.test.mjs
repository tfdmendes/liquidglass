import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchOptions, loadPlaywright } from '../review/browser-runtime.mjs';
import { serveSite } from '../scripts/serve-site.mjs';

const playwright = await loadPlaywright();
const engine = process.env.LG_BROWSER || 'chromium';
let site;
let browser;

before(async () => {
  site = await serveSite(0);
  browser = await playwright[engine].launch(launchOptions(engine));
});

after(async () => {
  await browser?.close();
  if (site) await new Promise((done) => site.server.close(done));
});

for (const width of [1440, 390]) {
  test(`benchmark choices preserve measurements through click, keyboard and drag at ${width}px`, async (t) => {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'no-preference' });
    t.after(() => context.close());
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    t.after(() => assert.deepEqual(errors, []));
    await page.goto(site.url + '#performance');
    await page.evaluate(() => document.fonts.ready);
    const maps = page.locator('#figure-maps');
    const picker = maps.locator('.benchmark-picker');
    await picker.locator(':scope > button').filter({ hasText: /^Capsule$/ }).click();
    assert.deepEqual(await maps.locator('.benchmark-axis > span').allTextContents(), ['0', '0.3', '0.6 ms']);
    assert.equal(await maps.locator('.benchmark-bar--previous strong').evaluate((node) => node.firstChild.textContent), '0.473');
    assert.equal(await maps.locator('.benchmark-bar--current strong').evaluate((node) => node.firstChild.textContent), '0.290');
    assert.equal(await picker.getByRole('radio', { name: 'Capsule', exact: true }).getAttribute('aria-checked'), 'true');
    const glass = maps.locator('.benchmark-picker-shell .lg-surface__glass').first();
    await page.waitForFunction(() => document.querySelector('#figure-maps .benchmark-picker-shell')?.surface.glass?.params.width > 0);
    assert.match(await glass.evaluate((node) => getComputedStyle(node).filter), /url\(/);
    await page.keyboard.press('ArrowRight');
    await maps.getByRole('heading', { name: 'Unique lens update', exact: true }).waitFor();
    // Wait for the selected glass before starting a separate drag gesture
    await page.waitForFunction(() => {
      const node = document.querySelector('#figure-maps .benchmark-picker');
      return node.xs.value === node.xs.target && node.ps.value === node.ps.target && node.ss.value === node.ss.target;
    });
    const from = await picker.getByRole('radio', { name: 'Update', exact: true }).boundingBox();
    const to = await picker.getByRole('radio', { name: 'Button', exact: true }).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    assert.equal(await maps.locator('.benchmark-heading h3').textContent(), 'Unique lens update');
    await page.mouse.up();
    await maps.getByRole('heading', { name: 'Button map', exact: true }).waitFor();
    assert.equal(await picker.getByRole('radio', { name: 'Button', exact: true }).getAttribute('aria-checked'), 'true');

    for (const [name, id, initial] of [['Animation', 'figure-fps', 1], ['Update time', 'figure-update', 3]]) {
      await page.getByRole('tab', { name, exact: true }).click();
      const figure = page.locator('#' + id);
      const radios = figure.getByRole('radio');
      assert.equal(await radios.nth(initial).getAttribute('aria-checked'), 'true');
      await radios.first().click();
      assert.equal(await radios.first().getAttribute('aria-checked'), 'true');
      await page.waitForFunction((id) => document.querySelector('#' + id + ' .benchmark-picker-shell').surface.glass.params.width > 0, id);
      assert(!/\d+\.\d{7}/.test(await figure.locator('.benchmark-axis').textContent()));
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  });
}
