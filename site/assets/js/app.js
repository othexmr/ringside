/* RiNGSiDE benchmark review — boot: progressive section rendering, theme, navigation, deep links. */
(function () {
  'use strict';
  const RS = window.RS; const { h } = RS;

  // Theme: auto → light → dark (stored per viewer; the page works without storage).
  function themeToggle() {
    const btn = RS.$('#theme-toggle'); const order = ['auto', 'light', 'dark'];
    const label = { auto: 'Auto', light: 'Light', dark: 'Dark' };
    const cur = () => document.documentElement.getAttribute('data-theme') || 'auto';
    const paint = () => { btn.querySelector('span').textContent = label[cur()]; btn.setAttribute('aria-label', `Colour theme: ${label[cur()]}. Change theme`); };
    btn.addEventListener('click', () => {
      const next = order[(order.indexOf(cur()) + 1) % 3];
      if (next === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', next);
      RS.store.set('rs-theme', next); paint();
    });
    paint();
  }

  // Scroll-spy for the section nav.
  function scrollSpy() {
    const links = RS.$$('.topnav a');
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { links.forEach((l) => l.removeAttribute('aria-current')); const a = map.get(e.target.id); if (a) a.setAttribute('aria-current', 'true'); }
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  // Deep links: #run/<id> opens that run's inspector.
  function route() {
    const m = /^#run\/(.+)$/.exec(location.hash);
    if (m) RS.openRun(decodeURIComponent(m[1]), { push: false });
  }

  // Render lower sections when they approach the viewport (progressive rendering), top ones immediately.
  function lazySection(id, fn) {
    const el = document.getElementById(id); let done = false;
    const run = () => { if (done) return; done = true; try { fn(); } catch (e) { console.error(e); el.append(h('p', { class: 'caveat', text: `This section failed to render: ${e.message}` })); } };
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); run(); } }, { rootMargin: '900px 0px' });
    io.observe(el);
    return run;
  }

  // Arena extras (the mirror ball lives in discoball.js): scroll progress, bells, wordmark glitter rain.
  function arena() {
    const bar = RS.$('#progress');
    const onScroll = () => { const d = document.documentElement; const max = d.scrollHeight - d.clientHeight; bar.style.setProperty('--p', max > 0 ? (d.scrollTop / max).toFixed(4) : 0); };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('inview'); io.unobserve(e.target); } }), { threshold: .15 });
    RS.$$('.section').forEach((s) => io.observe(s));
    const wm = RS.$('#wordmark');
    wm.addEventListener('click', () => { if (RS.glitter) { RS.glitter.burstAt(wm, { count: 60, power: 1.4 }); RS.glitter.rain(90); } if (RS.discoSpin) RS.discoSpin(); });
  }

  function boot() {
    themeToggle();
    arena();
    RS.renderHero();
    RS.renderRingside();
    const runs = [lazySection('matched', RS.renderMatched), lazySection('speed', RS.renderSpeed), lazySection('evidence', RS.renderEvidence)];
    RS.ensureAll = () => runs.forEach((f) => f());   // for anchors, deep links and tests
    scrollSpy();
    // any in-page jump or deep link needs its target section rendered first
    const jump = () => {
      if (/^#(matched|recipes|speed|evidence|all-runs|run\/)/.test(location.hash)) RS.ensureAll();
      route();
      if (location.hash && !location.hash.startsWith('#run/')) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
    };
    window.addEventListener('hashchange', () => { if (/^#run\//.test(location.hash)) { RS.ensureAll(); route(); } });
    document.addEventListener('click', (e) => { const a = e.target.closest('a[href^="#"]'); if (a && a.getAttribute('href').length > 1 && !a.getAttribute('href').startsWith('#run/')) RS.ensureAll(); });
    jump();
    // receipt extracts after first paint
    (window.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 1200 }) : (f) => setTimeout(f, 300))(() => RS.loadExtracts());
    RS.$('#foot-build').textContent = `Snapshot: ${RS.data.rounds.length} tool-eval rounds, ${RS.data.speed.rows.length} speed windows, ${Object.keys(RS.data.files).length} receipt files inventoried. SHA256SUMS ${RS.data.verified.sha256sums_files}/${RS.data.verified.sha256sums_files} verified at build.`;
    document.documentElement.dataset.ready = '1';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
