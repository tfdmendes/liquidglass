import { toast } from '../lib/components.js';

const status = document.querySelector('.copy-status');
let statusTimer;

function announce(message) {
  clearTimeout(statusTimer);
  status.textContent = message;
  statusTimer = setTimeout(() => { status.textContent = ''; }, 3500);
}

for (const button of document.querySelectorAll('.copy-code')) {
  button.addEventListener('click', async () => {
    const code = button.closest('.code-block').querySelector('code');
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = 'Copied';
      announce('Example copied to clipboard');
      setTimeout(() => { button.textContent = 'Copy'; }, 1800);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      announce('Clipboard unavailable. The example is selected; use your copy shortcut.');
    }
  });
}

const menu = document.querySelector('.topic-menu');
const phone = matchMedia('(max-width: 650px)');
function setTopicMenu() {
  menu.open = !phone.matches;
}
setTopicMenu();
phone.addEventListener('change', setTopicMenu);
for (const link of menu.querySelectorAll('a')) {
  link.addEventListener('click', () => {
    if (phone.matches) menu.open = false;
  });
}

const range = document.querySelector('#docs-range');
range.addEventListener('change', (event) => {
  document.querySelector('#range-status').textContent = `Selected: ${event.detail.value}`;
});

const scene = document.querySelector('#toast-scene');
let currentToast;
document.querySelector('#show-toast').addEventListener('click', () => {
  currentToast?.close();
  currentToast = toast('Changes saved', { icon: 'check', container: scene, tone: 'light' });
  currentToast.element.surface?.glass?.update({ refraction: 10, bezel: 0.2, specular: 0.12, specularWidth: 0.75 });
});

if ('IntersectionObserver' in window) {
  const links = [...menu.querySelectorAll('a')];
  const observer = new IntersectionObserver((entries) => {
    const entry = entries.find((item) => item.isIntersecting);
    if (!entry) return;
    for (const link of links) {
      if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }, { rootMargin: '-8% 0px -72% 0px' });
  for (const section of document.querySelectorAll('.docs-main section')) observer.observe(section);
}
