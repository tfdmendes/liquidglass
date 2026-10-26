import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { combinedDocument, manifest } from '../review/combined-fixture.mjs';

assert(process.env.SNAP_WEBKIT, 'Set SNAP_WEBKIT to the existing compiled review/snap-surface-scroll.swift binary');
const output = process.env.COMBINED_EVIDENCE_DIR || '/tmp/liquidglass-fork-validation/combined';
mkdirSync(output, { recursive: true });

async function nativeProbe() {
  const start = Date.now(), wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async fn => { while (!fn()) { if (Date.now() - start > 21000) throw new Error('Native combined check exceeded 21 seconds'); await wait(30); } };
  try {
    await until(() => window.fixtureReady);
    if (fixture.engine !== 'webkit') throw new Error('Expected production WebKit detection');
    const align = () => {
      const geometry = fixture.geometry(true);
      if (!geometry.length || geometry.some(g => ['dx', 'dy', 'dw', 'dh'].some(key => Math.abs(g[key]) >= 0.02))) throw new Error('Native Surface alignment failed');
    };
    const button = document.querySelector('#press button'), surface = document.querySelector('#press').surface;
    const before = surface.glass.filterId;
    button.dispatchEvent(new PointerEvent('pointerdown'));
    await until(() => surface.delta.w === 10);
    button.dispatchEvent(new PointerEvent('pointercancel'));
    await until(() => surface.delta.w === 0);
    await combined.settle();
    const refreshRetained = surface.glass.filterId !== before && combined.counters.read().retryTimers > 0;
    if (!refreshRetained) throw new Error('WebKit filter refresh path was lost');
    fixture.measure();
    for (const y of [0, 400, 1100, 0]) { fixture.scroll(y); await fixture.frames(3); align(); }
    const scroll = fixture.sample();
    fixture.nested(130); fixture.source(137); await fixture.frames(3); align();
    const shifted = await fixture.layoutShiftImage();
    if (shifted.shift !== 110) throw new Error('Native image did not cause a 110 px layout shift');
    align();
    fixture.state(0.5); await combined.settle(); await wait(450); align();
    window.nativeResult = { ready: true, variant: combined.variant, engine: fixture.engine, ua: navigator.userAgent,
      width: innerWidth, height: innerHeight, dpr: devicePixelRatio, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      refreshRetained, imageShift: shifted.shift, scroll, finalState: 0.5 };
  } catch (error) { window.nativeResult = { ready: false, error: error.message }; }
}

const documents = Object.fromEntries(['original', 'candidate'].map(variant => [variant,
  combinedDocument(variant, 3).replace('</html>', `<script>(${nativeProbe.toString()})()</script></html>`)]));
const server = createServer((request, response) => {
  const html = documents[request.url.slice(1)];
  response.writeHead(html ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html || 'Not found');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const results = { ...manifest, scope: ['lib/liquid-glass.js', 'lib/components.js'], cases: [] };
try {
  for (const variant of ['original', 'candidate']) {
    const image = `${output}/webkit-390-${variant}.png`;
    try {
      const { stdout } = await promisify(execFile)(process.env.SNAP_WEBKIT,
        [`http://127.0.0.1:${server.address().port}/${variant}`, image, '390', '844'], { timeout: 28000 });
      writeFileSync(image.replace('.png', '.log'), stdout);
      const result = JSON.parse(stdout.split('\n').find(line => line.startsWith('probe: ')).slice(7));
      assert.equal(result.ready, true, stdout);
      assert.equal(result.engine, 'webkit'); assert.equal(result.width, 390); assert.equal(result.height, 844);
      assert(readFileSync(image).length > 0);
      results.cases.push({ passed: true, ...result });
      console.log(`PASS native WebKit ${variant} 390×844 DPR ${result.dpr}: refresh retained, scroll aligned, image shift ${result.imageShift}`);
    } catch (error) {
      results.cases.push({ variant, passed: false, error: error.message }); process.exitCode = 1;
      console.error(`FAIL native WebKit ${variant}: ${error.message}`);
    }
    writeFileSync(`${output}/native.json`, JSON.stringify(results, null, 2) + '\n');
  }
} finally { await new Promise(resolve => server.close(resolve)); }
