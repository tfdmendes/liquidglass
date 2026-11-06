import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchOptions, loadPlaywright } from '../review/browser-runtime.mjs';
import { serveSite } from '../scripts/serve-site.mjs';

const playwright = await loadPlaywright();
const engine = process.env.LG_BROWSER || 'chromium';
let browser;
let site;

before(async () => {
  site = await serveSite(0);
  browser = await playwright[engine].launch(launchOptions(engine));
});

after(async () => {
  await browser?.close();
  if (site) await new Promise((done) => site.server.close(done));
});

for (const width of [1440, 390]) {
  test(`feedback menus change the material and glass at ${width}px`, async (t) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    t.after(() => context.close());
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    t.after(() => assert.deepEqual(errors, []));
    await page.goto(site.url + '#feedback-scene');
    await page.evaluate(() => document.fonts.ready);
    const scene = page.locator('#feedback-scene');
    await scene.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('#notify-button').surface?.glass);
    const heroImage = await page.locator('#hero-material').getAttribute('src');
    const choose = async (id, value) => {
      const menu = scene.locator(id);
      await menu.locator('.lg-menu__trigger').click();
      await menu.locator(`.lg-menu__items > button[value="${value}"]`).click();
    };

    await choose('#style-menu', 'frosted');
    const frosted = await scene.evaluate((node) => ({
      toolbar: node.querySelector('lg-menubar').surface.glass.params.blur,
      button: node.querySelector('lg-button').surface.glass.params.blur,
    }));
    assert(frosted.toolbar >= 10, 'Frosted must change the toolbar, not just the caption');
    assert(frosted.button >= 10, 'Frosted must visibly blur the button');
    await choose('#material-menu', 'lagoon');
    await page.waitForFunction(() => {
      const image = document.querySelector('#feedback-material');
      return image?.complete && image.currentSrc.includes('material-lagoon.webp');
    });
    await page.waitForFunction(() => [...document.querySelectorAll('#feedback-scene lg-menubar, #feedback-scene lg-button')].every((node) => node.surface.copy?.currentSrc.includes('material-lagoon.webp')));
    assert.equal(await scene.locator('#material-menu .lg-menu__items > [aria-checked="true"]').getAttribute('value'), 'lagoon');
    assert.equal(await scene.locator('lg-menubar').evaluate((node) => node.surface.glass.params.blur), frosted.toolbar);
    await scene.getByRole('button', { name: 'Show notification' }).click();
    await scene.locator('lg-toast').waitFor();
    assert.equal(await scene.locator('lg-toast').evaluate((node) => node.surface.glass.params.blur), frosted.button);
    await scene.locator('#material-menu .lg-menu__trigger').click();
    await page.waitForFunction(() => document.querySelector('#material-menu').os.value === 1);
    assert(await scene.locator('#material-menu .lg-menu__items > button[value="aurora"]').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }), 'Notifications must not cover material choices');
    await scene.locator('#material-menu .lg-menu__items > button').first().press('Escape');

    await choose('#style-menu', 'soft');
    const soft = await scene.locator('lg-menubar').evaluate((node) => node.surface.glass.params.blur);
    assert(soft > 0 && soft < frosted.toolbar);
    await choose('#style-menu', 'clear');
    assert.equal(await scene.locator('lg-menubar').evaluate((node) => node.surface.glass.params.blur), 0);
    assert.equal(await scene.locator('#style-menu .lg-menu__items > [aria-checked="true"]').getAttribute('value'), 'clear');
    await scene.locator('#material-menu .lg-menu__trigger').press('ArrowDown');
    await scene.locator('#material-menu .lg-menu__items > button').first().press('Escape');
    assert.equal(await scene.locator('#material-menu .lg-menu__trigger').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#hero-material').getAttribute('src'), heroImage, 'Feedback settings must leave the hero unchanged');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  });
}
