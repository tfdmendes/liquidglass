import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { chromium, firefox } = await import(process.env.LG_PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.LG_REVIEW_URL || 'http://127.0.0.1:4382/review/filter-refresh.html';
const out = resolve(process.env.LG_EVIDENCE_DIR || '/tmp/liquidglass-filter-evidence');
const selected = (process.env.LG_ENGINES || 'blink,gecko').split(',');
const chromePath = process.env.LG_CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const firefoxUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0';
const scenarios = (process.env.LG_SCENARIOS || 'idle,pressed,moving,sequence,hidden,resume,reconnect,fit,sync,backdrop,decode-race,destroy,no-op,flush,offscreen').split(',');
const matrix = [
  { width: 1280, height: 800, dpr: 1 },
  { width: 1280, height: 800, dpr: 2 },
  { width: 390, height: 844, dpr: 1 },
  { width: 390, height: 844, dpr: 2 },
  { width: 390, height: 844, dpr: 1.25 },
  { width: 390, height: 844, dpr: 2, reducedMotion: 'reduce' },
];
mkdirSync(out, { recursive: true });
const journal = `${out}/comparison-${selected.join('-')}.jsonl`;
writeFileSync(journal, '');
const results = [];
const record = (row) => { results.push(row); appendFileSync(journal, JSON.stringify(row) + '\n'); };

async function difference(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const images = await Promise.all([a, b].map(async (base64) => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode(); return image;
    }));
    const [width, height] = [images[0].width, images[0].height];
    if (images[1].width !== width || images[1].height !== height) throw Error('Capture dimensions differ');
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    const data = images.map((image) => { context.clearRect(0, 0, width, height); context.drawImage(image, 0, 0); return context.getImageData(0, 0, width, height).data; });
    let pixels = 0, maxChannel = 0, sum = 0;
    for (let i = 0; i < data[0].length; i += 4) {
      let different = false;
      for (let c = 0; c < 4; c++) {
        const delta = Math.abs(data[0][i + c] - data[1][i + c]);
        maxChannel = Math.max(maxChannel, delta); sum += delta; different ||= delta > 0;
      }
      if (different) pixels++;
    }
    return { pixels, total: width * height, maxChannel, meanChannel: sum / (width * height * 4) };
  }, [a.toString('base64'), b.toString('base64')]);
}

function verify(engine, scenario, snapshots) {
  for (const r of snapshots) {
    assert.equal(r.engine, engine);
    if (scenario === 'fit') assert.equal(r.checks.fitWidth, true);
    if (scenario === 'decode-race') { assert.equal(r.checks.newestMapKept, true); assert.equal(r.checks.graphRebuilt, true); }
    if (scenario === 'destroy') {
      assert.equal(r.checks.destroyedStayedEmpty, true);
      assert.equal(r.checks.idChangesAfterDestroy, 0);
      assert.equal(r.metrics.pendingRetries, 0);
    }
    if (scenario === 'no-op') { assert.equal(r.checks.noOpIdChanges, 0); assert.equal(r.checks.noOpTimers, 0); assert.equal(r.checks.noOpAttributes, 0); }
    if (scenario === 'hidden') assert.equal(r.filter, '');
  }
  if (engine !== 'webkit') assert.equal(snapshots[1].metrics.retryTimers, 0);
  if (scenario === 'flush') assert.deepEqual(snapshots.map((r) => r.checks.flushIdChanges), engine === 'webkit' ? [100, 100] : [100, 0]);
}

for (const engine of selected.filter((name) => name !== 'webkit')) {
  const type = engine === 'blink' ? chromium : firefox;
  const browser = await type.launch({ headless: true, executablePath: engine === 'blink' ? chromePath : process.env.LG_FIREFOX_EXECUTABLE });
  try {
    for (const config of matrix) {
      const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.dpr, reducedMotion: config.reducedMotion || 'no-preference', ...(engine === 'gecko' ? { userAgent: firefoxUA } : {}) });
      const pages = await Promise.all([context.newPage(), context.newPage()]);
      const errors = [];
      pages.forEach((page) => page.on('pageerror', (error) => errors.push(error.message)));
      let idle;
      for (const scenario of scenarios) {
        const shots = [];
        const snapshots = [];
        const prefix = `${engine}-${config.width}-${config.dpr}-${config.reducedMotion || 'normal'}-${scenario}`;
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const variant = i ? 'candidate' : 'original';
          await page.goto(`${url}?single=${variant}`);
          await page.evaluate(() => window.comparisonReady);
          const r = await page.evaluate(async (name) => {
            if (name !== 'offscreen') return window.runComparison(name);
            const frame = document.querySelector('iframe');
            frame.style.transform = 'translateY(2000px)';
            const update = window.runComparison('moving');
            await new Promise((resolve) => setTimeout(resolve, 180));
            frame.style.transform = '';
            return update;
          }, scenario);
          snapshots.push(r.results[0]);
          const shot = await page.locator('iframe').screenshot();
          shots.push(shot);
          writeFileSync(`${out}/${prefix}-${variant}.png`, shot);
        }
        verify(engine, scenario, snapshots);
        assert.deepEqual(errors, []);
        const diff = await difference(pages[0], ...shots);
        if (scenario === 'idle') idle = shots[0];
        const changedFromIdle = scenario === 'moving' && idle ? await difference(pages[0], idle, shots[0]) : null;
        if (changedFromIdle) assert.ok(changedFromIdle.pixels > 0, 'The lens did not visibly move');
        record({ engine, version: browser.version(), config, scenario, diff, changedFromIdle, snapshots, capturePrefix: `${out}/${prefix}` });
      }
      console.log(JSON.stringify({ engine, config, comparisons: scenarios.length, differingPixels: results.filter((r) => r.engine === engine && r.config === config).reduce((n, r) => n + r.diff.pixels, 0) }));
      await context.close();
    }
  } finally { await browser.close(); }
}

if (selected.includes('webkit')) {
  assert.ok(process.env.LG_WEBKIT_SNAPSHOT, 'Set LG_WEBKIT_SNAPSHOT to the compiled review/snap-filter-refresh.swift executable');
  const reader = await chromium.launch({ headless: true, executablePath: chromePath });
  const page = await reader.newPage();
  try {
    for (const width of [1280, 390]) {
      let idle;
      for (const scenario of scenarios.filter((name) => name !== 'offscreen')) {
        const shots = [], snapshots = [];
        const prefix = `webkit-${width}-native-${scenario}`;
        for (const variant of ['original', 'candidate']) {
          const path = `${out}/${prefix}-${variant}.png`;
          const stdout = execFileSync(process.env.LG_WEBKIT_SNAPSHOT, [`${url}?single=${variant}&scenario=${scenario}`, path, `${width}`, width === 390 ? '844' : '800'], { encoding: 'utf8', timeout: 20000 });
          writeFileSync(`${path}.txt`, stdout);
          const match = stdout.match(/probe: (\{.*\})/);
          assert.ok(match, stdout);
          const probe = JSON.parse(match[1]);
          assert.equal(probe.result?.done, true, stdout);
          snapshots.push({ ...probe.result.results[0], userAgent: probe.ua });
          shots.push(readFileSync(path));
        }
        verify('webkit', scenario, snapshots);
        const diff = await difference(page, ...shots);
        if (scenario === 'idle') idle = shots[0];
        const changedFromIdle = scenario === 'moving' && idle ? await difference(page, idle, shots[0]) : null;
        if (changedFromIdle) assert.ok(changedFromIdle.pixels > 0, 'The native WebKit lens did not visibly move');
        record({ engine: 'webkit', version: snapshots[0].userAgent, config: { width, height: width === 390 ? 844 : 800, dpr: snapshots[0].dpr, reducedMotion: snapshots[0].reducedMotion }, scenario, diff, changedFromIdle, snapshots, capturePrefix: `${out}/${prefix}` });
        console.log(JSON.stringify({ engine: 'webkit', width, scenario, differingPixels: diff.pixels }));
      }
    }
  } finally { await reader.close(); }
}

const summary = {
  baseline: '068ad226f53e1ca62d857f78bdc32f58f3c5fce7',
  comparisons: results.length,
  pixelIdentical: results.filter((r) => r.diff.pixels === 0).length,
  differences: results.filter((r) => r.diff.pixels !== 0).map((r) => ({ engine: r.engine, config: r.config, scenario: r.scenario, diff: r.diff })),
  engines: [...new Set(results.map((r) => `${r.engine}: ${r.version}`))],
  idle: results.filter((r) => r.scenario === 'idle').map((r) => ({ engine: r.engine, config: r.config, original: r.snapshots[0].metrics, candidate: r.snapshots[1].metrics })),
  flush100: results.filter((r) => r.scenario === 'flush').map((r) => ({ engine: r.engine, config: r.config, originalIdChanges: r.snapshots[0].checks.flushIdChanges, candidateIdChanges: r.snapshots[1].checks.flushIdChanges, originalElapsedMs: r.snapshots[0].elapsedFlushMs, candidateElapsedMs: r.snapshots[1].elapsedFlushMs })),
};
const path = `${out}/comparison-${selected.join('-')}.json`;
writeFileSync(path, JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify({ evidence: path, comparisons: summary.comparisons, pixelIdentical: summary.pixelIdentical }));
if (summary.differences.length) process.exitCode = 1;
