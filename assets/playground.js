import { renderLensMap } from '../lib/liquid-glass.js';
import { codeBlock } from './code-blocks.js';
import { t, onLanguageChange } from './language.js';

const $ = (selector) => document.querySelector(selector);

const pgLens = $('#pg-lens');
if (pgLens) {
  const controls = {
    width: { value: 240, min: 120, max: 360, step: 2 },
    height: { value: 160, min: 80, max: 280, step: 2 },
    radius: { value: 80, min: 0, max: 140, step: 1 },
    refraction: { value: 28, min: 0, max: 60, step: 1 },
    bezel: { value: 0.6, min: 0.1, max: 1, step: 0.05 },
    curvature: { value: 4, min: 1.5, max: 8, step: 0.5 },
    chroma: { value: 0.15, min: 0, max: 0.5, step: 0.01 },
    blur: { value: 0, min: 0, max: 8, step: 0.5 },
    specular: { value: 0.5, min: 0, max: 1, step: 0.05 },
  };
  const params = Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control.value]));
  const box = $('#pg-params');
  const map = $('#pg-map');
  const code = codeBlock('', 'html', 'HTML');
  $('#pg-code').append(code);
  const labels = [];

  for (const [key, { min, max, step }] of Object.entries(controls)) {
    const row = document.createElement('div');
    row.className = 'param';
    const id = `pg-${key}`;
    row.innerHTML = `<label for="${id}"></label><output></output>`;
    const slider = document.createElement('lg-slider');
    Object.entries({ min, max, step, value: params[key], label: key, id }).forEach(([k, v]) => slider.setAttribute(k, v));
    row.append(slider);
    box.append(row);
    const label = row.querySelector('label');
    const out = row.querySelector('output');
    labels.push(() => (label.textContent = t().params[key]));
    out.textContent = params[key];
    slider.addEventListener('input', () => {
      params[key] = Number(slider.value);
      out.textContent = params[key];
      update();
    });
  }
  labels.forEach((f) => f());
  onLanguageChange(() => labels.forEach((f) => f()));

  function drawMap() {
    const dpr = window.devicePixelRatio || 1;
    map.width = Math.round(map.clientWidth * dpr);
    map.height = Math.round(map.clientHeight * dpr);
    const ctx = map.getContext('2d');
    ctx.fillStyle = 'rgb(128,128,128)';
    ctx.fillRect(0, 0, map.width, map.height);
    const { canvas } = renderLensMap({ ...params, radius: Math.min(params.radius, params.width / 2, params.height / 2) }, 1);
    const s = Math.min(map.width / canvas.width, map.height / canvas.height) * 0.86;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, (map.width - canvas.width * s) / 2, (map.height - canvas.height * s) / 2, canvas.width * s, canvas.height * s);
  }

  let frame = 0;
  function update() {
    pgLens.configure?.({ ...params });
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      drawMap();
      const attrs = Object.entries(params)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      code.update(`<lg-lens ${attrs}>\n  <img src="photo.jpg" alt="">\n</lg-lens>`);
    });
  }
  customElements.whenDefined('lg-lens').then(() => requestAnimationFrame(update));
  new ResizeObserver(() => drawMap()).observe(map);
}
