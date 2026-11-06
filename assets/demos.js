import { toast } from '../lib/components.js';
import { t } from './language.js';

const $ = (selector) => document.querySelector(selector);

function browserName() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Firefox\/|FxiOS/.test(ua)) return 'Firefox';
  if (/Chrome\/|CriOS/.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'your browser';
}

const hero = $('#hero');
if (hero) {
  setTimeout(() => toast(t().refracting(browserName()), { container: hero, icon: 'check', tone: 'light', duration: 4200 }), 900);
}

let note = 0;
$('#notify-trigger')?.addEventListener('click', () => {
  const list = t().notifications;
  toast(list[note++ % list.length], { container: $('#notify-stage'), icon: 'bell' });
});

$('#toast-demo-button')?.addEventListener('click', () => {
  const list = t().notifications;
  toast(list[note++ % list.length], { container: $('#toast-demo'), icon: 'bell' });
});

const brightness = $('#brightness');
brightness?.addEventListener('input', () => {
  $('[data-brightness]').textContent = `${Math.round(brightness.value)}%`;
});

const clock = $('[data-clock]');
if (clock) {
  const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const tick = () => (clock.textContent = fmt.format(new Date()).replace(',', ''));
  tick();
  setInterval(tick, 30000);
}
