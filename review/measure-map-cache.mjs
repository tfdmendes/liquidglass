import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { baseline, frameDocument } from './build-map-cache.mjs';

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to an isolated Playwright index.mjs path');
const { chromium, firefox } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const gecko = process.env.BROWSER === 'firefox';
const type = gecko ? firefox : chromium;
const executablePath = gecko ? process.env.FIREFOX_EXECUTABLE : (process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const userAgent = gecko ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0' : undefined;
const repeats = Number(process.env.MAP_BENCH_REPEATS ?? 3);
const cycles = Number(process.env.MAP_BENCH_CYCLES ?? 12);

// ps reports accumulated CPU time across every thread in each browser-owned process
function processCPU(rootPid) {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=', '-o', 'ppid=', '-o', 'time='], { encoding: 'utf8' }).trim().split('\n').map((line) => {
    const [pid, parent, time] = line.trim().split(/\s+/);
    const parts = time.split(':').map(Number);
    return { pid: Number(pid), parent: Number(parent), ms: parts.reduce((sum, part) => sum * 60 + part, 0) * 1000 };
  });
  const owned = new Set([rootPid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const row of rows) if (owned.has(row.parent) && !owned.has(row.pid)) { owned.add(row.pid); changed = true; }
  }
  return rows.filter((row) => owned.has(row.pid));
}

const sourceByVariant = { original: baseline(), candidate: readFileSync('lib/liquid-glass.js', 'utf8') };
const hashes = Object.fromEntries(Object.entries(sourceByVariant).map(([variant, source]) => [variant, createHash('sha256').update(source).digest('hex')]));
const results = [];
for (const workload of ['button', 'segmented', 'mostly-unique']) {
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const variant of (repeat % 2 ? ['candidate', 'original'] : ['original', 'candidate'])) {
      const source = sourceByVariant[variant];
      const server = await type.launchServer({ headless: true, executablePath });
      const browser = await type.connect(server.wsEndpoint());
      try {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, userAgent });
        const page = await context.newPage();
        await page.setContent(frameDocument(source));
        const engine = await page.evaluate(() => mapFixture.ready);
        if (engine !== (gecko ? 'gecko' : 'blink')) throw new Error(`Wrong engine: ${engine}`);
        await page.evaluate(async (workload) => {
          mapFixture.mount(workload === 'mostly-unique' ? 'empty' : workload);
          await mapFixture.tick(5); await mapFixture.settle(); mapFixture.resetStats();
        }, workload);
        const before = processCPU(server.process().pid);
        const start = performance.now();
        const stats = await page.evaluate(async ({ workload, cycles }) => {
          const f = mapFixture;
          if (workload === 'mostly-unique') {
            const target = document.body.appendChild(document.createElement('div'));
            target.style.cssText = 'width:300px;height:120px;background:white';
            const glass = f.runtime.createGlass(target, { width: 181.25, height: 53.75, radius: 17.125, mapScale: 2, sync: true, curvature: 2.8 });
            for (let i = 1; i < cycles * 100; i++) {
              glass.update({ curvature: 2.8 + i * 0.0035, lightAngle: -120 + i * 0.71 });
              if (i % 10 === 0) await f.settle();
            }
            await f.settle(); glass.destroy(); target.remove();
          } else {
            for (let i = 0; i < cycles; i++) {
              if (workload === 'button') {
                f.event('pointerdown'); await f.tick(50); f.event('pointerup'); await f.tick(50);
              } else {
                const seg = document.querySelector('lg-segmented');
                seg.select(2); await f.tick(60); seg.select(0); await f.tick(60);
              }
            }
            await f.settle();
          }
          return { ...f.stats };
        }, { workload, cycles });
        // Wait for decode completions and the retained engine repaint timers inside this sample
        await page.waitForTimeout(320);
        await page.evaluate(() => mapFixture.flush());
        const after = processCPU(server.process().pid);
        const wallMs = performance.now() - start;
        const missingPids = before.filter((row) => !after.some((end) => end.pid === row.pid)).map((row) => row.pid);
        const cpuMs = after.reduce((sum, row) => sum + row.ms - (before.find((start) => start.pid === row.pid)?.ms ?? 0), 0);
        const result = { workload, variant, repeat, cycles, engine, browser: await browser.version(), cpuMs, wallMs, stats, before, after, missingPids };
        results.push(result);
        console.log(JSON.stringify({ workload, variant, repeat, cpuMs, wallMs, stats, missingPids }));
      } finally { await browser.close(); await server.close(); }
    }
  }
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summary = ['button', 'segmented', 'mostly-unique'].map((workload) => {
  const by = (variant) => results.filter((row) => row.workload === workload && row.variant === variant);
  const original = median(by('original').map((row) => row.cpuMs));
  const candidate = median(by('candidate').map((row) => row.cpuMs));
  return { workload, originalMedianCPUms: original, candidateMedianCPUms: candidate, changePercent: (candidate / original - 1) * 100 };
});
const evidence = { sourceSHA256: hashes, method: 'macOS ps accumulated CPU time for the browser process and descendants; includes pixel generation, equality, canvas upload, PNG encoding/decoding and rendering tasks. 10ms per-process quantization. Excludes WindowServer and graphics drivers. Fixed 60 Hz spring steps are replayed faster than wall clock; native paint work can be coalesced. Wall time includes intentionally scheduled waits. No real-time frame cost or CPU percentage is inferred.', results, summary };
writeFileSync(process.env.MAP_BENCH_OUT ?? '/tmp/liquidglass-map-cpu.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
