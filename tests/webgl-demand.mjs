import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const modulePath = process.env.PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set PLAYWRIGHT_MODULE to the existing Playwright index.mjs; no package is installed by this runner');
const playwright = await import(pathToFileURL(resolve(modulePath)).href);
const output = resolve(option('output', 'output/playwright/webgl-demand'));
await mkdir(output, { recursive: true });
const cases = process.argv.includes('--quick') ? [{ width: 1280, height: 900, dpr: 1, motion: 'no-preference' }] : [
  { width: 1280, height: 900, dpr: 1, motion: 'no-preference' },
  { width: 1280, height: 900, dpr: 2, motion: 'no-preference' },
  { width: 1280, height: 900, dpr: 1.5, motion: 'reduce' },
  { width: 390, height: 844, dpr: 1, motion: 'no-preference' },
  { width: 390, height: 844, dpr: 2, motion: 'reduce' },
  { width: 390, height: 844, dpr: 1.5, motion: 'no-preference' },
];
const report = { base: '068ad226f53e1ca62d857f78bdc32f58f3c5fce7', date: new Date().toISOString(), cases: [] };
for (const engine of option('engine', 'chromium,firefox').split(',')) {
  const executablePath = engine === 'firefox' ? process.env.FIREFOX_EXECUTABLE : process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await playwright[engine].launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    for (const size of cases) {
      const name = `${engine}-${size.width}-${size.dpr}-${size.motion}`;
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr, reducedMotion: size.motion,
        ...(engine === 'firefox' ? { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0' } : {}) });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.goto(pathToFileURL(resolve(option('page', 'review/webgl-demand.html'))).href);
        await page.waitForFunction(() => window.reviewReady || window.reviewError, null, { timeout: 10000 });
        const result = await page.evaluate(async () => {
          if (window.reviewError) throw new Error(window.reviewError);
          return Promise.race([window.runWebGLChecks(), new Promise((_, reject) => setTimeout(() => reject(new Error('Behavior checks exceeded 45 seconds')), 45000))]);
        });
        assert.equal(result.runtime.engines[0], engine === 'firefox' ? 'gecko' : 'blink');
        assert.deepEqual(errors, []);
        const row = { name, browser: browser.version(), ...result };
        report.cases.push(row);
        await page.evaluate((count) => { document.querySelector('#status').textContent = `${count} assertions passed`; }, result.assertions);
        await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
        console.log(`${name}: ${result.assertions} assertions passed; idle uploads ${result.work.bitmapIdle.original.sourceUploads} → ${result.work.bitmapIdle.candidate.sourceUploads}`);
      } catch (error) {
        report.cases.push({ name, browser: browser.version(), error: error.stack, pageErrors: errors });
        console.error(`${name}: ${error.message}`);
        process.exitCode = 1;
      } finally { await context.close(); }
      await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2) + '\n');
    }
  } finally { await browser.close(); }
}
