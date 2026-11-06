import { t, onLanguageChange } from './language.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function spans(src, re, classify) {
  let out = '';
  let last = 0;
  for (const m of src.matchAll(re)) {
    out += esc(src.slice(last, m.index));
    const cls = classify(m);
    out += cls ? `<span class="tok-${cls}">${esc(m[0])}</span>` : esc(m[0]);
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}

const JS_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|\b(import|from|export|default|const|let|var|function|return|new|if|else|await|async|for|of|class|extends|true|false|null|undefined)\b|\b(\d+(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)(?=\()/g;
const highlightJS = (src) => spans(src, JS_RE, (m) => (m[1] ? 'com' : m[2] ? 'str' : m[3] ? 'key' : m[4] ? 'num' : 'fn'));

const CSS_RE = /(\/\*[\s\S]*?\*\/)|("[^"]*"|'[^']*')|(--[\w-]+|[\w-]+)(?=\s*:)|(-?\d+(?:\.\d+)?(?:px|%|s|ms|deg)?)/g;
const highlightCSS = (src) => spans(src, CSS_RE, (m) => (m[1] ? 'com' : m[2] ? 'str' : m[3] ? 'attr' : 'num'));

const SH_RE = /((?:^|(?<=\s))#[^\n]*)|("[^"]*"|'[^']*')|(^|(?<=\n))([\w.-]+)/g;
const highlightSH = (src) => spans(src, SH_RE, (m) => (m[1] ? 'com' : m[2] ? 'str' : 'fn'));

function highlightTag(tag) {
  if (tag.startsWith('<!--')) return `<span class="tok-com">${esc(tag)}</span>`;
  const m = tag.match(/^<(\/?)([\w-]+)([\s\S]*?)(\/?)>$/);
  if (!m) return esc(tag);
  const attrs = m[3].replace(/([^\s=]+)(=)("[^"]*"|'[^']*'|[^\s"'>]+)?|([^\s=]+)|(\s+)/g, (all, name, eq, value, bare, ws) => {
    if (ws) return ws;
    if (bare) return `<span class="tok-attr">${esc(bare)}</span>`;
    return `<span class="tok-attr">${esc(name)}</span>=${value ? `<span class="tok-str">${esc(value)}</span>` : ''}`;
  });
  return `&lt;${m[1]}<span class="tok-tag">${m[2]}</span>${attrs}${m[4]}&gt;`;
}

function highlightHTML(src) {
  let out = '';
  let last = 0;
  const re = /<!--[\s\S]*?-->|<\/?[\w-]+(?:\s[^<>]*?)?\/?>/g;
  for (const m of src.matchAll(re)) {
    const text = src.slice(last, m.index);
    out += /<script[^>]*>\s*$/.test(src.slice(0, m.index)) || /\bimport\b|=>/.test(text) ? highlightJS(text) : esc(text);
    out += highlightTag(m[0]);
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}

const HIGHLIGHT = { html: highlightHTML, js: highlightJS, css: highlightCSS, bash: highlightSH };
const LABEL = { html: 'HTML', js: 'JavaScript', css: 'CSS', bash: 'Terminal' };

function dedent(text) {
  const lines = text.replace(/<\\\//g, '</').replace(/^\s*\n/, '').replace(/\n\s*$/, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

export function codeBlock(code, kind, title) {
  const figure = document.createElement('figure');
  figure.className = 'code';
  figure.innerHTML = `<div class="code__bar"><span></span><button type="button" class="code__copy"><svg class="icon" aria-hidden="true"><use href="${ICONS}#copy"/></svg><span></span></button></div><pre><code></code></pre>`;
  const label = figure.querySelector('.code__bar > span');
  const button = figure.querySelector('.code__copy');
  const buttonText = button.querySelector('span');
  const codeEl = figure.querySelector('code');
  const set = (src) => {
    figure.dataset.source = src;
    codeEl.innerHTML = (HIGHLIGHT[kind] ?? esc)(src);
  };
  set(code);
  label.textContent = title || LABEL[kind] || '';
  buttonText.textContent = t().copy;
  onLanguageChange(() => (buttonText.textContent = t().copy));
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(figure.dataset.source);
      buttonText.textContent = t().copied;
      setTimeout(() => (buttonText.textContent = t().copy), 1600);
    } catch {}
  });
  figure.update = set;
  return figure;
}

const ICONS = new URL('icons.svg', import.meta.url).pathname;
for (const script of document.querySelectorAll('script[type="text/plain"][data-code]')) {
  script.replaceWith(codeBlock(dedent(script.textContent), script.dataset.code, script.dataset.title));
}
