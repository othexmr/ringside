/* RiNGSiDE — glitter. Decoration only: it never encodes data, never blocks input (pointer-events: none),
   pauses when the tab is hidden, and becomes a still sprinkle under prefers-reduced-motion or when the
   viewer switches it off (the choice is remembered per viewer). */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const forced = window.matchMedia('(forced-colors: active)');
  const DARK = ['#ffffff', '#ffe28a', '#ffb3d6', '#9cc2ff', '#d6c2ff', '#8ff0ff'];
  const LIGHT = ['#e0a100', '#ff4fa3', '#7b4dff', '#2f6bff', '#00a7c8', '#ff9a3c'];
  let fx, fctx, W = 0, H = 0, dpr = 1;
  let parts = [], raf = 0, last = 0, lastTrail = null;
  let enabled = true;
  // Ambient layers: the page sky (fixed, behind the glass panels) and the hero's party layer
  // (inside the arena, above its background, below its text; the arena is dark in both themes).
  const layers = [];

  const isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const palette = () => (isDark() ? DARK : LIGHT);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const animated = () => enabled && !reduce.matches && !forced.matches && !document.hidden;

  function star(ctx, x, y, r, rot) {
    // four-point sparkle with concave sides
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * .16, -r * .16, r, 0);
    ctx.quadraticCurveTo(r * .16, r * .16, 0, r);
    ctx.quadraticCurveTo(-r * .16, r * .16, -r, 0);
    ctx.quadraticCurveTo(-r * .16, -r * .16, 0, -r);
    ctx.fill(); ctx.restore();
  }

  // Pre-rendered glowing sprites (one per colour and shape), drawn with drawImage: cheap on every device.
  const sprites = new Map();
  function sprite(color, isStar) {
    const key = color + (isStar ? '*' : '.');
    if (sprites.has(key)) return sprites.get(key);
    const S = 64; const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 14;
    if (isStar) { star(x, S / 2, S / 2, S * .3, 0); x.shadowBlur = 0; x.globalAlpha = .9; x.fillStyle = '#fff'; star(x, S / 2, S / 2, S * .11, 0); }
    else { x.beginPath(); x.arc(S / 2, S / 2, S * .12, 0, Math.PI * 2); x.fill(); }
    sprites.set(key, c); return c;
  }
  function blit(ctx, p, r, rot) {
    const img = sprite(p.c, p.star); const d = r * 3.4;
    if (!p.star || !rot) { ctx.drawImage(img, p.x - d / 2, p.y - d / 2, d, d); return; }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(rot); ctx.drawImage(img, -d / 2, -d / 2, d, d); ctx.restore();
  }

  function seed(L) {
    const pal = L.dark() ? DARK : LIGHT;
    const n = Math.round(Math.min(L.max, Math.max(L.min, (L.w * L.h) / L.per)));
    L.stars = Array.from({ length: n }, () => {
      const big = Math.random() < L.bigShare;
      return { x: Math.random() * L.w, y: Math.random() * L.h, r: big ? 3 + Math.random() * 5.5 : .8 + Math.random() * 1.6, star: big,
        ph: Math.random() * Math.PI * 2, sp: .6 + Math.random() * 1.8, vy: -(.01 + Math.random() * .06), vx: (Math.random() - .5) * .04, c: pick(pal), rot: Math.random() * Math.PI };
    });
  }
  function sizeLayer(L) {
    const w = L.fixed ? innerWidth : L.canvas.parentElement.clientWidth;
    const h = L.fixed ? innerHeight : L.canvas.parentElement.clientHeight;
    L.w = w; L.h = h; L.canvas.width = w * dpr; L.canvas.height = h * dpr; L.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed(L);
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    fx.width = W * dpr; fx.height = H * dpr; fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sprites.clear();
    layers.forEach(sizeLayer);
    layers.forEach((L) => drawLayer(L, performance.now(), true));
  }

  function drawLayer(L, t, still) {
    const ctx = L.ctx; ctx.clearRect(0, 0, L.w, L.h);
    if (!enabled || forced.matches) return;
    const dark = L.dark();
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    for (const s of L.stars) {
      const tw = still ? .55 : Math.pow(.5 + .5 * Math.sin(t / 1000 * s.sp + s.ph), 3);
      ctx.globalAlpha = (dark ? .95 : .75) * (s.star ? tw : .3 + .7 * tw);
      blit(ctx, s, s.r * (s.star ? .55 + .45 * tw : 1), s.star ? s.rot : 0);
    }
    ctx.globalAlpha = 1;
  }
  const drawSky = (t, still) => layers.forEach((L) => drawLayer(L, t, still));

  function spawn(x, y, o) {
    parts.push({ x, y, vx: o.vx, vy: o.vy, life: 0, max: o.max, r: o.r, c: o.c, rot: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, g: o.g ?? .06, star: o.star ?? Math.random() < .6 });
  }

  function frame(t) {
    raf = 0;
    const dt = Math.min(48, t - (last || t)); last = t;
    if (!animated()) { drawSky(t, true); fctx.clearRect(0, 0, W, H); parts = []; return; }
    for (const L of layers) {
      if (!L.visible) continue;
      for (const s of L.stars) {
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.y < -8) { s.y = L.h + 8; s.x = Math.random() * L.w; }
        if (s.x < -8) s.x = L.w + 8; else if (s.x > L.w + 8) s.x = -8;
      }
      drawLayer(L, t, false);
    }
    fctx.clearRect(0, 0, W, H);
    const dark = isDark();
    fctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    const k = dt / 16.7;
    parts = parts.filter((p) => (p.life += dt) < p.max);
    for (const p of parts) {
      p.vy += p.g * k; p.vx *= Math.pow(.975, k); p.vy *= Math.pow(.985, k);
      p.x += p.vx * k; p.y += p.vy * k; p.rot += p.vr * k;
      const a = 1 - p.life / p.max; const tw = .6 + .4 * Math.sin(p.life / 60);
      fctx.globalAlpha = Math.max(0, a * tw);
      blit(fctx, p, p.star ? p.r * (.6 + .4 * a) : p.r * .5, p.rot);
    }
    fctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };

  function onMove(e) {
    if (!animated() || e.pointerType === 'touch') return;
    const p = { x: e.clientX, y: e.clientY };
    if (lastTrail && Math.hypot(p.x - lastTrail.x, p.y - lastTrail.y) < 16) return;
    lastTrail = p;
    const pal = palette();
    for (let i = 0; i < 2; i++) spawn(p.x + (Math.random() - .5) * 14, p.y + (Math.random() - .5) * 14, { vx: (Math.random() - .5) * 1.6, vy: -Math.random() * 1.4, max: 750 + Math.random() * 500, r: 4 + Math.random() * 6, c: pick(pal), g: .05, star: i === 0 ? true : undefined });
    if (parts.length > 700) parts.splice(0, parts.length - 700);
    kick();
  }

  RS.glitter = {
    get enabled() { return enabled; },
    get particles() { return parts.length; },   // live burst/trail particles (for tests)
    burst(x, y, { count = 60, colors = null, power = 1 } = {}) {
      if (!animated()) return;
      const pal = colors || palette();
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2; const v = (2 + Math.random() * 5.5) * power;
        spawn(x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, max: 1000 + Math.random() * 900, r: 4.5 + Math.random() * 8, c: pick(pal), g: .08 });
      }
      kick();
    },
    burstAt(el, opts) { const b = el.getBoundingClientRect(); this.burst(b.left + b.width / 2, b.top + b.height / 2, opts); },
    rain(count = 160) {
      if (!animated()) return;
      const pal = palette();
      for (let i = 0; i < count; i++) spawn(Math.random() * W, -20 - Math.random() * H * .6, { vx: (Math.random() - .5) * 1.4, vy: 1 + Math.random() * 3.5, max: 3200 + Math.random() * 1800, r: 4 + Math.random() * 8, c: pick(pal), g: .025 });
      kick();
    },
    set(on) {
      enabled = on;
      RS.store && RS.store.set('rs-glitter', on ? 'on' : 'off');
      const b = document.getElementById('glitter-toggle');
      if (b) { b.setAttribute('aria-pressed', String(on)); b.querySelector('.lbl').textContent = on ? 'Glitter on' : 'Glitter off'; }
      document.documentElement.dataset.glitter = on ? 'on' : 'off';
      drawSky(performance.now(), true);
      if (on) { kick(); this.rain(70); }
    },
  };

  function init() {
    const sky = document.createElement('canvas'); sky.id = 'glitter-sky';
    fx = document.createElement('canvas'); fx.id = 'glitter-fx';
    for (const c of [sky, fx]) c.setAttribute('aria-hidden', 'true');
    document.body.prepend(sky); document.body.append(fx);
    fctx = fx.getContext('2d');
    layers.push({ canvas: sky, ctx: sky.getContext('2d'), fixed: true, visible: true, dark: isDark, per: 9000, min: 60, max: 200, bigShare: .28 });
    const hero = document.querySelector('.hero');
    if (hero) {
      const hc = document.createElement('canvas'); hc.id = 'glitter-hero'; hc.setAttribute('aria-hidden', 'true');
      hero.prepend(hc);
      const L = { canvas: hc, ctx: hc.getContext('2d'), fixed: false, visible: true, dark: () => true, per: 3200, min: 90, max: 380, bigShare: .34 };
      layers.push(L);
      new IntersectionObserver((es) => { L.visible = es[0].isIntersecting; if (L.visible) kick(); }).observe(hero);
      new ResizeObserver(() => { if (hero.clientWidth !== L.w || hero.clientHeight !== L.h) { sizeLayer(L); drawLayer(L, performance.now(), true); kick(); } }).observe(hero);
    }
    const saved = RS.store ? RS.store.get('rs-glitter') : null;
    enabled = saved ? saved === 'on' : true;
    document.documentElement.dataset.glitter = enabled ? 'on' : 'off';
    resize();
    addEventListener('resize', () => { clearTimeout(init.t); init.t = setTimeout(resize, 150); });
    addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', () => (document.hidden ? null : kick()));
    reduce.addEventListener && reduce.addEventListener('change', () => { drawSky(performance.now(), true); kick(); });
    new MutationObserver(() => { resize(); kick(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const btn = document.getElementById('glitter-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', String(enabled));
      btn.querySelector('.lbl').textContent = enabled ? 'Glitter on' : 'Glitter off';
      btn.addEventListener('click', () => RS.glitter.set(!enabled));
    }
    kick();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
