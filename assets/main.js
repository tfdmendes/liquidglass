import { toast } from '../lib/components.js';
import './benchmarks.js';

const lens = document.querySelector('#hero-lens');
const materialImage = document.querySelector('#hero-material');
const announceRegion = document.querySelector('#announcement');
const state = { material: 'lagoon', refraction: 14, blur: 0, enabled: true };
let announcementTimer;

function announce(message) {
  clearTimeout(announcementTimer);
  announceRegion.textContent = message;
  announcementTimer = setTimeout(() => { announceRegion.textContent = ''; }, 4000);
}

function updateLens() {
  lens.configure({ refraction: state.refraction, blur: state.blur, hidden: !state.enabled });
  lens.shadow.hidden = !state.enabled;
  document.querySelector('#refraction-value').value = `${state.refraction}px`;
  document.querySelector('#frost-value').value = `${state.blur}px`;
}

for (const button of document.querySelectorAll('[data-material]')) {
  button.addEventListener('click', () => {
    state.material = button.dataset.material;
    materialImage.src = new URL(`./material-${state.material}.webp`, import.meta.url).href;
    materialImage.alt = `Original ${state.material} contour artwork`;
    for (const option of document.querySelectorAll('[data-material]')) option.setAttribute('aria-pressed', String(option === button));
  });
}

document.querySelector('#refraction').addEventListener('input', (event) => {
  state.refraction = Number(event.target.value);
  updateLens();
});
document.querySelector('#frost').addEventListener('input', (event) => {
  state.blur = Number(event.target.value);
  updateLens();
});
document.querySelector('#glass-enabled').addEventListener('change', (event) => {
  state.enabled = event.target.checked;
  updateLens();
});

const phone = matchMedia('(max-width: 560px)');
function sizeLens() {
  lens.configure(phone.matches ? { width: 154, height: 114, radius: 36 } : { width: 260, height: 178, radius: 56 });
  lens.rest = phone.matches ? { x: 0.64, y: 0.76 } : { x: 0.82, y: 0.53 };
  lens.goHome(true);
}
sizeLens();
phone.addEventListener('change', sizeLens);
lens.addEventListener('keydown', (event) => {
  const movement = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[event.key];
  if (event.key === 'Home') {
    event.preventDefault();
    lens.goHome();
  } else if (movement) {
    event.preventDefault();
    const x = Math.max(lens.size.w / 2, Math.min(lens.clientWidth - lens.size.w / 2, lens.xs.target + movement[0]));
    const y = Math.max(lens.size.h / 2, Math.min(lens.clientHeight - lens.size.h / 2, lens.ys.target + movement[1]));
    lens.moveTo(x, y);
  }
});

async function copyCode(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    announce(`${label} copied`);
  } catch {
    const dialog = document.createElement('dialog');
    dialog.className = 'copy-dialog';
    const heading = document.createElement('h2');
    heading.textContent = 'Copy the code';
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('aria-label', label);
    field.rows = 12;
    const close = document.createElement('button');
    close.textContent = 'Close';
    close.className = 'button button--primary';
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
    dialog.append(heading, field, close);
    document.body.append(dialog);
    dialog.showModal();
    field.select();
  }
}

document.querySelector('#copy-preset').addEventListener('click', () => {
  const material = `https://tfdmendes.github.io/liquidglass/assets/material-${state.material}.webp`;
  const code = `<script type="module" src="./lib/components.js"></script>\n<style>\n  .lens-preview { height: 360px; }\n  .lens-preview .lg-lens__content { height: 100%; }\n  .lens-preview img { width: 100%; height: 100%; object-fit: cover; }\n</style>\n\n<lg-lens class="lens-preview" width="${lens.size.w}" height="${lens.size.h}" radius="${lens.getAttribute('radius')}"\n  refraction="${state.refraction}" blur="${state.blur}" bezel="0.3"\n  chroma="0.08" specular="0.12" specular-width="0.75">\n  <img src="${material}" alt="Abstract optical material">\n</lg-lens>`;
  copyCode(code, 'Lens example');
});
document.querySelector('#copy-install').addEventListener('click', () => copyCode(document.querySelector('#install-code').textContent, 'HTML example'));

const panel = document.querySelector('.control-panel');
const appearance = document.querySelector('#appearance');
const notifications = document.querySelector('#notifications');
const systemDark = matchMedia('(prefers-color-scheme: dark)');
let tint = 64;
function updateControls() {
  const selected = appearance.value;
  const dark = selected === 'dark' || selected === 'auto' && systemDark.matches;
  panel.classList.toggle('is-dark', dark);
  panel.style.setProperty('--lg-tint-strong', dark ? `rgb(9 29 48 / ${tint / 100})` : `rgb(255 255 255 / ${tint / 100})`);
  document.querySelector('#control-status').textContent = `${selected[0].toUpperCase() + selected.slice(1)} appearance · notifications ${notifications.checked ? 'on' : 'off'}`;
}
appearance.addEventListener('change', updateControls);
notifications.addEventListener('change', updateControls);
systemDark.addEventListener('change', updateControls);
document.querySelector('#panel-tint').addEventListener('input', (event) => {
  tint = Number(event.target.value);
  document.querySelector('#tint-value').value = `${tint}%`;
  updateControls();
});

const navbar = document.querySelector('#sample-navbar');

const views = {
  explore: ['Follow your curiosity.', 'Pick a colour. Find your material.'],
  create: ['Make room for ideas.', 'The controls are yours to compose.'],
  collect: ['Keep what moves you.', 'Four original materials. One optical engine.'],
};
navbar.addEventListener('change', (event) => {
  const [title, description] = views[event.detail.value];
  document.querySelector('#navigation-title').textContent = title;
  document.querySelector('#navigation-description').textContent = description;
});
const navigationImage = document.querySelector('#navigation-material');
navigationImage.addEventListener('load', () => {
  // Surfaces take a copy when attached, so replace it after the source changes
  for (const component of document.querySelectorAll('#navigation-scene lg-navbar, #navigation-scene lg-dock')) {
    component.surface.detach();
    component.surface.attach();
  }
});
for (const button of document.querySelectorAll('[data-backdrop]')) {
  button.addEventListener('click', () => {
    const material = button.dataset.backdrop;
    document.querySelector('#navigation-material').src = new URL(`./material-${material}.webp`, import.meta.url).href;
    document.querySelector('#navigation-material').alt = `Original ${material} contour artwork behind the navigation`;
    for (const item of document.querySelectorAll('[data-backdrop]')) item.setAttribute('aria-pressed', String(item === button));
  });
}

const feedbackScene = document.querySelector('#feedback-scene');
const feedbackImage = document.querySelector('#feedback-material');
const styleMenu = document.querySelector('#style-menu');
const materialMenu = document.querySelector('#material-menu');
let style = 'clear';
let feedbackMaterial = 'ember';
let notification;
const styles = {
  clear: { title: 'Clear and present.', blur: 0, refraction: 18 },
  soft: { title: 'A softer perspective.', blur: 5, refraction: 12 },
  frosted: { title: 'Let the light through.', blur: 16, refraction: 8 },
};
const materials = { lagoon: 'Lagoon', aurora: 'Aurora', ember: 'Ember', mono: 'Mono' };
const feedbackSurfaces = () => [...feedbackScene.querySelectorAll('lg-menubar, lg-menu, lg-button, lg-toast')].map((component) => component.surface);
const feedbackLabel = () => `${materials[feedbackMaterial]} · ${style[0].toUpperCase() + style.slice(1)} glass`;

function updateFeedback() {
  feedbackScene.dataset.style = style;
  feedbackScene.dataset.feedbackMaterial = feedbackMaterial;
  document.querySelector('#feedback-title').textContent = styles[style].title;
  document.querySelector('#feedback-status').textContent = feedbackLabel();
  for (const [menu, value] of [[materialMenu, feedbackMaterial], [styleMenu, style]]) {
    for (const item of menu.items) {
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(item.value === value));
    }
  }
  const { title, ...optics } = styles[style];
  for (const surface of feedbackSurfaces()) {
    Object.assign(surface.optics, optics, { bezel: 0.35, chroma: 0, specular: 0.4, specularWidth: 1 });
    if (surface.owner === materialMenu || surface.owner === styleMenu) {
      Object.assign(surface.optics, { refraction: style === 'clear' ? 32 : style === 'soft' ? 22 : optics.refraction, bezel: 0.6, curvature: 2.5 });
      surface.owner.lens?.update({ chroma: 0, specularWidth: 1 });
    }
    surface.glass?.update(surface.optics);
  }
}

styleMenu.addEventListener('select', (event) => {
  style = event.detail.value;
  updateFeedback();
});
materialMenu.addEventListener('select', (event) => {
  feedbackMaterial = event.detail.value;
  feedbackImage.src = new URL(`./material-${feedbackMaterial}.webp`, import.meta.url).href;
  feedbackImage.alt = `Original ${materials[feedbackMaterial]} contour artwork behind the menu`;
  updateFeedback();
});
feedbackImage.addEventListener('load', () => {
  // Each surface holds an image copy, so replace it when the backdrop changes
  for (const surface of feedbackSurfaces()) {
    if (!surface.mode) continue;
    surface.detach();
    surface.attach();
  }
});
document.querySelector('#notify-button').addEventListener('click', () => {
  notification?.close();
  notification = toast(feedbackLabel(), { container: feedbackScene, tone: 'light', duration: 3200 });
  updateFeedback();
});
updateFeedback();

const tabs = [...document.querySelectorAll('.figure-tabs [role="tab"]')];
function selectFigure(button) {
  for (const tab of tabs) {
    const selected = tab === button;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
  }
}
for (const button of tabs) {
  button.addEventListener('click', () => selectFigure(button));
  button.addEventListener('keydown', (event) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!delta && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(button) + delta + tabs.length) % tabs.length;
    selectFigure(tabs[index]);
    tabs[index].focus();
  });
}

let presses = 0;
document.querySelector('#hello-button').addEventListener('click', () => {
  presses++;
  document.querySelector('#hello-output').textContent = presses === 1 ? 'Native click received.' : `${presses} native clicks received.`;
});
