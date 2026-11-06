import { summarizeTrials } from './metrics.js';

const names = { original: 'Original fork', previous: 'Previous engine', current: 'Current engine' };
const colors = { original: '#68717e', previous: '#c45c19', current: '#0071e3' };
const previews = [...document.querySelectorAll('.preview-build iframe')];
const status = document.querySelector('#status');
const stage = document.querySelector('#benchmark-stage');
const buttons = [document.querySelector('#run-benchmark'), document.querySelector('#run-benchmark-inline')];
let backdrop = 'city', previewPaused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let measuring = false, cancelled = false, report, activeFrame, change = 0, hiddenDuringRun = false;
let cancelMeasurement;

async function ready(iframe) {
  const deadline = performance.now() + 15000;
  while (!iframe.contentWindow?.sceneReady) {
    if (!iframe.isConnected || performance.now() > deadline) throw Error('Engine scene did not load');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await iframe.contentWindow.sceneReady;
  return iframe.contentWindow.scene;
}

function setPreviewLabel() {
  const toggle = document.querySelector('#preview-toggle');
  toggle.textContent = previewPaused ? 'Play preview' : 'Pause preview';
  toggle.setAttribute('aria-pressed', String(previewPaused));
}

async function updatePreviews() {
  const request = ++change;
  const options = { count: 1, backdrop, renderer: document.querySelector('#renderer').value, workload: document.querySelector('#workload').value };
  try {
    for (const frame of previews) {
      const scene = await ready(frame);
      if (request !== change || measuring) return;
      await scene.configure(options);
      if (!previewPaused && !measuring && request === change) scene.start();
    }
  } catch (error) { status.textContent = error.message; }
}

function drawChart(results) {
  const chart = document.querySelector('#frame-chart');
  const context = chart.getContext('2d');
  const width = chart.width, height = chart.height, padding = 34;
  context.clearRect(0, 0, width, height);
  const trials = results.builds.map(build => results.trials.find(trial => trial.build === build && trial.trial === 1));
  const maxTime = Math.max(34, ...trials.flatMap(trial => trial.intervals));
  context.font = '14px system-ui';
  context.fillStyle = '#111827'; context.fillText('Frame interval (ms)', padding, 19);
  const y = value => height - padding - value / maxTime * (height - padding * 2);
  context.strokeStyle = '#b7bec8'; context.setLineDash([4, 5]);
  context.beginPath(); context.moveTo(padding, y(results.refreshMs)); context.lineTo(width - padding, y(results.refreshMs)); context.stroke();
  context.setLineDash([]);
  context.fillText(`${results.refreshMs.toFixed(1)} ms reference`, width - 180, Math.max(18, y(results.refreshMs) - 8));
  for (const [index, trial] of trials.entries()) {
    const total = trial.intervals.reduce((sum, value) => sum + value, 0);
    let elapsed = 0;
    context.strokeStyle = colors[trial.build]; context.lineWidth = 1.5;
    context.beginPath();
    trial.intervals.forEach((value, frame) => {
      elapsed += value;
      const x = padding + elapsed / total * (width - padding * 2);
      if (!frame) context.moveTo(x, y(value)); else context.lineTo(x, y(value));
    });
    context.stroke();
    context.fillStyle = colors[trial.build]; context.fillText(names[trial.build], padding + index * 185, height - 8);
  }
  const description = `Middle trial frame intervals for ${results.builds.map(build => names[build]).join(', ')}. Lower is better. Dashed line: ${results.refreshMs.toFixed(2)} ms idle reference.`;
  chart.setAttribute('aria-label', description);
  document.querySelector('#chart-summary').textContent = description;
}

function displayResults(results) {
  const body = document.querySelector('#result-rows');
  body.replaceChildren();
  for (const build of results.builds) {
    const summary = results.summary[build];
    const row = body.insertRow();
    for (const [index, text] of [names[build], summary.fps.toFixed(1), `${summary.p95FrameMs.toFixed(1)} ms`, `${summary.meanUpdateMs.toFixed(2)} ms`, `${summary.missedSlotPercent.toFixed(1)}%`].entries()) {
      const cell = row.insertCell(); cell.textContent = text;
      cell.dataset.label = ['Build', 'Animation FPS', 'p95 frame', 'Update work', 'Missed slots'][index];
    }
    row.dataset.build = build;
  }
  document.querySelector('#results-caption').textContent = `Median of three trials per build · ${results.settings.count} lenses · ${results.settings.renderer.toUpperCase()} · ${results.settings.workload === 'reshape' ? 'reshaping' : 'cached movement'} · ${results.viewport.width} × ${results.viewport.height} scene · map scale 2 · idle reference ${(1000 / results.refreshMs).toFixed(1)} Hz. FPS ranges: ${results.builds.map(build => `${names[build]} ${results.summary[build].fpsRange.map(value => value.toFixed(1)).join('–')}`).join('; ')}. This is rAF cadence, not a physical presentation counter.`;
  document.querySelector('#download-results').disabled = false;
  document.querySelector('.chart-area').hidden = false;
  drawChart(results);
}

async function runBenchmark() {
  if (measuring) return;
  measuring = true; cancelled = false; hiddenDuringRun = false;
  ++change;
  const resume = !previewPaused;
  document.body.classList.add('measuring');
  for (const frame of previews) frame.contentWindow?.scene?.dispose();
  document.querySelectorAll('.live-fps output').forEach(output => { output.textContent = '—'; });
  document.querySelector('#cancel-benchmark').hidden = false;
  document.querySelector('#download-results').disabled = true;
  buttons.forEach(button => { button.disabled = true; });
  document.querySelectorAll('select, input, [data-backdrop], #preview-toggle').forEach(control => { control.disabled = true; });
  const settings = { count: Number(document.querySelector('#density').value), renderer: document.querySelector('#renderer').value, workload: document.querySelector('#workload').value, backdrop };
  const builds = document.querySelector('#include-original').checked ? ['original', 'previous', 'current'] : ['previous', 'current'];
  const durationMs = Number(document.querySelector('#duration').value) * 1000;
  const results = { schema: 1, date: new Date().toISOString(), userAgent: navigator.userAgent, devicePixelRatio,
    method: 'Three alternating trials per build, one visible scene at a time, 1000 ms warmup per trial. Animation FPS from rAF intervals; updates include synchronous engine work. Physical presentation, GPU time and energy are not measured. Idle rAF median is a cadence reference, not a guarantee of panel refresh rate.',
    settings, builds, trials: [], summary: {} };
  let completed = false;
  const aborted = new Promise((_, reject) => { cancelMeasurement = error => reject(error || Error('Measurement cancelled')); });
  aborted.catch(() => {});
  const wait = promise => Promise.race([promise, aborted]);
  const expectedSize = { width: stage.clientWidth, height: stage.clientHeight };
  const observer = new ResizeObserver(() => {
    if (stage.clientWidth !== expectedSize.width || stage.clientHeight !== expectedSize.height) {
      cancelMeasurement?.(Error('The benchmark scene resized; run again at the new size'));
    }
  });
  observer.observe(stage);
  stage.scrollIntoView({ behavior: 'instant', block: 'center' });
  const visibility = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.intersectionRatio < 0.98)) cancelMeasurement?.(Error('Keep the benchmark scene fully visible and run again'));
  }, { threshold: [0, 0.98, 1] });
  visibility.observe(stage);
  try {
    results.manifest = await wait(fetch('./builds/manifest.json').then(response => { if (!response.ok) throw Error('Build manifest did not load'); return response.json(); }));
    for (let trial = 0; trial < 3; trial++) {
      for (const build of trial % 2 ? [...builds].reverse() : builds) {
        if (cancelled) throw Error('Measurement cancelled');
        if (document.hidden || hiddenDuringRun) throw Error('The tab was hidden; keep it visible and run again');
        status.textContent = `${names[build]} · trial ${trial + 1} of 3 · preparing`;
        const iframe = document.createElement('iframe');
        iframe.title = `${names[build]} isolated benchmark`;
        iframe.src = `./scene.html?build=${build}`;
        activeFrame = iframe;
        stage.replaceChildren(iframe);
        const scene = await wait(ready(iframe));
        await wait(scene.configure(settings));
        const calibration = await wait(scene.calibrate());
        results.refreshMs ??= calibration.refreshMs;
        status.textContent = `${names[build]} · trial ${trial + 1} of 3 · measuring`;
        const result = await wait(scene.run({ durationMs, warmupMs: 1000, refreshMs: results.refreshMs }));
        if (cancelled) throw Error('Measurement cancelled');
        if (hiddenDuringRun) throw Error('The tab was hidden; keep it visible and run again');
        if (results.viewport && (result.viewport.width !== results.viewport.width || result.viewport.height !== results.viewport.height)) {
          throw Error('The scene size changed between trials; run the comparison again');
        }
        results.trials.push({ ...result, trial, idleIntervals: calibration.intervals });
        results.viewport = result.viewport;
      }
    }
    for (const build of builds) results.summary[build] = summarizeTrials(results.trials.filter(trial => trial.build === build));
    report = results;
    completed = true;
    displayResults(results);
    status.textContent = 'Comparison complete. These results describe this browser and the selected workload.';
    window.dispatchEvent(new CustomEvent('glass-benchmark-complete', { detail: results }));
  } catch (error) {
    status.textContent = cancelled ? 'Measurement cancelled. No partial run has been reported.' : `Measurement stopped: ${error.message}`;
    document.querySelector('#download-results').disabled = !report;
  } finally {
    observer.disconnect();
    visibility.disconnect();
    activeFrame?.contentWindow?.scene?.stop();
    if (!completed) {
      activeFrame?.remove();
      const image = document.createElement('img'); image.className = 'benchmark-placeholder';
      image.src = `./media/${backdrop}.jpg`; image.alt = 'Benchmark stopped; ready for a new run';
      stage.replaceChildren(image);
    }
    activeFrame = null;
    cancelMeasurement = null;
    measuring = false;
    document.body.classList.remove('measuring');
    buttons.forEach(button => { button.disabled = false; });
    document.querySelector('#cancel-benchmark').hidden = true;
    document.querySelectorAll('select, input, [data-backdrop], #preview-toggle').forEach(control => { control.disabled = false; });
    previewPaused = !resume;
    updatePreviews();
  }
}

buttons.forEach(button => button.addEventListener('click', runBenchmark));
document.querySelector('#cancel-benchmark').addEventListener('click', () => {
  cancelled = true;
  cancelMeasurement?.();
  activeFrame?.contentWindow?.scene?.stop();
  activeFrame?.remove();
});
document.querySelector('#preview-toggle').addEventListener('click', () => {
  previewPaused = !previewPaused; setPreviewLabel();
  if (previewPaused) document.querySelectorAll('.live-fps output').forEach(output => { output.textContent = '—'; });
  for (const frame of previews) if (previewPaused) { frame.contentWindow?.scene?.stop(); frame.contentWindow?.scene?.step(0); } else frame.contentWindow?.scene?.start();
});
for (const button of document.querySelectorAll('[data-backdrop]')) button.addEventListener('click', () => {
  backdrop = button.dataset.backdrop;
  document.querySelectorAll('[data-backdrop]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  updatePreviews();
});
for (const select of document.querySelectorAll('#workload, #renderer')) select.addEventListener('change', updatePreviews);
document.querySelector('.benchmark-settings').addEventListener('submit', event => { event.preventDefault(); runBenchmark(); });
document.querySelector('#download-results').addEventListener('click', () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'liquidglass-device-fps.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
addEventListener('message', event => {
  if (event.origin !== location.origin || !previews.some(frame => event.source === frame.contentWindow)) return;
  if (event.data?.type === 'glass-preview-fps' && ['previous', 'current'].includes(event.data.build) && !measuring) {
    document.querySelector(`#preview-fps-${event.data.build}`).textContent = Number(event.data.fps).toFixed(0);
  }
  if (event.data?.type === 'glass-scene-error') status.textContent = event.data.error;
});
addEventListener('visibilitychange', () => {
  if (measuring && document.hidden) {
    hiddenDuringRun = true;
    cancelMeasurement?.(Error('The tab was hidden; keep it visible and run again'));
  }
});
addEventListener('resize', () => {
  if (measuring) cancelMeasurement?.(Error('The window resized; run the comparison again'));
});
window.comparison = { run: runBenchmark, get report() { return report; }, get measuring() { return measuring; } };
setPreviewLabel();
updatePreviews();

fetch('./recorded-fps.json').then(response => response.ok ? response.json() : null).then(recorded => {
  if (!recorded) return;
  const target = document.querySelector('#recorded-results');
  const title = document.createElement('h3'); title.textContent = 'Recorded on our test machine';
  const text = document.createElement('p'); text.textContent = `${recorded.environment.browserProduct}, ${recorded.environment.headless ? 'headless' : 'visible browser'}, ${recorded.date.slice(0, 10)}. These engine-only results are separate from measurements on your device and do not measure navbar gestures.`;
  const link = document.createElement('a'); link.href = './recorded-fps.json'; link.textContent = 'Read the recorded summary and source hashes';
  const table = document.createElement('table'); table.setAttribute('aria-label', 'Recorded headless benchmark medians');
  const labels = ['Scene', 'Previous FPS', 'Current FPS', 'Previous update', 'Current update'];
  const heading = table.createTHead().insertRow();
  for (const label of labels) { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; heading.appendChild(cell); }
  const body = table.createTBody();
  for (const item of recorded.configurations) {
    const row = body.insertRow();
    const previous = item.summary.previous, current = item.summary.current;
    const scene = `${item.settings.renderer.toUpperCase()} · ${item.settings.count} lenses · ${item.settings.workload === 'reshape' ? 'reshape' : 'cached move'}`;
    for (const [index, value] of [scene, previous.fps.toFixed(1), current.fps.toFixed(1), `${previous.meanUpdateMs.toFixed(2)} ms`, `${current.meanUpdateMs.toFixed(2)} ms`].entries()) {
      const cell = row.insertCell(); cell.textContent = value; cell.dataset.label = labels[index];
    }
  }
  const note = document.createElement('p'); note.textContent = 'Three trials per build. Sample ranges overlap in several cases. Faster map generation does not guarantee higher FPS; the saved summary retains medians and ranges.';
  target.replaceChildren(title, text, table, note, link); target.hidden = false;
}).catch(() => {});
