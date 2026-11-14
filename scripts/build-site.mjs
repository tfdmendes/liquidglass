import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildShowcase } from './build-showcase.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const mediaTypes = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.ico'];

function verifyBenchmarkEvidence() {
  const raster = JSON.parse(readFileSync(new URL('docs/performance/raster-spans-results.json', root), 'utf8'));
  const animation = JSON.parse(readFileSync(new URL('docs/performance/fps-cpu-canvas-results.json', root), 'utf8'));
  const components = JSON.parse(readFileSync(new URL('docs/performance/component-refactor-fps-results.json', root), 'utf8'));
  function requireHash(recorded, expected, description) {
    if (!/^[a-f0-9]{64}$/.test(recorded) || recorded !== expected) {
      throw Error(`Stale benchmark evidence: ${description}. Update the recorded evidence before publishing`);
    }
  }
  // These workloads import the two engines directly, without the UI components
  for (const file of ['liquid-glass.js', 'glass-webgl.js']) {
    const actual = createHash('sha256').update(readFileSync(new URL(`lib/${file}`, root))).digest('hex');
    requireHash(animation.manifest?.builds?.current?.sha256?.[file], actual, `recorded animation hash does not match lib/${file}`);
  }
  requireHash(animation.manifest?.builds?.previous?.sha256?.['liquid-glass.js'], '2c26f1c24daeaf8e66603699ba5b7a0de9e99c5aff8f23e4b5088ad2db1d929b', 'animation baseline core does not match the recorded intermediate build');
  for (const [variant, revision] of [['previous', '938df92e98d935c5fc61c3c7e0953a216bf831ce'], ['new', 'a863784']]) {
    const source = execFileSync('git', ['show', `${revision}:lib/liquid-glass.js`], { cwd: fileURLToPath(root) });
    requireHash(raster.sourceSHA256?.[variant], createHash('sha256').update(source).digest('hex'), `historical raster ${variant} does not match ${revision}`);
  }
  if (animation.configurations?.length !== 5 || animation.configurations.some(({ trials }) =>
    !Array.isArray(trials) || ['previous', 'current'].some(build => trials.filter(trial => trial.build === build).length !== 5))) {
    throw Error('Stale benchmark evidence: expected five paired trials in each of five animation workloads');
  }
  const workloads = new Set(animation.configurations.map(({ settings }) => `${settings.renderer}:${settings.workload}:${settings.count}`));
  for (const key of ['svg:reshape:12', 'svg:reshape:24', 'svg:move:24', 'webgl:reshape:24', 'webgl:move:24']) {
    if (!workloads.has(key)) throw Error(`Stale benchmark evidence: missing animation workload ${key}`);
  }
  for (const variant of ['previous', 'current']) {
    const source = components.sources?.[variant];
    for (const file of ['components.js', 'liquid-glass.js']) {
      const actual = variant === 'current' ? readFileSync(new URL(`lib/${file}`, root))
        : execFileSync('git', ['show', `${source.revision}:lib/${file}`], { cwd: fileURLToPath(root) });
      requireHash(source?.sha256?.[file], createHash('sha256').update(actual).digest('hex'), `component ${variant} hash does not match ${file}`);
    }
  }
  if (components.configurations?.length !== 3 || components.configurations.some(({ trials }) =>
    !Array.isArray(trials) || ['previous', 'current'].some(build => trials.filter(trial => trial.build === build).length !== 5))) {
    throw Error('Stale benchmark evidence: expected five paired trials in each of three component workloads');
  }
  const componentWorkloads = new Set(components.configurations.map(({ workload }) => workload));
  for (const key of ['menu-open', 'navbar-drag', 'segmented-drag']) {
    if (!componentWorkloads.has(key)) throw Error(`Stale benchmark evidence: missing component workload ${key}`);
  }
}

function copyPublicTree(source, destination, extensions) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const input = new URL(entry.name + (entry.isDirectory() ? '/' : ''), source);
    const target = new URL(entry.name + (entry.isDirectory() ? '/' : ''), destination);
    if (entry.isDirectory()) copyPublicTree(input, target, extensions);
    else if (entry.isFile() && extensions.includes(extname(entry.name).toLowerCase())) copyFileSync(input, target);
  }
}

function versionSiteAssets() {
  const asset = (name) => new URL(`assets/${name}`, output);
  const version = (path) => createHash('sha256').update(readFileSync(new URL(path, output))).digest('hex').slice(0, 12);
  const componentVersion = createHash('sha256').update(readFileSync(new URL('lib/components.js', output))).digest('hex').slice(0, 12);
  for (const name of ['main.js', 'docs.js']) {
    const module = asset(name);
    writeFileSync(module, readFileSync(module, 'utf8').replace("'../lib/components.js'", `'../lib/components.js?v=${componentVersion}'`));
  }
  const main = asset('main.js');
  const benchmarks = asset('benchmarks.js');
  let benchmarkSource = readFileSync(benchmarks, 'utf8');
  for (const name of ['raster-spans-results.json', 'fps-cpu-canvas-results.json', 'component-refactor-fps-results.json']) {
    const hash = version(`docs/performance/${name}`);
    benchmarkSource = benchmarkSource.replace(`../docs/performance/${name}'`, `../docs/performance/${name}?v=${hash}'`);
  }
  writeFileSync(benchmarks, benchmarkSource);
  writeFileSync(main, readFileSync(main, 'utf8').replace("'./benchmarks.js'", `'./benchmarks.js?v=${version('assets/benchmarks.js')}'`));
  const paths = ['assets/site.css', 'assets/docs.css', 'assets/main.js', 'assets/docs.js',
    ...['current-map-time.svg', 'current-animation-fps.svg', 'current-update-time.svg', 'current-component-fps.svg'].map(name => `docs/performance/${name}`)];
  const versions = new Map(paths.map(path => [path, version(path)]));
  for (const name of ['index.html', 'docs/index.html']) {
    const page = new URL(name, output);
    let html = readFileSync(page, 'utf8');
    for (const [path, hash] of versions) html = html.replaceAll(`${path}"`, `${path}?v=${hash}"`);
    writeFileSync(page, html);
  }
}

export function buildSite() {
  verifyBenchmarkEvidence();
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const name of ['index.html', 'LICENSE', 'robots.txt', 'sitemap.xml']) copyFileSync(new URL(name, root), new URL(name, output));
  copyPublicTree(new URL('lib/', root), new URL('lib/', output), ['.js']);
  copyPublicTree(new URL('assets/', root), new URL('assets/', output), [...mediaTypes, '.css', '.js', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.webm']);
  copyFileSync(new URL('assets/fonts/OFL.txt', root), new URL('assets/fonts/OFL.txt', output));
  copyPublicTree(new URL('images/', root), new URL('images/', output), mediaTypes);
  mkdirSync(new URL('docs/', output), { recursive: true });
  for (const name of ['index.html', 'deployment.md']) copyFileSync(new URL(`docs/${name}`, root), new URL(`docs/${name}`, output));
  copyPublicTree(new URL('docs/performance/', root), new URL('docs/performance/', output), ['.html', '.md', '.svg', '.json', '.patch']);
  versionSiteAssets();
  buildShowcase(fileURLToPath(new URL('showcase/', output)));
  copyFileSync(new URL('showcase/README.md', root), new URL('showcase/README.md', output));
  writeFileSync(new URL('.nojekyll', output), '');
  return fileURLToPath(output);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Built static site: ${buildSite()}`);
}
