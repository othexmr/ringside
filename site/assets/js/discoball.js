/* RiNGSiDE — the mirror ball. A pure function of time, shared by the site hero, the X cards and the trailer:
   ~420 mirror facets on a tilted, rotating sphere, lit by four coloured spotlights; mirror flashes travel
   across the ball as it turns, the brightest facets throw starburst glints, and every facet casts a light
   speck onto the room that sweeps around like a real disco. Decoration only; it never encodes data. */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const TAU = Math.PI * 2;
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // spotlights: direction towards the light (x right, y up, z towards the viewer), colour, power
  const LIGHTS = [
    { d: norm([-0.45, 0.62, 0.65]), c: [255, 255, 255], p: 1.25 },
    { d: norm([-0.92, 0.3, 0.3]), c: [90, 150, 255], p: 1.1 },
    { d: norm([0.78, -0.08, 0.6]), c: [255, 84, 168], p: 1.1 },
    { d: norm([0.42, -0.68, 0.6]), c: [255, 206, 104], p: 0.75 },
  ];
  // deterministic per-facet noise
  const hash = (i) => { let x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // facet grid: latitude bands, tiles per band scale with cos(latitude)
  const FACETS = [];
  (function build() {
    const bands = 18; let id = 0;
    for (let b = 0; b < bands; b++) {
      const lat0 = -Math.PI / 2 + (b / bands) * Math.PI; const lat1 = lat0 + Math.PI / bands; const mid = (lat0 + lat1) / 2;
      const n = Math.max(6, Math.round(38 * Math.cos(mid)));
      for (let i = 0; i < n; i++) FACETS.push({ lat0, lat1, lon0: (i / n) * TAU, lon1: ((i + 1) / n) * TAU, h: hash(id), id: id++ });
    }
  })();

  const TILT = 0.42;
  const ct = Math.cos(TILT), st = Math.sin(TILT);
  function point(lat, lon) { // sphere point after rotation (lon includes it) and tilt
    const x = Math.cos(lat) * Math.sin(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon);
    return [x, y * ct - z * st, y * st + z * ct];
  }

  // cached starburst sprite (core glow + long cross rays + faint diagonals)
  let burstSprite = null;
  function starburst() {
    if (burstSprite) return burstSprite;
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * .16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    const ray = (ang, len, w, a) => {
      x.save(); x.translate(S / 2, S / 2); x.rotate(ang);
      const lg = x.createLinearGradient(-len, 0, len, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.5, `rgba(255,255,255,${a})`); lg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = lg; x.beginPath(); x.moveTo(-len, 0); x.lineTo(0, -w); x.lineTo(len, 0); x.lineTo(0, w); x.closePath(); x.fill(); x.restore();
    };
    ray(0, S * .5, 2.2, 1); ray(Math.PI / 2, S * .5, 2.2, 1); ray(Math.PI / 4, S * .22, 1.2, .5); ray(-Math.PI / 4, S * .22, 1.2, .5);
    burstSprite = c; return c;
  }
  RS.starburst = starburst;
  function drawBurst(ctx, x, y, size, color, alpha) {
    const s = starburst(); ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(s, x - size / 2, y - size / 2, size, size);
    if (color) { ctx.globalAlpha = alpha * .6; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, size * .07, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  RS.drawBurst = drawBurst;

  /* Draw the ball. o: { spin (radians/s, default one turn in 18 s), string: length above the ball in R units,
     glints: bool, glow: bool } */
  function drawBall(ctx, cx, cy, R, t, o = {}) {
    const rot = t * (o.spin ?? TAU / 18);
    // halo
    if (o.glow !== false) {
      const halo = ctx.createRadialGradient(cx, cy, R * .9, cx, cy, R * 2.3);
      halo.addColorStop(0, 'rgba(190,170,255,.28)'); halo.addColorStop(.45, 'rgba(240,77,147,.09)'); halo.addColorStop(1, 'rgba(74,140,255,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, R * 2.3, 0, TAU); ctx.fill();
    }
    // string and cap
    if (o.string) {
      ctx.strokeStyle = 'rgba(214,206,255,.55)'; ctx.lineWidth = Math.max(1, R * .018);
      ctx.beginPath(); ctx.moveTo(cx, cy - R - R * o.string); ctx.lineTo(cx, cy - R * .96); ctx.stroke();
      ctx.fillStyle = '#8f86c2'; ctx.fillRect(cx - R * .09, cy - R * 1.04, R * .18, R * .12);
    }
    // body
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    ctx.fillStyle = '#2a2548'; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    const glints = [];
    for (const f of FACETS) {
      const lm = (f.lat0 + f.lat1) / 2; const nm = (f.lon0 + f.lon1) / 2 + rot;
      const n = point(lm, nm);
      if (n[2] <= 0.02) continue;
      // facet corners, inset for the grout gap
      const gl = (f.lat1 - f.lat0) * .09, go = (f.lon1 - f.lon0) * .09;
      const p = [point(f.lat0 + gl, f.lon0 + go + rot), point(f.lat0 + gl, f.lon1 - go + rot), point(f.lat1 - gl, f.lon1 - go + rot), point(f.lat1 - gl, f.lon0 + go + rot)];
      // mirror: reflect the view ray about the facet normal, compare with each light
      const rv = [2 * n[2] * n[0], 2 * n[2] * n[1], 2 * n[2] * n[2] - 1];
      const base = 92 + 125 * f.h; const diffuse = .42 + .58 * Math.max(0, dot(n, LIGHTS[0].d));
      let r = base * diffuse * .96, g = base * diffuse * .97, b = base * diffuse * 1.1; let peak = 0; let peakC = null;
      for (const L of LIGHTS) {
        const sp = Math.pow(Math.max(0, dot(rv, L.d)), 34) * L.p;
        r += L.c[0] * sp; g += L.c[1] * sp; b += L.c[2] * sp;
        if (sp > peak) { peak = sp; peakC = L.c; }
      }
      // shimmer: each facet twinkles on its own clock
      const tw = .82 + .18 * Math.sin(t * (2.3 + f.h * 3) + f.id);
      ctx.fillStyle = `rgb(${Math.min(255, r * tw) | 0},${Math.min(255, g * tw) | 0},${Math.min(255, b * tw) | 0})`;
      ctx.beginPath(); ctx.moveTo(cx + p[0][0] * R, cy - p[0][1] * R);
      for (let k = 1; k < 4; k++) ctx.lineTo(cx + p[k][0] * R, cy - p[k][1] * R);
      ctx.closePath(); ctx.fill();
      if (peak > .55) glints.push({ x: cx + n[0] * R, y: cy - n[1] * R, s: peak, c: peakC });
    }
    // sphere shading: soft key highlight and limb darkening
    const hl = ctx.createRadialGradient(cx - R * .38, cy - R * .42, 0, cx - R * .38, cy - R * .42, R * .9);
    hl.addColorStop(0, 'rgba(255,255,255,.22)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    const limb = ctx.createRadialGradient(cx, cy, R * .55, cx, cy, R);
    limb.addColorStop(0, 'rgba(8,5,24,0)'); limb.addColorStop(1, 'rgba(8,5,24,.5)');
    ctx.fillStyle = limb; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    ctx.restore();
    // coloured rim lights
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = Math.max(1.2, R * .03);
    ctx.strokeStyle = 'rgba(90,150,255,.55)'; ctx.beginPath(); ctx.arc(cx, cy, R * .995, Math.PI * .72, Math.PI * 1.28); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,84,168,.55)'; ctx.beginPath(); ctx.arc(cx, cy, R * .995, -Math.PI * .28, Math.PI * .28); ctx.stroke();
    ctx.restore();
    // glints: starbursts on the brightest facets (capped, strongest first)
    if (o.glints !== false) {
      glints.sort((a, b) => b.s - a.s);
      for (const gq of glints.slice(0, o.maxGlints ?? 7)) {
        const a = Math.min(1, (gq.s - .55) * 1.6);
        drawBurst(ctx, gq.x, gq.y, R * (.55 + .5 * Math.min(1.5, gq.s)), `rgb(${gq.c.join(',')})`, a);
      }
    }
  }

  /* Reflected light specks: each facet sends the key and coloured lights onto the room. Returns
     [{ x, y, a, c }] in units of R relative to the ball centre (screen y down). */
  function spots(t, o = {}) {
    const rot = t * (o.spin ?? TAU / 18); const out = []; const reach = o.reach ?? 4.2; const every = o.every ?? 3;
    for (let i = 0; i < FACETS.length; i += every) {
      const f = FACETS[i];
      const n = point((f.lat0 + f.lat1) / 2, (f.lon0 + f.lon1) / 2 + rot);
      for (let li = 0; li < LIGHTS.length; li++) {
        if ((f.id + li) % 2) continue;
        const L = LIGHTS[li]; const d = dot(L.d, n);
        if (d <= 0) continue;
        const r = [2 * d * n[0] - L.d[0], 2 * d * n[1] - L.d[1], 2 * d * n[2] - L.d[2]];   // reflected ray
        if (r[2] > 0.35) continue;                                                        // heading at the audience: skip
        const k = reach / (0.7 + Math.abs(r[2]) * 0.6);
        out.push({ x: r[0] * k, y: -r[1] * k * 0.72, a: Math.min(1, d * 1.4) * (0.55 + 0.45 * f.h), c: L.c, s: 0.6 + f.h });
      }
    }
    return out;
  }

  const spotSprites = new Map();
  function spotSprite(c) {
    const key = c.join(','); if (spotSprites.has(key)) return spotSprites.get(key);
    const S = 48, cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d');
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.18, `rgba(${key},.95)`); g.addColorStop(.5, `rgba(${key},.25)`); g.addColorStop(1, `rgba(${key},0)`);
    x.fillStyle = g; x.fillRect(0, 0, S, S); spotSprites.set(key, cv); return cv;
  }
  function drawSpots(ctx, bx, by, R, t, o = {}) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const W = o.w ?? Infinity, H = o.h ?? Infinity;
    for (const s of spots(t, o)) {
      const x = bx + s.x * R, y = by + s.y * R;
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const d = (o.size ?? 9) * (0.7 + s.s * .55);
      ctx.globalAlpha = s.a * (o.alpha ?? .8);
      ctx.drawImage(spotSprite(s.c), x - d, y - d * .75, d * 2, d * 1.5);
    }
    ctx.restore();
  }
  RS.Disco = { drawBall, spots, drawSpots, drawBurst };

  // ---------------- the hero show ----------------
  function heroShow() {
    const hero = document.querySelector('.hero'); const stage = document.getElementById('stage');
    if (!hero || !stage) return;
    const cv = document.createElement('canvas'); cv.id = 'disco'; cv.setAttribute('aria-hidden', 'true');
    hero.prepend(cv);
    const ctx = cv.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)'); const forced = matchMedia('(forced-colors: active)');
    let W = 0, H = 0, dpr = 1, visible = true, raf = 0;
    let clock = 0, last = 0, boost = 0;                   // clock = animation time; boost = extra spin after a click
    const geom = () => {
      const hb = hero.getBoundingClientRect(); const sb = stage.getBoundingClientRect(); const u = sb.width / 400;
      return { x: sb.left - hb.left + 200 * u, y: sb.top - hb.top + 214 * u, R: 76 * u, top: sb.top - hb.top };
    };
    const size = () => { dpr = Math.min(2, devicePixelRatio || 1); W = hero.clientWidth; H = hero.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    function paint(t) {
      ctx.clearRect(0, 0, W, H);
      if (forced.matches) return;
      const g = geom();
      const sway = Math.sin(t * .9) * .045;             // pendulum swing (radians)
      const bx = g.x + Math.sin(sway) * (g.y - g.top + 40) * .25; const by = g.y;
      // light specks across the whole arena
      drawSpots(ctx, bx, by, g.R, t, { reach: Math.max(W, H) / g.R * .55, every: W < 700 ? 4 : 2, w: W, h: H, size: W < 700 ? 6 : 8, alpha: .75 });
      drawBall(ctx, bx, by, g.R, t, { string: (g.y - g.top) / g.R + 1, maxGlints: 6 });
    }
    const loop = (now) => {
      raf = 0;
      const still = reduce.matches || !visible || document.hidden || (RS.glitter && !RS.glitter.enabled);
      if (still) { last = 0; boost = 0; paint(2.4); return; }
      const dt = last ? Math.min(.1, (now - last) / 1000) : 0; last = now;
      clock += dt * (1 + boost); boost *= Math.pow(.25, dt);   // spin-up eases back over a couple of seconds
      paint(clock);
      raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    size(); kick();
    addEventListener('resize', () => { size(); kick(); });
    new ResizeObserver(() => { if (hero.clientWidth !== W || hero.clientHeight !== H) { size(); kick(); } }).observe(hero);
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; kick(); }).observe(hero);
    document.addEventListener('visibilitychange', kick);
    reduce.addEventListener && reduce.addEventListener('change', kick);
    document.getElementById('glitter-toggle')?.addEventListener('click', () => setTimeout(kick, 0));
    RS.discoKick = kick;
    RS.discoClock = () => clock;
    RS.discoSpin = () => { boost = Math.min(9, boost + 6); kick(); };   // wordmark click: give the ball a whirl
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', heroShow); else heroShow();
})();
