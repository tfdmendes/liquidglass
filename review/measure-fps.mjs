import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { arch, cpus, platform, release } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { loadPlaywright, launchOptions } from './browser-runtime.mjs';
import { serveShowcase } from '../scripts/serve-showcase.mjs';
import { summarizeTrials } from '../showcase/metrics.js';

const baseline = process.env.LG_FPS_BASE;
const baselineDirectory = process.env.LG_FPS_BASE_DIR;
assert(!(baseline && baselineDirectory), 'Select either LG_FPS_BASE or LG_FPS_BASE_DIR');
const baselineRevision = baseline ? execFileSync('git', ['rev-parse', '--verify', `${baseline}^{commit}`], { encoding: 'utf8' }).trim() : null;
const baselineSources = baselineRevision || baselineDirectory ? Object.fromEntries(['liquid-glass.js', 'glass-webgl.js', 'components.js'].map(file => [file,
  baselineDirectory ? readFileSync(join(baselineDirectory, file)) : execFileSync('git', ['show', `${baselineRevision}:lib/${file}`])])) : null;
const candidateDirectory = process.env.LG_FPS_CANDIDATE_DIR;
const candidateSources = candidateDirectory ? Object.fromEntries(['liquid-glass.js', 'glass-webgl.js', 'components.js'].map(file => [file,
  readFileSync(join(candidateDirectory, file))])) : null;
const trialCount = Number(process.env.LG_FPS_TRIALS || 3);
assert(Number.isInteger(trialCount) && trialCount > 0, 'LG_FPS_TRIALS must be a positive integer');
const { server, url, directory } = await serveShowcase();
const manifest = JSON.parse(readFileSync(join(directory, 'builds/manifest.json'), 'utf8'));
if (baselineSources) {
  for (const [file, source] of Object.entries(baselineSources)) writeFileSync(join(directory, 'builds/previous', file), source);
  manifest.builds.previous = { revision: baselineRevision, directory: baselineDirectory || 'lib', sha256: Object.fromEntries(Object.entries(baselineSources).map(([file, source]) =>
    [file, createHash('sha256').update(source).digest('hex')])) };
  writeFileSync(join(directory, 'builds/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
if (candidateSources) {
  for (const [file, source] of Object.entries(candidateSources)) writeFileSync(join(directory, 'builds/current', file), source);
  manifest.builds.current = { revision: null, directory: candidateDirectory, sha256: Object.fromEntries(Object.entries(candidateSources).map(([file, source]) =>
    [file, createHash('sha256').update(source).digest('hex')])) };
  writeFileSync(join(directory, 'builds/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
const playwright = await loadPlaywright();
const engine = process.env.LG_BROWSER || 'chromium';
const headless = true;
const browser = await playwright[engine].launch({ ...launchOptions(engine), headless });
const keeper = await browser.newPage();
await keeper.goto('about:blank');
const report = {
  schema: 1, date: new Date().toISOString(), manifest,
  fixtureSHA256: Object.fromEntries(['showcase/scene.html', 'showcase/scene.js', 'showcase/metrics.js', 'review/measure-fps.mjs'].map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])),
  environment: { browserProduct: `Installed ${engine} ${browser.version()}`, headless, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model },
  method: `${trialCount} paired alternating trials per build. Each trial uses a fresh visible page with a 1000x560 scene at DPR 2 and mapScale 2. Idle rAF calibration precedes each workload; the first median calibration is the missed-slot reference for all trials. Each trial warms for 1000 ms and samples rAF intervals for 4000 ms. Update work is synchronous JS/canvas/encoding/driver-submission time, excluding asynchronous decode and GPU completion. Animation FPS describes browser rAF cadence rather than physical frame presentation. Shared-host noise, compositor scheduling and display cadence can affect samples.`,
  configurations: [],
};
const configs = [
  { renderer: 'svg', workload: 'reshape', count: 12, backdrop: 'city' },
  { renderer: 'svg', workload: 'reshape', count: 24, backdrop: 'city' },
  { renderer: 'svg', workload: 'move', count: 24, backdrop: 'city' },
  { renderer: 'webgl', workload: 'reshape', count: 24, backdrop: 'city' },
  { renderer: 'webgl', workload: 'move', count: 24, backdrop: 'city' },
];
const builds = process.env.LG_FPS_ORIGINAL === '1' ? ['original', 'previous', 'current'] : ['previous', 'current'];
const selectedConfigs = configs.filter(settings => !process.env.LG_FPS_CASE || `${settings.renderer}-${settings.workload}-${settings.count}` === process.env.LG_FPS_CASE);
let refreshMs;
try {
  assert(selectedConfigs.length, 'LG_FPS_CASE did not select a workload');
  for (const settings of selectedConfigs) {
    const configuration = { settings, builds, trials: [], summary: {} };
    report.configurations.push(configuration);
    for (let trial = 0; trial < trialCount; trial++) {
      for (const build of trial % 2 ? [...builds].reverse() : builds) {
        const page = await browser.newPage({ viewport: { width: 1000, height: 560 }, deviceScaleFactor: 2 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto(`${url}/scene.html?build=${build}`);
          await page.bringToFront();
          await page.waitForFunction(() => window.sceneReady);
          await page.evaluate(() => window.sceneReady);
          await page.evaluate(settings => scene.configure(settings), settings);
          const calibration = await page.evaluate(() => scene.calibrate());
          refreshMs ??= calibration.refreshMs;
          const result = await page.evaluate(refreshMs => scene.run({ durationMs: 4000, warmupMs: 1000, refreshMs }), refreshMs);
          assert.equal(result.engine, { chromium: 'blink', firefox: 'gecko', webkit: 'webkit' }[engine]);
          assert.equal(result.build, build);
          assert(result.frames > 0 && result.fps > 0 && result.fps < 1000);
          assert.deepEqual(errors, []);
          configuration.trials.push({ ...result, trial, idleIntervals: calibration.intervals });
          console.log(JSON.stringify({ settings, build, trial, fps: result.fps, p95FrameMs: result.p95FrameMs, meanUpdateMs: result.meanUpdateMs, missedSlotPercent: result.missedSlotPercent }));
          if (trial === 0) {
            mkdirSync('/tmp/liquidglass-fps-captures', { recursive: true });
            await page.screenshot({ path: `/tmp/liquidglass-fps-captures/${settings.renderer}-${settings.workload}-${settings.count}-${build}.png` });
          }
        } finally { await page.close(); }
      }
    }
    for (const build of builds) configuration.summary[build] = summarizeTrials(configuration.trials.filter(trial => trial.build === build));
    console.log(JSON.stringify({ settings, summary: configuration.summary }));
  }
  report.refreshMs = refreshMs;
  writeFileSync(process.env.LG_FPS_OUT || '/tmp/liquidglass-fps-results.json', JSON.stringify(report, null, 2) + '\n');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
