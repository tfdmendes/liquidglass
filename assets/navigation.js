const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const hero = $('#hero');

const docLinks = $$('.docs__nav a[href^="#"]');
if (docLinks.length) {
  const targets = docLinks.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
  const spy = () => {
    let current = targets[0];
    for (const s of targets) if (s.getBoundingClientRect().top < 140) current = s;
    docLinks.forEach((a) => a.classList.toggle('is-active', a.hash === `#${current.id}`));
  };
  addEventListener('scroll', spy, { passive: true });
  spy();
}

const topbar = $('#topbar');
if (topbar && hero) {
  topbar.hidden = false;
  new IntersectionObserver(([entry]) => topbar.classList.toggle('is-visible', !entry.isIntersecting), { rootMargin: '-80px 0px 0px 0px' }).observe(hero);
  const nav = $('lg-navbar', topbar);
  const links = $$('a', nav);
  const sections = links.map((a) => (a.hash ? document.getElementById(a.hash.slice(1)) : null));
  const seen = new Map();
  const sectionObserver = new IntersectionObserver((entries) => {
    for (const e of entries) seen.set(e.target, e.intersectionRatio);
    let best = -1;
    let bestRatio = 0;
    sections.forEach((s, i) => {
      const r = s ? seen.get(s) ?? 0 : 0;
      if (r > bestRatio) {
        bestRatio = r;
        best = i;
      }
    });
    if (best >= 0 && best !== nav.current) nav.setCurrent?.(best);
  }, { threshold: [0, 0.2, 0.5, 0.8] });
  sections.filter(Boolean).forEach((s) => sectionObserver.observe(s));
}
