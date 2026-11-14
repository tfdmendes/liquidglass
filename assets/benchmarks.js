const asset = (path) => new URL(path, import.meta.url);

async function readRecord(path) {
  const response = await fetch(asset(path));
  if (!response.ok) throw new Error(`Measurement request failed: ${response.status}`);
  return response.json();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function format(value) {
  return value.toFixed(value < 1 ? 3 : 2);
}

function renderMetric(mount, rows, { unit, note, initial = 0, higher = false, labels = ['Before', 'After'] }) {
  const shell = element('div', 'benchmark-shell');
  shell.setAttribute('data-ui', '');
  shell.setAttribute('data-lg-backdrop', 'img');
  const backdrop = element('img', 'benchmark-backdrop');
  backdrop.src = asset('./material-lagoon.webp');
  backdrop.alt = '';
  backdrop.width = 1800;
  backdrop.height = 1200;
  const panel = document.createElement('lg-panel');
  panel.className = 'benchmark-panel';
  for (const [name, value] of Object.entries({ tone: 'light', radius: 24, refraction: 8, bezel: 0.15, blur: 2, specular: 0.1, 'specular-width': 0.6 })) panel.setAttribute(name, value);
  const pickerPanel = element('lg-panel', 'benchmark-picker-shell');
  for (const [name, value] of Object.entries({ tone: 'light', radius: 'capsule', refraction: 24, bezel: 0.5, chroma: 0, blur: 0, specular: 0.4, 'specular-width': 1 })) pickerPanel.setAttribute(name, value);
  const picker = element('lg-segmented', 'benchmark-picker');
  for (const [name, value] of Object.entries({ label: 'Benchmark workload', value: initial, radius: 'capsule', refraction: 5, chroma: 0, specular: 0.4, 'specular-width': 1 })) picker.setAttribute(name, value);
  const chart = element('div', 'benchmark-chart');
  rows.forEach((row, index) => {
    const button = element('button', '', row.short);
    button.type = 'button';
    button.value = String(index);
    picker.append(button);
  });
  picker.addEventListener('change', (event) => select(event.detail.index));

  function select(index) {
    const row = rows[index];
    const largest = Math.max(row.previousRange[1], row.currentRange[1]) * 1.08;
    const step = 10 ** Math.floor(Math.log10(largest));
    const maximum = Math.ceil(largest / step) * step;
    const ticks = new Intl.NumberFormat('en-US', { maximumFractionDigits: Math.max(0, 1 - Math.floor(Math.log10(step))) });
    chart.replaceChildren();
    const heading = element('div', 'benchmark-heading');
    heading.append(element('h3', '', row.name), element('p', '', row.description));
    chart.append(heading);
    for (const variant of ['previous', 'current']) {
      const value = row[variant], bounds = row[`${variant}Range`];
      const bar = element('div', `benchmark-bar benchmark-bar--${variant}`);
      const label = element('div', 'benchmark-label');
      const number = element('strong', '', format(value));
      number.append(element('span', '', unit));
      label.append(element('span', '', labels[variant === 'previous' ? 0 : 1]), number);
      const track = element('div', 'benchmark-track');
      track.setAttribute('role', 'img');
      track.setAttribute('aria-label', `${variant}: median ${format(value)} ${unit}, range ${format(bounds[0])} to ${format(bounds[1])} ${unit}, zero-based scale to ${ticks.format(maximum)} ${unit}`);
      const fill = element('span', 'benchmark-fill');
      fill.style.width = `${value / maximum * 100}%`;
      const range = element('span', 'benchmark-range');
      range.style.left = `${bounds[0] / maximum * 100}%`;
      range.style.width = `${(bounds[1] - bounds[0]) / maximum * 100}%`;
      track.append(fill, range);
      bar.append(label, track);
      chart.append(bar);
    }
    const axis = element('div', 'benchmark-axis');
    axis.setAttribute('aria-hidden', 'true');
    axis.append(element('span', '', '0'), element('span', '', ticks.format(maximum / 2)), element('span', '', `${ticks.format(maximum)} ${unit}`));
    const difference = row.current - row.previous;
    const result = higher
      ? `${Math.abs(difference).toFixed(2)} ${unit} ${difference >= 0 ? 'higher' : 'lower'}`
      : `${(Math.abs(difference) / row.previous * 100).toFixed(1)}% ${difference < 0 ? 'less' : 'more'} time`;
    const outcome = element('div', 'benchmark-outcome');
    outcome.append(element('strong', '', result), element('span', '', higher ? 'Higher cadence is better' : 'Lower time is better'));
    chart.append(axis, outcome);
    // A longer chart can resize the backdrop without resizing this control
    pickerPanel.surface?.update();
  }

  const caption = element('p', 'benchmark-note', note);
  pickerPanel.append(picker);
  panel.append(pickerPanel, chart, caption);
  shell.append(backdrop, panel);
  mount.replaceChildren(shell);
  select(initial);
}

async function initializeBenchmarks() {
  try {
    const [raster, animation] = await Promise.all([
      readRecord('../docs/performance/raster-spans-results.json'),
      readRecord('../docs/performance/fps-cpu-canvas-results.json'),
    ]);
    const mapCases = [
      ['panel map', 'Panel', 'Panel map', '640 × 360 pixels'],
      ['button map', 'Button', 'Button map', '120 × 64 pixels'],
      ['capsule map', 'Capsule', 'Capsule map', '240 × 64 pixels'],
      ['unique lens updates', 'Update', 'Unique lens update', 'A new lens shape on each update'],
    ];
    const maps = mapCases.map(([workload, short, name, description]) => {
      const row = raster.summary.find(item => item.workload === workload);
      return { short, name, description, previous: row.previousMs, current: row.newMs, previousRange: row.previousRangeMs, currentRange: row.newRangeMs };
    });
    function scenes(key, rangeKey) {
      return animation.configurations.map(({ settings, summary }) => {
        const moving = settings.workload === 'move';
        const renderer = settings.renderer === 'webgl' ? 'WebGL' : 'SVG';
        return {
          short: moving ? `${renderer} move` : renderer === 'WebGL' ? 'WebGL shape' : `${settings.count} SVG`,
          name: `${settings.count} ${renderer} lenses`,
          description: moving ? 'Moving cached shapes' : 'Changing lens shapes each frame',
          previous: summary.previous[key], current: summary.current[key],
          previousRange: summary.previous[rangeKey], currentRange: summary.current[rangeKey],
        };
      });
    }
    const fps = scenes('fps', 'fpsRange'), updates = scenes('meanUpdateMs', 'meanUpdateMsRange');
    for (const row of [...maps, ...fps, ...updates]) {
      if (![row.previous, row.current, ...row.previousRange, ...row.currentRange].every(Number.isFinite)) throw new Error('Invalid recorded measurement');
    }
    const trialCounts = animation.configurations.map(({ trials }) => trials.filter(trial => trial.build === 'current').length);
    if (!trialCounts.length || !trialCounts.every(count => count === trialCounts[0] && count > 0)) throw new Error('Inconsistent trial counts');
    const count = trialCounts[0];
    renderMetric(document.querySelector('#figure-maps'), maps, { unit: 'ms', labels: ['Earlier', 'Later'], note: `Historical comparison from ${raster.date.slice(0, 10)}, independently measured against revision 938df92. ${raster.samplesPerVariant} paired samples per build. Whiskers show the recorded minimum and maximum.` });
    renderMetric(document.querySelector('#figure-fps'), fps, { unit: 'FPS', higher: true, initial: 1, note: `${count} paired trials per build on ${animation.date.slice(0, 10)}. The baseline is the intermediate engine, not the earlier raster comparison or live comparison baseline. Whiskers show min–max. Headless rAF cadence is not physical presentation.` });
    renderMetric(document.querySelector('#figure-update'), updates, { unit: 'ms', initial: 3, note: `${count} paired trials per build on ${animation.date.slice(0, 10)}. Median of mean synchronous update times; min–max whiskers. Async decode and GPU completion are excluded.` });
  } catch {
    for (const mount of document.querySelectorAll('.benchmark-mount')) {
      const message = element('p', 'benchmark-error', 'The recorded chart could not load. ');
      const link = element('a', '', 'Read the measurements on GitHub ↗');
      link.href = 'https://github.com/tfdmendes/liquidglass/blob/main/docs/performance/README.md';
      message.append(link);
      mount.replaceChildren(message);
    }
  }
}

initializeBenchmarks();
