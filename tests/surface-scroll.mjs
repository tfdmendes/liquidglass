import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixture as renderFixture, runtime } from '../review/build-surface-scroll.mjs';
import { comparePixels } from './helpers/compare-pixels.mjs';

const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const modulePath = process.env.PLAYWRIGHT_MODULE || createRequire(import.meta.url).resolve('playwright');
const { PNG } = await import(new URL('../playwright-core/lib/utilsBundle.js', pathToFileURL(modulePath)));
function difference(a, b) {
  return comparePixels(PNG.sync.read(a), PNG.sync.read(b));
}
const engine = process.argv[2] || 'chromium';
const output = process.env.EVIDENCE_DIR || '/tmp/liquidglass-surface-scroll';
const candidateSha256 = createHash('sha256').update(readFileSync(new URL('../lib/components.js', import.meta.url))).digest('hex');
mkdirSync(output, { recursive: true });
if (engine === 'webkit') {
  runNativeWebKit();
  process.exit(0);
}
const browser = await playwright[engine].launch({
  headless: true,
  executablePath: engine === 'firefox' ? process.env.FIREFOX_EXECUTABLE : process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const results = [];
try {
  for (const config of [
    { width: 1280, height: 800, dpr: 1, motion: 'no-preference' },
    { width: 390, height: 844, dpr: 2, motion: 'no-preference' },
    { width: 1280, height: 800, dpr: 1.5, motion: 'reduce' },
  ]) {
    const context = await browser.newContext({
      viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.dpr, reducedMotion: config.motion,
      ...(engine === 'firefox' ? { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0' } : {}),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(fileURLToPath(new URL('../review/surface-scroll.html', import.meta.url))).href);
    await page.waitForFunction(() => window.reviewReady);
    if (config.width !== 1280) await page.selectOption('#viewport', `${config.width},${config.height}`);
    await page.waitForFunction(() => window.reviewReady);
    await page.evaluate(() => review.settle());
    const candidate = page.frames()[2];
    assert.equal(await candidate.evaluate(() => fixture.engine), engine === 'firefox' ? 'gecko' : 'blink');
    const align = async (label) => {
      const geometry = await candidate.evaluate(() => fixture.geometry(true));
      assert(geometry.length > 0, `${label}: visible copy surfaces`);
      for (const g of geometry) for (const key of ['dx', 'dy', 'dw', 'dh']) assert(Math.abs(g[key]) < 0.02, `${label}: ${g.id} ${key}=${g[key]}`);
    };
    await align('initial');
    const counts = await page.evaluate(() => review.replay());
    assert(counts[1].reads < counts[0].reads * 0.4, `scroll should remove redundant geometry work on a sparse page: ${JSON.stringify(counts)}`);
    await align('viewport re-entry');
    await candidate.evaluate(async () => {
      document.querySelector('#source-scroller').style.position='fixed';
      const entering=document.querySelector('#sparse-27');entering.remove();entering.setAttribute('backdrop','#moving-source');document.querySelector('#scene').append(entering);
      fixture.scroll(6000); dispatchEvent(new Event('scroll')); await fixture.frames(1);
    });
    await align('first frame after jump');
    await candidate.evaluate(async () => {
      document.querySelector('#source-scroller').style.position='';
      const entering=document.querySelector('#sparse-27');entering.remove();entering.removeAttribute('backdrop');document.querySelector('#scene').append(entering);
      fixture.scroll(0); dispatchEvent(new Event('scroll')); await fixture.frames(1);
    });
    for (const [method, value] of [['nested', 130], ['source', 137]]) {
      await page.evaluate(([method, value]) => { review.fixtures().forEach(f => f[method](value)); return review.settle(); }, [method, value]);
      await align(method);
    }
    const unrelated = await candidate.evaluate(async () => { fixture.measure(); fixture.unrelated(40); await fixture.frames(4); return fixture.sample(); });
    assert.equal(unrelated.reads, 0, 'unrelated nested scroll should not measure any Surface');
    await candidate.evaluate(async () => { document.querySelector('#flow').style.transform='translate(13.25px,7.5px)'; dispatchEvent(new Event('scroll')); await fixture.frames(3); });
    await align('CSS transform followed by scroll');
    await page.evaluate(async () => { for (const f of review.fixtures()) { f.state(1); f.scroll(1500); } await review.settle(); for (const f of review.fixtures()) f.state(0.5); await review.settle(); for (const f of review.fixtures()) { f.state(0); f.scroll(0); } await review.settle(); });
    await align('offscreen deformation and resume');
    await candidate.evaluate(async () => { const n=document.querySelector('#flow'); n.style.display='none'; await fixture.frames(3); n.style.display='block'; n.style.width='235px'; await fixture.frames(4); });
    await align('hidden/show and resize');
    await candidate.evaluate(async () => { frameElement.style.width='987px'; await fixture.frames(4); });
    await align('viewport resize');
    await candidate.evaluate(async width => { frameElement.style.width=width+'px'; await fixture.frames(4); }, config.width);
    const late = await candidate.evaluate(() => fixture.image());
    assert(Math.abs(late.dx) < 0.02 && Math.abs(late.dw) < 0.02, 'image load aligns its own Surface');
    await candidate.evaluate(async () => { const n=document.querySelector('#late'); n.remove(); document.querySelector('#late-source').dispatchEvent(new Event('load')); document.querySelector('#scene').append(n); await fixture.frames(4); });
    await align('detach/reconnect');
    const shifted = await candidate.evaluate(() => fixture.layoutShiftImage());
    assert(shifted.shift >= 100, 'the loaded image must cause a real document layout shift');
    await align('image load moves other surfaces relative to fixed backdrops');
    await candidate.evaluate(async () => { const n=document.querySelector('#press button'); for(let i=0;i<6;i++){n.dispatchEvent(new PointerEvent('pointerdown'));n.dispatchEvent(new PointerEvent('pointercancel'));} await new Promise(resolve=>setTimeout(resolve,700)); });
    await align('rapid press/cancel');
    await page.selectOption('#count', '3');
    await page.waitForFunction(() => window.reviewReady);
    const small = await page.evaluate(() => review.replay());
    assert(small[1].reads < small[0].reads, 'small pages must also remove scroll geometry work');
    const idle = await candidate.evaluate(async () => { fixture.measure(); await fixture.frames(12); return fixture.sample(); });
    assert.equal(idle.reads, 0, 'a static page must not gain a geometry polling loop');
    await page.selectOption('#count', '240');
    await page.waitForFunction(() => window.reviewReady);
    await page.evaluate(() => review.settle());
    const scenes = await page.locator('iframe').evaluateAll(frames => frames.map(frame => frame.srcdoc));
    const shots = [0, 0.5, 1].map(state => ({ state, key: `${engine}-${config.width}-dpr${config.dpr}-${config.motion}-p${state}` }));
    const captured = [[], [], [], []];
    for (const i of [0, 1, 2, 3]) {
      const shotPage = await context.newPage();
      await shotPage.setContent(scenes[i % 2]);
      await shotPage.waitForFunction(() => window.fixtureReady);
      for (const shot of shots) {
        await shotPage.evaluate(p => fixture.state(p), shot.state);
        await shotPage.waitForTimeout(600);
        captured[i].push(await shotPage.screenshot({ path: `${output}/${shot.key}-${i % 2 ? 'candidate' : 'original'}${i > 1 ? '-repeat' : ''}.png` }));
      }
      await shotPage.close();
    }
    shots.forEach((shot, i) => Object.assign(shot, {
      originalCandidate: difference(captured[0][i], captured[1][i]),
      originalRepeat: difference(captured[0][i], captured[2][i]),
      candidateRepeat: difference(captured[1][i], captured[3][i]),
    }));
    await candidate.evaluate(async () => { dispatchEvent(new Event('scroll')); document.querySelectorAll('lg-panel,lg-button').forEach(n=>n.remove()); await fixture.frames(4); });
    assert.deepEqual(errors, []);
    results.push({ ...config, candidateSha256, engine, runtime: browser.version(), counts, small, idle, unrelated, shots, errors });
    console.log(`${engine} ${config.width} DPR ${config.dpr}: ${counts[0].reads} -> ${counts[1].reads} geometry reads; pixels ${shots.map(s => s.originalCandidate.pixels).join(',')}`);
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(`${output}/${engine}.json`, JSON.stringify(results, null, 2) + '\n');
}
console.log(JSON.stringify(results, null, 2));

function nativeProbe() {
  const start = Date.now();
  const wait = () => {
    if (!window.fixtureReady) {
      if (Date.now() - start > 15000) window.nativeResult = { ready: false, error: 'Fixture did not initialize' };
      else setTimeout(wait, 30);
      return;
    }
    (async () => {
      const state = Number(new URL(location.href).searchParams.get('state') || 0);
      window.nativeStage = 'warmup';
      await new Promise(resolve => setTimeout(resolve, 350));
      const check = () => {
        const errors = fixture.geometry(true).filter(g => ['dx', 'dy', 'dw', 'dh'].some(k => Math.abs(g[k]) > 0.02));
        if (errors.length) throw new Error(JSON.stringify(errors));
      };
      let counts;
      if (!state) {
        fixture.measure();
        for (const y of [0,120,400,1450,2300,6000,0]) {
          window.nativeStage = `scroll ${y}`;
          fixture.scroll(y); await fixture.frames(3);
        }
        counts = fixture.sample();
        window.nativeStage = 'entry';
        check();
        fixture.scroll(6000); dispatchEvent(new Event('scroll')); await fixture.frames(1); check();
        fixture.scroll(0); fixture.nested(130); fixture.source(137); await fixture.frames(3); check();
        window.nativeStage = 'layout image';
        const shift = await fixture.layoutShiftImage();
        if (shift.shift < 100) throw new Error('Image must cause a real layout shift');
        check();
        document.querySelector('#flow-image-panel').remove(); document.querySelector('#flow-image').remove();
        fixture.nested(0); fixture.source(0); dispatchEvent(new Event('resize')); await fixture.frames(4); check();
      }
      window.nativeStage = 'deformation';
      fixture.state(state); await fixture.frames(3);
      window.nativeStage = 'maps';
      let lastIDs = '', stableSince = Date.now();
      while (true) {
        const surfaces = [...document.querySelectorAll('lg-panel,lg-button')].map(n => n.surface).filter(s => s.glass);
        const ids = surfaces.map(s => s.glass.filterId).join('|');
        if (ids !== lastIDs) { lastIDs = ids; stableSince = Date.now(); }
        const mapsReady = await Promise.all(surfaces.map(async s => {
          const href = document.getElementById(s.glass.filterId)?.querySelector('feImage')?.getAttribute('href');
          if (!href) return false;
          const image = new Image(); image.src = href; await image.decode();
          const p = s.glass.params, scale = Math.min(devicePixelRatio,2);
          return image.naturalWidth === Math.max(2,Math.round(p.width*scale)) && image.naturalHeight === Math.max(2,Math.round(p.height*scale));
        }));
        if (mapsReady.every(Boolean) && Date.now()-stableSince > 350) break;
        if (Date.now()-start > 24000) throw new Error('Lens maps did not settle');
        await new Promise(resolve => setTimeout(resolve,50));
      }
      check();
      window.nativeResult = { ready: true, engine: fixture.engine, ua: navigator.userAgent, dpr: devicePixelRatio, width: innerWidth, height: innerHeight, state, counts };
    })().catch(error => window.nativeResult = { ready: false, error: error.stack });
  };
  wait();
}

function runNativeWebKit() {
  assert(process.env.SNAP_WEBKIT, 'Set SNAP_WEBKIT to the compiled repo snap-webkit.swift binary');
  const results = [];
  for (const config of [{ width:1280, height:800 }, { width:390, height:844 }]) {
    const counts = [], shots = [];
    for (const state of [0, 0.5, 1]) {
      const pair = [];
      for (const [i, name] of ['original', 'candidate'].entries()) {
        const path = `${output}/webkit-${name}.html`;
        writeFileSync(path, renderFixture(runtime.core, runtime[name], 240).replace('</html>', `<script>(${nativeProbe.toString()})()</script></html>`));
        const image = `${output}/webkit-${config.width}-p${state}-${name}.png`;
        const local = new URL('../review/.surface-scroll-native.html', import.meta.url);
        writeFileSync(local, readFileSync(path));
        let stdout;
        try {
          stdout = execFileSync(process.env.SNAP_WEBKIT, [`${process.env.NATIVE_ORIGIN || 'http://127.0.0.1:4383'}/review/.surface-scroll-native.html?state=${state}`, image, String(config.width), String(config.height)], { encoding:'utf8', timeout:28000 });
        } finally {
          rmSync(local, { force: true });
        }
        writeFileSync(image.replace('.png','.log'), stdout);
        const result = JSON.parse(stdout.split('\n').find(line => line.startsWith('probe: ')).slice(7));
        assert.equal(result.ready, true, stdout);
        assert.equal(result.engine, 'webkit');
        assert.equal(result.width, config.width);
        if (!state) counts[i] = result.counts;
        pair.push(readFileSync(image));
        console.log(`WebKit ${config.width} p=${state} ${name}: ready, DPR ${result.dpr}`);
      }
      shots.push({ state, originalCandidate:difference(...pair) });
    }
    assert(counts[1].reads < counts[0].reads * 0.4);
    results.push({ ...config, candidateSha256, engine:'webkit', counts, shots });
    writeFileSync(`${output}/webkit.json`, JSON.stringify(results,null,2)+'\n');
  }
}
