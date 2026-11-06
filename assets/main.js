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
    materialImage.src = new URL(`./material-${state.material}.png`, import.meta.url).href;
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
  const material = `https://tfdmendes.github.io/liquidglass/assets/material-${state.material}.png`;
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

const views = {
  explore: ['Follow your curiosity.', 'Pick a colour. Find your material.'],
  create: ['Make room for ideas.', 'The controls are yours to compose.'],
  collect: ['Keep what moves you.', 'Four original materials. One optical engine.'],
};
for (const button of document.querySelectorAll('#sample-navbar > button')) {
  button.addEventListener('click', () => {
    const [title, description] = views[button.dataset.view];
    document.querySelector('#navigation-title').textContent = title;
    document.querySelector('#navigation-description').textContent = description;
  });
}
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
    document.querySelector('#navigation-material').src = new URL(`./material-${material}.png`, import.meta.url).href;
    document.querySelector('#navigation-material').alt = `Original ${material} contour artwork behind the navigation`;
    for (const item of document.querySelectorAll('[data-backdrop]')) item.setAttribute('aria-pressed', String(item === button));
  });
}

const feedbackScene = document.querySelector('#feedback-scene');
let style = 'clear';
let notification;
const styles = { clear: ['Clear and present.', 0], soft: ['A softer perspective.', 3], frosted: ['Let the light through.', 7] };
document.querySelector('#style-menu').addEventListener('select', (event) => {
  style = event.detail.value;
  document.querySelector('#feedback-title').textContent = styles[style][0];
  document.querySelector('#feedback-status').textContent = `${style[0].toUpperCase() + style.slice(1)} material selected`;
  document.querySelector('#notify-button').surface.glass.update({ blur: styles[style][1] });
});
document.querySelector('#notify-button').addEventListener('click', () => {
  notification?.close();
  notification = toast(`${style[0].toUpperCase() + style.slice(1)} material selected`, { container: feedbackScene, tone: 'light', duration: 3200 });
  notification.element.surface?.glass?.update({ refraction: 10, bezel: 0.2, specular: 0.12, specularWidth: 0.75 });
});

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
  document.querySelector('#hello-output').textContent = presses === 1 ? 'Hello, you. That was a native click event.' : `${presses} native click events. Still feels good.`;
});

if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('motion-ready');
  if ('IntersectionObserver' in window) {
    const reveal = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const visual = entry.target.classList.contains('component-scene');
        entry.target.animate([
          { opacity: visual ? 0.5 : 0, transform: visual ? 'translateY(24px)' : 'translateX(-14px)' },
          { opacity: 1, transform: 'none' },
        ], { duration: visual ? 850 : 650, easing: 'cubic-bezier(.22,1,.36,1)' });
        reveal.unobserve(entry.target);
      }
    }, { threshold: 0.16 });
    for (const element of document.querySelectorAll('.section-heading > *, .component-copy > *, .component-scene, .performance-copy > *, .performance-figures, .start-copy > *, .start-example, .footer-top > *')) reveal.observe(element);
  }
}
