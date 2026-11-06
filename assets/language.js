import { zh, ui } from './i18n.js';

const $$ = (selector) => [...document.querySelectorAll(selector)];

const i18nNodes = $$('[data-i18n]');
const english = new Map(i18nNodes.map((n) => [n, n.innerHTML]));
let lang = 'en';
try {
  lang = localStorage.getItem('lang') || (navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en');
} catch {
  lang = navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
export const t = () => ui[lang];
export const onLanguageChange = (listener) => langListeners.add(listener);
const langListeners = new Set();

function applyLang(next) {
  lang = next === 'zh' ? 'zh' : 'en';
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  for (const n of i18nNodes) {
    const key = n.dataset.i18n;
    n.innerHTML = lang === 'zh' && zh[key] ? zh[key] : english.get(n);
  }
  try {
    localStorage.setItem('lang', lang);
  } catch {}
  for (const el of $$('lg-navbar, lg-segmented')) el.refresh?.();
  for (const fn of langListeners) fn();
}

const langSwitch = document.querySelector('#lang-switch');
if (langSwitch) {
  langSwitch.value = lang;
  langSwitch.addEventListener('change', (e) => applyLang(e.detail.value));
}
applyLang(lang);
