import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { baseline, frameDocument } from './build-map-cache.mjs';

const run = promisify(execFile);
const temp = mkdtempSync(`${tmpdir()}/map-cache-native-`);
const out = process.env.MAP_EVIDENCE_DIR ?? '/tmp/liquidglass-map-evidence';
mkdirSync(out, { recursive: true });
const paths = [];
const stock = readFileSync('skill/liquid-glass-web/scripts/snap-webkit.swift', 'utf8');
const swift = stock.replace('DispatchQueue.main.asyncAfter(deadline: .now() + delay) {', 'func snapshot() {').replace('app.run()', `
let started = Date()
func poll() {
  web.evaluateJavaScript("window.nativeEvidence?.ready === true") { value, error in
    if value as? Bool == true {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { snapshot() }
    } else if Date().timeIntervalSince(started) > 20 {
      print("native readiness timed out", error.map { "\\($0)" } ?? "")
      exit(1)
    } else {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { poll() }
    }
  }
}
poll()
app.run()`);
writeFileSync(`${temp}/snap.swift`, swift);

async function nativeChecks(originalSource, state, variant) {
  try {
    const f = mapFixture;
    await f.ready;
    const original = await import(URL.createObjectURL(new Blob([originalSource], { type: 'text/javascript' })));
    let exactMaps = true;
    for (const scale of [0.75, 1, 1.25, 2, 2.5]) for (const options of [
      { width: 123.456, height: 45.678, radius: 21.987, curvature: 3.7, ior: 1.47, specularWidth: 1.375 },
      { width: 103.5000001, height: 39.4999999, radius: Infinity, invert: true },
    ]) exactMaps &&= original.renderLensMap(options, scale).canvas.toDataURL() === f.runtime.renderLensMap(options, scale).canvas.toDataURL();
    const target = document.body.appendChild(document.createElement('div'));
    target.style.cssText = 'position:absolute;top:500px;width:270px;height:100px;background:white';
    f.resetStats(); f.hold(true);
    const glass = f.runtime.createGlass(target, { width: 113.25, height: 41.5, radius: 17.75, mapScale: 1, sync: true });
    const firstUnfiltered = target.style.filter === '';
    glass.update({ width: 113.25 + 1e-10 });
    const aliasDecodes = f.stats.decodes;
    glass.update({ width: 118.75 });
    const last = f.gates.length - 1;
    f.gates[last].resolve(); await new Promise((resolve) => setTimeout(resolve, 80));
    const newest = document.querySelector(`#${glass.filterId} feImage`).getAttribute('href');
    f.gates.slice(0, last).reverse().forEach((gate) => gate.resolve()); await f.settle();
    const ordered = newest === document.querySelector(`#${glass.filterId} feImage`).getAttribute('href');
    glass.update({ width: 137.75 });
    const filter = document.getElementById(glass.filterId); glass.destroy();
    f.gates.at(-1).resolve(); await f.settle();
    const destroyed = !filter.isConnected && target.style.filter === '';
    f.hold(false); target.remove();
    await f.action(state);
    const passed = f.runtime.engine === 'webkit' && exactMaps && firstUnfiltered && ordered && destroyed && aliasDecodes === (variant === 'original' ? 2 : 1);
    window.nativeEvidence = { ready: true, passed, variant, state, engine: f.runtime.engine, ua: navigator.userAgent, dpr: devicePixelRatio, viewport: [innerWidth, innerHeight], exactMapCases: 10, exactMaps, firstUnfiltered, aliasDecodes, ordered, destroyed };
  } catch (error) { window.nativeEvidence = { ready: true, passed: false, error: String(error) }; }
}

const results = [];
try {
  await run('xcrun', ['swiftc', '-O', `${temp}/snap.swift`, '-o', `${temp}/snap`]);
  for (const config of [{ width: 1280, height: 900, state: 'moving' }, { width: 390, height: 844, state: 'pressed' }]) {
    for (const variant of ['original', 'candidate']) {
      const source = variant === 'original' ? baseline() : readFileSync('lib/liquid-glass.js', 'utf8');
      const path = `review/.map-native-${process.pid}-${variant}.html`;
      paths.push(path);
      const app = `(${nativeChecks.toString()})(${JSON.stringify(baseline()).replaceAll('<', '\\u003c')},${JSON.stringify(config.state)},${JSON.stringify(variant)})`;
      writeFileSync(path, frameDocument(source).replace('</html>', `<script>${app}</script></html>`));
      const stem = `webkit-${config.width}-${config.state}-${variant}`;
      const { stdout } = await run(`${temp}/snap`, [`http://127.0.0.1:${process.env.MAP_REVIEW_PORT ?? 4381}/${path}`, `${out}/${stem}.png`, String(config.width), String(config.height), '0', 'JSON.stringify(window.nativeEvidence)'], { timeout: 28000 });
      writeFileSync(`${out}/${stem}.log`, stdout);
      const result = JSON.parse(stdout.split('\n').find((line) => line.startsWith('probe: ')).slice(7));
      results.push(result); console.log(JSON.stringify(result));
      if (!result.passed) throw new Error(`Native checks failed: ${JSON.stringify(result)}`);
    }
  }
  writeFileSync(`${out}/webkit.json`, JSON.stringify(results, null, 2) + '\n');
  const visual = [[1280, 'moving'], [390, 'pressed']].map(([width, state]) => {
    const images = ['original', 'candidate'].map((variant) => readFileSync(`${out}/webkit-${width}-${state}-${variant}.png`));
    return { width, state, encodedPNGsEqual: images[0].equals(images[1]) };
  });
  writeFileSync(`${out}/webkit-visual.json`, JSON.stringify(visual, null, 2) + '\n');
  console.log(JSON.stringify({ visual }));
} finally {
  paths.forEach((path) => rmSync(path, { force: true }));
  rmSync(temp, { recursive: true, force: true });
}
