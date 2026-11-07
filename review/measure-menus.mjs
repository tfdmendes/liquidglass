import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, launchOptions } from './browser-runtime.mjs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const baseline = execFileSync('git', ['rev-parse', process.env.LG_MENU_BASE || 'a863784'], { cwd: root, encoding: 'utf8' }).trim();
const sources = Object.fromEntries(['previous', 'current'].map(build => [build,
  Object.fromEntries(['components.js', 'liquid-glass.js'].map(name => [name, build === 'previous'
    ? execFileSync('git', ['show', `${baseline}:lib/${name}`], { cwd: root, encoding: 'utf8' })
    : readFileSync(resolve(root, 'lib', name), 'utf8')]))]));
const server = createServer((request, response) => {
  const [, build, ...parts] = new URL(request.url, 'http://localhost').pathname.split('/');
  const relative = parts.join('/');
  const path = resolve(root, relative);
  if (!sources[build] || !path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('content-type', path.endsWith('.html') ? 'text/html' : path.endsWith('.js') ? 'text/javascript' : 'image/jpeg');
    response.end(relative.startsWith('lib/') ? sources[build][parts.at(-1)] : readFileSync(path));
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const playwright = await loadPlaywright();
const engine = process.env.LG_BROWSER || 'chromium';
const cpuRate = Number(process.env.LG_MENU_CPU_RATE || 1);
const builds = (process.env.LG_MENU_BUILDS || 'previous,current').split(',');
const trials = Number(process.env.LG_MENU_TRIALS || 3);
let browser;
const report = {
  baseline, date: new Date().toISOString(), engine, cpuRate, configuration: { builds, trials, viewport: { width: 1280, height: 800 }, dpr: 2 }, trials: [],
  fixtureSHA256: createHash('sha256').update(readFileSync(resolve(root, 'tests/fixtures/menus.html'))).digest('hex'),
  sources: Object.fromEntries(Object.entries(sources).map(([build, files]) => [build,
    Object.fromEntries(Object.entries(files).map(([name, source]) => [name, createHash('sha256').update(source).digest('hex')]))])),
  method: 'Alternating paired trials per workload, fresh page at 1280x800 DPR 2. Each six-second rAF replay opens/switches/closes menus or moves a navbar highlight every 180 ms through synthetic input events. PNG counts include only the replay, after page setup. FPS measures rAF cadence, not physical presentation. Browser task/layout metrics and optional CPU throttling are available in Chromium only. Shared-host timing is not a universal speedup claim.',
};
try {
  browser = await playwright[engine].launch(launchOptions(engine));
  report.browser = browser.version();
  for (const workload of ['open', 'rows', 'navbar']) for (let trial = 0; trial < trials; trial++) {
    for (const build of trial % 2 ? [...builds].reverse() : builds) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/${build}/tests/fixtures/menus.html`);
        await page.waitForFunction(() => document.querySelector('#nav').glass?.filterId);
        await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
        await page.waitForTimeout(700);
        if (workload === 'rows') {
          await page.locator('#file > button').click();
          await page.waitForTimeout(700);
        }
        const cdp = engine === 'chromium' ? await page.context().newCDPSession(page) : null;
        if (cpuRate !== 1) {
          if (!cdp) throw new Error('CPU throttling requires Chromium');
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
        }
        await cdp?.send('Performance.enable');
        const metrics = async () => Object.fromEntries((await cdp?.send('Performance.getMetrics'))?.metrics.map(m => [m.name, m.value]) || []);
        const before = await metrics();
        const result = await page.evaluate(async workload => {
          let encodes = 0, pixels = 0;
          const original = HTMLCanvasElement.prototype.toDataURL;
          HTMLCanvasElement.prototype.toDataURL = function (...args) { encodes++; pixels += this.width * this.height; return original.apply(this, args); };
          const menus = [...document.querySelectorAll('lg-menubar > lg-menu')];
          const nav = document.querySelector('#nav');
          const frames = [];
          let start, previous, action = -1;
          await new Promise(done => requestAnimationFrame(function step(now) {
            start ??= now;
            if (previous !== undefined) frames.push(now - previous);
            previous = now;
            const next = Math.floor((now - start) / 180);
            if (next !== action) {
              action = next;
              if (workload === 'open') {
                if (action % 4 === 3) menus.forEach(menu => menu.close());
                else menus[action % 4].trigger.click();
              } else if (workload === 'rows') {
                const item = menus[0].items[action % menus[0].items.length];
                item.dispatchEvent(new PointerEvent('pointerenter'));
              } else nav.links[action % nav.links.length].dispatchEvent(new PointerEvent('pointerenter'));
            }
            if (now - start < 6000) requestAnimationFrame(step);
            else done();
          }));
          HTMLCanvasElement.prototype.toDataURL = original;
          const sorted = [...frames].sort((a, b) => a - b);
          return { frames: frames.length, fps: 1000 * frames.length / frames.reduce((a, b) => a + b, 0), p95FrameMs: sorted[Math.floor(sorted.length * 0.95)], encodes, encodedPixels: pixels };
        }, workload);
        const after = await metrics();
        const row = { workload, build, trial, ...result, metrics: Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'LayoutCount', 'RecalcStyleCount'].filter(key => key in before).map(key => [key, after[key] - before[key]])), errors };
        report.trials.push(row);
        console.log(JSON.stringify(row));
        if (errors.length) throw new Error(errors.join('\n'));
        if (trial === 0 && process.env.LG_MENU_EVIDENCE_DIR) {
          mkdirSync(process.env.LG_MENU_EVIDENCE_DIR, { recursive: true });
          await page.evaluate(() => {
            const menu = document.querySelector('#file');
            menu.show();
            menu.focusItem(1);
          });
          await page.waitForTimeout(800);
          await page.screenshot({ path: `${process.env.LG_MENU_EVIDENCE_DIR}/${build}-${workload}.png` });
        }
      } finally { await page.close(); }
    }
  }
  writeFileSync(process.env.LG_MENU_OUT || '/tmp/liquidglass-menu-results.json', JSON.stringify(report, null, 2) + '\n');
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
