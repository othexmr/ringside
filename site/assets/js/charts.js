/* RiNGSiDE benchmark review — SVG chart engine (no dependencies).
   Encoding contract, carried over from the established generator:
   - RiNGSiDE marks are filled in their TP colour (TP4 electric blue, TP2 hot pink) and glow; effort is the shape
     (High circle, Low square, Max diamond).
   - Comparison recipes are neutral ink with a monogram token (M, T, K) and, on lines, a dash pattern.
   - Faint marks are individual rounds; an outlined mark with whiskers is a repeated cohort's median and
     observed range (not a confidence interval); singletons are drawn solid and carry no range.
   Every mark is focusable, has an accessible label and opens its receipt inspector. */
(function () {
  'use strict';
  const RS = window.RS;
  const { s, h } = RS;

  const colorFor = (recipe, tp) => (RS.RECIPES[recipe].ours ? (tp === 2 ? 'var(--tp2)' : 'var(--tp4)') : 'var(--cmp)');

  // ---------- scales ----------
  function linear(d0, d1, r0, r1) {
    const f = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
    f.domain = [d0, d1]; f.range = [r0, r1];
    return f;
  }
  function niceStep(span, count) {
    const raw = span / Math.max(1, count); const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function niceMax(max, count = 4) { const st = niceStep(max, count); return { max: Math.ceil(max / st) * st || st, step: st }; }
  RS.niceMax = niceMax;

  // ---------- shapes ----------
  function shapePath(shape, cx, cy, r) {
    switch (shape) {
      case 'square': { const a = r * 0.88; return `M${cx - a},${cy - a}h${2 * a}v${2 * a}h${-2 * a}Z`; }
      case 'diamond': { const a = r * 1.25; return `M${cx},${cy - a}L${cx + a},${cy}L${cx},${cy + a}L${cx - a},${cy}Z`; }
      default: return `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
    }
  }
  RS.shapePath = shapePath;
  RS.glyph = function (shape, color, { hollow = false, size = 14, mono = null } = {}) {
    const svg = s('svg', { width: size, height: size, viewBox: '-8 -8 16 16', class: 'glyph', 'aria-hidden': 'true' });
    if (mono) {
      svg.append(s('circle', { r: 7, style: 'fill:var(--surface);stroke:var(--cmp);stroke-width:1.6' }));
      svg.append(s('text', { 'text-anchor': 'middle', y: 3.4, style: 'fill:var(--ink);font:800 9px var(--sans)', text: mono }));
    } else {
      svg.append(s('path', { d: shapePath(shape, 0, 0, 5), style: hollow ? `fill:var(--surface);stroke:${color};stroke-width:2` : `fill:${color};stroke:var(--surface);stroke-width:1.5` }));
    }
    return svg;
  };
  RS.lineKey = function (recipe, tp) {
    const r = RS.RECIPES[recipe];
    const svg = s('svg', { width: 26, height: 14, viewBox: '0 0 26 14', 'aria-hidden': 'true' });
    svg.append(s('line', { x1: 1, x2: 25, y1: 7, y2: 7, style: `stroke:${colorFor(recipe, tp)};stroke-width:${r.ours ? 3 : 2};stroke-dasharray:${r.dash || 'none'}` }));
    if (!r.ours) {
      svg.append(s('circle', { cx: 13, cy: 7, r: 5.5, style: 'fill:var(--surface);stroke:var(--cmp);stroke-width:1.4' }));
      svg.append(s('text', { x: 13, y: 9.8, 'text-anchor': 'middle', style: 'fill:var(--ink);font:800 7.5px var(--sans)', text: r.mono }));
    } else svg.append(s('circle', { cx: 13, cy: 7, r: 4, style: `fill:${colorFor(recipe, tp)};stroke:var(--surface);stroke-width:1.5` }));
    return svg;
  };

  function axes(g, { x, y, xTicks, yTicks, xFmt, yFmt, left, right, top, bottom, xTitle, yTitle, yTitleX }) {
    const grid = s('g', { class: 'grid' });
    for (const t of yTicks) grid.append(s('line', { x1: left, x2: right, y1: y(t), y2: y(t) }));
    g.append(grid);
    g.append(s('line', { class: 'axis-line', x1: left, x2: right, y1: bottom, y2: bottom }));
    for (const t of yTicks) g.append(s('text', { class: 'tick', x: left - 8, y: y(t) + 4, 'text-anchor': 'end', text: yFmt(t) }));
    for (const t of xTicks) g.append(s('text', { class: 'tick', x: x(t), y: bottom + 17, 'text-anchor': 'middle', text: xFmt(t) }));
    if (xTitle) g.append(s('text', { class: 'axis-title', x: right, y: bottom + 34, 'text-anchor': 'end', text: xTitle }));
    if (yTitle) g.append(s('text', { class: 'axis-title', x: yTitleX ?? left - 8, y: top - 10, 'text-anchor': yTitleX != null ? 'start' : 'end', text: yTitle }));
  }

  // ---------- quality: score against completed-round time ----------
  /* opts.groups: [{ key, recipe, tp, mode, parallel, rounds, label }] ; opts.xMaxSec optional */
  RS.qualityChart = function (el, opts) {
    const draw = (W) => {
      RS.clear(el);
      const narrow = W < 460;
      const rail = opts.rail !== false && W >= 520;
      const railW = rail ? Math.min(170, Math.max(120, W * 0.2)) : 0;
      const H = opts.height || Math.round(Math.max(260, Math.min(430, W * (narrow ? 0.9 : 0.56))));
      const left = 38; const right = W - railW - (rail ? 26 : 14); const top = 26; const bottom = H - 42;
      const [y0, y1] = opts.yDomain || [84, 96];
      const allSecs = opts.groups.flatMap((g) => g.rounds.map((r) => r.seconds));
      const xm = niceMax((opts.xMaxSec ?? Math.max(...allSecs)) / 60 * 1.04, narrow ? 3 : 5);
      const x = linear(0, xm.max, left, right); const y = linear(y0, y1, bottom, top);
      const xTicks = []; for (let t = 0; t <= xm.max + 1e-9; t += xm.step) xTicks.push(+t.toFixed(4));
      const yTicks = []; for (let t = y0; t <= y1; t += 2) yTicks.push(t);
      const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': opts.ariaLabel || 'Score against completed-round time' });
      svg.append(s('rect', { class: 'plot-bg', x: left, y: top, width: right - left, height: bottom - top, rx: 12 }));
      axes(svg, { x, y, xTicks, yTicks, xFmt: (t) => (Number.isInteger(t) ? String(t) : t.toFixed(1)), yFmt: String, left, right, top, bottom,
        xTitle: 'completed-round time, minutes · left is faster', yTitle: `score / 100 (axis from ${y0})`, yTitleX: 4 });
      if (!opts.groups.length) {
        svg.append(s('text', { class: 'missing', x: (left + right) / 2, y: (top + bottom) / 2, 'text-anchor': 'middle', text: 'No rounds match these filters' }));
        el.append(svg); return;
      }
      const layers = { whisk: s('g'), rounds: s('g'), agg: s('g'), labels: s('g') };
      Object.values(layers).forEach((l) => svg.append(l));
      const groupEls = new Map();
      const railItems = [];
      let seq = 0;
      for (const g of opts.groups) {
        const st = RS.cohortStats(g.rounds);
        const ours = RS.RECIPES[g.recipe].ours;
        const col = colorFor(g.recipe, g.tp);
        const shape = RS.EFFORT_SHAPE[g.mode];
        const gEls = [];
        // individual rounds
        for (const r of g.rounds) {
          const cx = x(r.seconds / 60); const cy = y(r.score);
          const m = s('g', { class: 'mark', tabindex: 0, role: 'button', dataset: { round: r.id, group: g.key, score: r.score, seconds: r.seconds },
            'aria-label': `${RS.RECIPES[r.recipe].name} ${RS.cohortLabel(r.tp, r.mode, r.parallel)}, round ${r.round}: score ${r.score} of 100 in ${RS.mmss(r.seconds)} (${r.seconds} s)${r.reported_truncation_cases.length ? ', reported truncation ' + RS.truncLabel(r.reported_truncation_cases) : ''}. Open receipt.` });
          m.append(s('circle', { class: 'hit', cx, cy, r: 12 }));
          const popG = s('g', { class: 'pop', style: `--d:${(seq++) * 28}ms` });
          if (ours) {
            const solo = st.n === 1;
            popG.append(s('path', { class: 'vis', d: shapePath(shape, cx, cy, solo ? 7.5 : 5.2), style: `fill:${col};fill-opacity:${solo ? 1 : 0.55};stroke:var(--surface);stroke-width:${solo ? 2 : 1.5};${solo ? `filter:drop-shadow(0 0 6px ${col})` : ''}` }));
            if (solo) popG.append(sparkle(cx + 9, cy - 9, 5, (seq % 7) * .37));
          } else if (st.n === 1) {
            popG.append(token(g.recipe, cx, cy, 9, shape));
          } else {
            popG.append(s('circle', { class: 'vis', cx, cy, r: 4, style: 'fill:var(--surface);stroke:var(--cmp);stroke-width:1.5;stroke-opacity:.8' }));
          }
          m.append(popG);
          if (r.reported_truncation_cases.length) {
            m.append(s('text', { class: 'flag', x: cx + 7, y: cy - 7, 'aria-hidden': 'true', text: '★' }));
          }
          RS.bindTip(m, () => (opts.tip ? opts.tip(r, st) : RS.roundTip(r, st)), () => {
            if (ours && RS.glitter) RS.glitter.burstAt(m.querySelector('.hit'), { count: 26 });
            (opts.open ? opts.open(r) : RS.openRun(r.id));
          });
          if (opts.aria) m.setAttribute('aria-label', opts.aria(r));
          m.addEventListener('pointerenter', () => focusGroup(g.key));
          m.addEventListener('pointerleave', () => focusGroup(null));
          m.addEventListener('focus', () => focusGroup(g.key));
          m.addEventListener('blur', () => focusGroup(null));
          layers.rounds.append(m); gEls.push(m);
        }
        // repeated cohort: median + observed range
        if (st.repeated) {
          const cx = x(st.medSecs / 60); const cy = y(st.medScore);
          const wk = s('g', { class: 'fade', style: `stroke:${col};stroke-width:${ours ? 2.2 : 1.6};stroke-linecap:round;--d:${seq * 28}ms`, dataset: { group: g.key } });
          wk.append(s('line', { x1: x(st.minSecs / 60), x2: x(st.maxSecs / 60), y1: cy, y2: cy }));
          wk.append(s('line', { x1: cx, x2: cx, y1: y(st.minScore), y2: y(st.maxScore) }));
          layers.whisk.append(wk); gEls.push(wk);
          const agg = s('g', { 'aria-hidden': 'true', class: 'pop', style: `--d:${(seq++) * 28 + 200}ms`, dataset: { group: g.key, median: '1' } });
          if (ours) {
            agg.append(s('path', { d: shapePath(shape, cx, cy, 8.5), style: `fill:var(--surface);stroke:${col};stroke-width:3;filter:drop-shadow(0 0 7px ${col})` }));
            agg.append(sparkle(cx + 11, cy - 11, 6, (seq % 5) * .5));
          } else agg.append(token(g.recipe, cx, cy, 9.5, shape));
          layers.agg.append(agg); gEls.push(agg);
        }
        groupEls.set(g.key, gEls);
        railItems.push({ g, st, ax: x(st.atSecs / 60), ay: y(st.atScore) });
      }
      // rail labels with leaders, spaced to avoid collisions
      if (rail) {
        const rx = right + 18; const gap = 17;
        if (opts.railFilter) railItems.splice(0, railItems.length, ...railItems.filter((it) => opts.railFilter(it.g)));
        railItems.sort((a, b) => a.ay - b.ay);
        let lastY = -Infinity;
        for (const it of railItems) { it.ly = Math.max(it.ay, lastY + gap); lastY = it.ly; }
        const overflow = lastY - (bottom - 2);
        if (overflow > 0) { for (const it of railItems) it.ly -= overflow; for (let i = 1; i < railItems.length; i++) if (railItems[i].ly - railItems[i - 1].ly < gap) railItems[i].ly = railItems[i - 1].ly + gap; }
        for (const it of railItems) {
          if (opts.railFilter && !opts.railFilter(it.g)) continue;
          const lg = s('g', { dataset: { group: it.g.key }, 'aria-hidden': 'true' });
          lg.append(s('path', { d: `M${it.ax + 9},${it.ay}C${rx - 12},${it.ay} ${rx - 16},${it.ly} ${rx - 4},${it.ly}`, style: 'fill:none;stroke:var(--axis);stroke-width:1' }));
          const ours = RS.RECIPES[it.g.recipe].ours;
          const t = s('text', { class: `direct${ours ? '' : ' soft'}`, x: rx, y: it.ly + 4 });
          t.textContent = it.g.label(it.st);
          lg.append(t);
          layers.labels.append(lg);
          groupEls.get(it.g.key).push(lg);
        }
      }
      function focusGroup(key) {
        for (const [k, els] of groupEls) for (const e of els) e.classList.toggle('dim', key != null && k !== key);
      }
      el.append(svg);
    };
    RS.onResize(el, draw);
    draw(el.clientWidth || 800);
  };

  function token(recipe, cx, cy, r, shape) {
    const g = s('g', { class: 'vis' });
    if (shape && shape !== 'circle') g.append(s('path', { d: shapePath(shape, cx, cy, r * (shape === 'diamond' ? 1.02 : 1.08)), style: 'fill:var(--cmp-fill);stroke:var(--cmp);stroke-width:2;stroke-linejoin:round' }));
    else g.append(s('circle', { cx, cy, r, style: 'fill:var(--cmp-fill);stroke:var(--cmp);stroke-width:2' }));
    g.append(s('text', { x: cx, y: cy + r * 0.38, 'text-anchor': 'middle', style: `fill:var(--ink);font:800 ${Math.round(r * 1.05)}px var(--sans);pointer-events:none`, text: RS.RECIPES[recipe].mono }));
    return g;
  }
  RS.token = token;
  function sparkle(cx, cy, r, delay) {
    return s('path', { class: 'sparkle', 'aria-hidden': 'true', style: `animation-delay:${delay}s`, d: `M${cx},${cy - r}Q${cx + r * .16},${cy - r * .16} ${cx + r},${cy}Q${cx + r * .16},${cy + r * .16} ${cx},${cy + r}Q${cx - r * .16},${cy + r * .16} ${cx - r},${cy}Q${cx - r * .16},${cy - r * .16} ${cx},${cy - r}Z` });
  }
  RS.sparklePath = sparkle;

  // ---------- line chart with crosshair (speed metrics) ----------
  /* opts: { xs:[{key,label}], series:[{recipe, tp, values:{key:number|null}, nullNote:{key:text}}], yUnit, higherBetter,
             xTitle, ariaLabel, fmt, notMeasured:(recipe,key)=>text } */
  RS.lineChart = function (el, opts) {
    const draw = (W) => {
      RS.clear(el);
      const H = opts.height || Math.round(Math.max(220, Math.min(320, W * 0.62)));
      const left = 44; const right = W - 16; const top = 22; const bottom = H - 42;
      const vals = opts.series.flatMap((se) => Object.values(se.values).filter((v) => v != null && isFinite(v)));
      const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.ariaLabel });
      if (!vals.length) {
        svg.append(s('text', { class: 'missing', x: W / 2, y: H / 2, 'text-anchor': 'middle', text: 'Not measured for the selected recipes' }));
        el.append(svg); return;
      }
      const ym = niceMax(Math.max(...vals) * 1.06, 4);
      const n = opts.xs.length;
      const pad = Math.min(28, (right - left) / (2 * n));
      const xi = (i) => left + pad + (n === 1 ? 0 : (i / (n - 1)) * (right - left - 2 * pad));
      const y = linear(0, ym.max, bottom, top);
      const yTicks = []; for (let t = 0; t <= ym.max + 1e-9; t += ym.step) yTicks.push(+t.toFixed(6));
      const fmtY = (t) => (ym.max < 10 ? t.toFixed(ym.step < 1 ? 1 : 0) : t.toLocaleString('en-US'));
      const grid = s('g', { class: 'grid' }); for (const t of yTicks) grid.append(s('line', { x1: left, x2: right, y1: y(t), y2: y(t) })); svg.append(grid);
      svg.append(s('line', { class: 'axis-line', x1: left, x2: right, y1: bottom, y2: bottom }));
      yTicks.forEach((t) => svg.append(s('text', { class: 'tick', x: left - 7, y: y(t) + 4, 'text-anchor': 'end', text: fmtY(t) })));
      const every = W < 380 && n > 6 ? 2 : 1;
      opts.xs.forEach((xv, i) => { if (i % every === 0 || i === n - 1) svg.append(s('text', { class: 'tick', x: xi(i), y: bottom + 17, 'text-anchor': 'middle', text: xv.label })); });
      svg.append(s('text', { class: 'axis-title', x: right, y: bottom + 34, 'text-anchor': 'end', text: opts.xTitle }));
      svg.append(s('text', { class: 'axis-title', x: 4, y: top - 9, text: `${opts.yUnit} · ${opts.higherBetter ? 'higher is better ↑' : 'lower is better ↓'}` }));
      svg.prepend(s('rect', { class: 'plot-bg', x: left, y: top, width: right - left, height: bottom - top, rx: 12 }));
      const gid = `wash-${Math.random().toString(36).slice(2, 9)}`;
      const defs = s('defs'); svg.prepend(defs);
      const order = opts.series.slice().sort((a, b) => (RS.RECIPES[a.recipe].ours ? 1 : 0) - (RS.RECIPES[b.recipe].ours ? 1 : 0));
      for (const se of order) {
        const r = RS.RECIPES[se.recipe]; const col = colorFor(se.recipe, se.tp);
        const g = s('g', { dataset: { recipe: se.recipe } });
        let seg = [];
        if (r.ours) {
          const lg = s('linearGradient', { id: `${gid}-${se.tp}`, x1: 0, x2: 0, y1: 0, y2: 1 });
          lg.append(s('stop', { offset: 0, style: `stop-color:${col};stop-opacity:.28` }), s('stop', { offset: 1, style: `stop-color:${col};stop-opacity:0` }));
          defs.append(lg);
        }
        const flush = () => {
          if (seg.length > 1) {
            if (r.ours) g.append(s('path', { class: 'fade', d: `M${seg[0][0]},${bottom}L${seg.map((p) => p.join(',')).join('L')}L${seg[seg.length - 1][0]},${bottom}Z`, style: `fill:url(#${gid}-${se.tp})` }));
            g.append(s('polyline', { class: r.ours ? 'draw' : 'fade', pathLength: r.ours ? 1 : null, points: seg.map((p) => p.join(',')).join(' '), style: r.ours ? `fill:none;stroke:${col};stroke-width:3;stroke-linejoin:round;stroke-linecap:round;filter:drop-shadow(0 0 5px ${col})` : `fill:none;stroke:${col};stroke-width:1.8;stroke-dasharray:${r.dash || 'none'};stroke-linejoin:round;stroke-linecap:round` }));
          }
          seg = [];
        };
        opts.xs.forEach((xv, i) => {
          const v = se.values[xv.key];
          if (v == null || !isFinite(v)) {
            flush();
            if (v === null && se.values.hasOwnProperty(xv.key)) { // recorded as null in the source: say so on the axis
              g.append(s('text', { class: 'missing', x: xi(i), y: bottom - 6, 'text-anchor': 'middle', text: `${r.mono}∅`, 'aria-hidden': 'true' }));
            }
            return;
          }
          seg.push([xi(i), y(v)]);
        });
        flush();
        opts.xs.forEach((xv, i) => {
          const v = se.values[xv.key]; if (v == null || !isFinite(v)) return;
          const ds = { recipe: se.recipe, x: xv.key, v: String(v), point: '1' };
          if (r.ours) g.append(s('circle', { cx: xi(i), cy: y(v), r: 4.6, dataset: ds, style: `fill:${col};stroke:var(--surface);stroke-width:2` }));
          else g.append(s('circle', { cx: xi(i), cy: y(v), r: 3.2, dataset: ds, style: 'fill:var(--surface);stroke:var(--cmp);stroke-width:1.6' }));
        });
        // end token for comparison recipes, end value for RiNGSiDE
        const lastI = opts.xs.map((xv, i) => [i, se.values[xv.key]]).filter(([, v]) => v != null && isFinite(v)).pop();
        if (lastI) {
          if (!r.ours) g.append(token(se.recipe, xi(lastI[0]), y(lastI[1]), 7));
          else {
            g.append(sparkle(xi(lastI[0]) + 8, y(lastI[1]) - 8, 5.5, (lastI[0] % 4) * .5));
            // keep RiNGSiDE's end value clear of other series' points at the same level
            const px = xi(lastI[0]); const py = y(lastI[1]);
            const crowded = opts.series.some((o) => o !== se && o.values[opts.xs[lastI[0]].key] != null && Math.abs(y(o.values[opts.xs[lastI[0]].key]) - (py - 10)) < 16);
            g.append(s('text', { class: 'direct', x: px - (lastI[0] === n - 1 ? 4 : 0), y: crowded ? py + 20 : py - 10, 'text-anchor': lastI[0] === n - 1 ? 'end' : 'middle', text: opts.fmt(lastI[1]) }));
          }
        }
        svg.append(g);
      }
      // crosshair layer: pointer and keyboard
      const cross = s('line', { y1: top, y2: bottom, style: 'stroke:var(--focus);stroke-width:1.5;opacity:0;stroke-dasharray:3 3' });
      svg.append(cross);
      const hit = s('rect', { x: left, y: top, width: right - left, height: bottom - top, fill: 'transparent', tabindex: 0, role: 'button', 'aria-label': `${opts.ariaLabel}. Use left and right arrow keys to read values at each ${opts.xTitle}.` });
      svg.append(hit);
      let idx = -1;
      const tipAt = (i) => {
        const xv = opts.xs[i];
        const box = h('div');
        box.append(h('div', { class: 'tt-title', text: `${xv.label} · ${opts.xTitle}` }));
        box.append(h('hr'));
        const rows = opts.series.map((se) => ({ se, v: se.values[xv.key] })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
        for (const { se, v } of rows) {
          const r = RS.RECIPES[se.recipe];
          const row = h('div', { class: 'tt-row' });
          const keyEl = h('span', { class: 'tt-key', style: `border-top-color:${colorFor(se.recipe, se.tp)};border-top-style:${r.dash ? 'dashed' : 'solid'}` });
          row.append(h('span', null, keyEl, ' ', r.name));
          let txt;
          if (v != null && isFinite(v)) txt = h('strong', { text: `${opts.fmt(v)} ${opts.yUnitShort || ''}` });
          else if (v === null && se.values.hasOwnProperty(xv.key)) txt = h('span', { class: 'k', text: (se.nullNote && se.nullNote[xv.key]) || 'no valid value recorded' });
          else txt = h('span', { class: 'k', text: 'not measured' });
          row.append(txt); box.append(row);
        }
        if (opts.tipNote) box.append(h('div', { class: 'tt-hint', text: opts.tipNote }));
        return box;
      };
      const setIdx = (i, evt) => {
        idx = Math.max(0, Math.min(n - 1, i));
        cross.setAttribute('x1', xi(idx)); cross.setAttribute('x2', xi(idx)); cross.style.opacity = 0.6;
        RS.tooltip.show(tipAt(idx), hit, evt);
      };
      hit.addEventListener('pointermove', (e) => {
        const b = svg.getBoundingClientRect(); const px = ((e.clientX - b.left) / b.width) * W;
        let best = 0, bd = Infinity; opts.xs.forEach((_, i) => { const d = Math.abs(xi(i) - px); if (d < bd) { bd = d; best = i; } });
        setIdx(best, e);
      });
      hit.addEventListener('pointerleave', () => { cross.style.opacity = 0; RS.tooltip.hide(hit); });
      hit.addEventListener('focus', () => setIdx(idx < 0 ? 0 : idx));
      hit.addEventListener('blur', () => { cross.style.opacity = 0; RS.tooltip.hide(hit); });
      hit.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); setIdx(idx + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); setIdx(idx - 1); }
      });
      el.append(svg);
    };
    RS.onResize(el, draw);
    draw(el.clientWidth || 500);
  };

  // ---------- dot plot (single-stream decode by workload) ----------
  /* opts: { rows:[{key,label}], series:[{recipe,tp,values}], unit, fmt, ariaLabel } */
  RS.dotPlot = function (el, opts) {
    const draw = (W) => {
      RS.clear(el);
      const rowH = 54; const top = 24; const left = W < 420 ? 78 : 96; const right = W - 18;
      const H = top + opts.rows.length * rowH + 34;
      const vals = opts.series.flatMap((se) => Object.values(se.values).filter((v) => v != null));
      const xm = niceMax(Math.max(...vals) * 1.08, W < 420 ? 3 : 5);
      const x = linear(0, xm.max, left, right);
      const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': opts.ariaLabel });
      const grid = s('g', { class: 'grid' });
      for (let t = 0; t <= xm.max + 1e-9; t += xm.step) {
        grid.append(s('line', { x1: x(t), x2: x(t), y1: top - 6, y2: H - 30 }));
        svg.append(s('text', { class: 'tick', x: x(t), y: H - 14, 'text-anchor': 'middle', text: String(Math.round(t)) }));
      }
      svg.prepend(grid);
      svg.append(s('text', { class: 'axis-title', x: 4, y: 12, text: `${opts.unit} · higher is better →` }));
      opts.rows.forEach((row, i) => {
        const cy = top + i * rowH + rowH / 2;
        svg.append(s('text', { class: 'tick', x: left - 12, y: cy + 4, 'text-anchor': 'end', style: 'font-size:13px;fill:var(--ink-2)', text: row.label }));
        svg.append(s('line', { x1: left, x2: right, y1: cy, y2: cy, style: 'stroke:var(--grid)' }));
        const pts = opts.series.map((se) => ({ se, v: se.values[row.key] })).filter((p) => p.v != null && isFinite(p.v));
        // stagger comparison tokens vertically so overlapping values stay visible
        const cmp = pts.filter((p) => !RS.RECIPES[p.se.recipe].ours).sort((a, b) => a.v - b.v);
        cmp.forEach((p, j) => { p.dy = (j - (cmp.length - 1) / 2) * 11; });
        for (const p of pts) {
          const r = RS.RECIPES[p.se.recipe];
          const cx = x(p.v); const yy = cy + (p.dy || 0);
          const m = s('g', { class: 'mark', tabindex: 0, role: 'img', dataset: { recipe: p.se.recipe, x: row.key, v: String(p.v), point: '1', cx: String(cx) }, 'aria-label': `${r.name} ${row.label}: ${opts.fmt(p.v)} ${opts.unit}` });
          m.append(s('line', { x1: x(0), x2: cx, y1: yy, y2: yy, style: `stroke:${colorFor(p.se.recipe, p.se.tp)};stroke-width:${r.ours ? 5 : 1.4};stroke-linecap:round;stroke-dasharray:${r.dash || 'none'};opacity:${r.ours ? 0.85 : 0.55}` }));
          m.append(s('circle', { class: 'hit', cx, cy: yy, r: 12 }));
          if (r.ours) {
            m.append(s('circle', { class: 'vis pop', cx, cy: yy, r: 7.5, style: `fill:${colorFor(p.se.recipe, p.se.tp)};stroke:var(--surface);stroke-width:2;filter:drop-shadow(0 0 6px ${colorFor(p.se.recipe, p.se.tp)})` }));
            m.append(sparkle(cx + 9, yy - 9, 5, i * .6));
            m.append(s('text', { class: 'direct', x: cx + 11, y: yy - 9, text: opts.fmt(p.v) }));
          } else m.append(token(p.se.recipe, cx, yy, 7));
          RS.bindTip(m, () => h('div', null, h('div', { class: 'tt-val', text: `${opts.fmt(p.v)} ${opts.unit}` }), h('div', { class: 'tt-title', text: `${r.name} · ${row.label}` }), opts.tipNote ? h('div', { class: 'tt-hint', text: opts.tipNote }) : null));
          svg.append(m);
        }
        const absent = opts.series.filter((se) => se.values[row.key] == null);
        if (absent.length) svg.append(s('text', { class: 'missing', x: right, y: cy + rowH / 2 - 4, 'text-anchor': 'end', text: `not measured: ${absent.map((a) => RS.RECIPES[a.recipe].name).join(', ')}` }));
      });
      el.append(svg);
    };
    RS.onResize(el, draw);
    draw(el.clientWidth || 500);
  };

  // ---------- round-time race: one bar per recipe per matched setting ----------
  /* opts: { settings:[{ tp, mode, parallel, label, entries:[{ recipe, rounds }] }], ariaLabel, onSelect(setting) } */
  RS.raceChart = function (el, opts) {
    const draw = (W) => {
      RS.clear(el);
      const narrow = W < 430;
      const labelW = narrow ? 34 : 104; const left = labelW + 8; const right = W - (narrow ? 124 : 150);
      const rowH = 28; const headH = 34; const gapH = 16; const top = 46;
      const all = opts.settings.flatMap((st) => st.entries.flatMap((e) => e.rounds.map((r) => r.seconds)));
      const xm = RS.niceMax(Math.max(...all) / 60 * 1.02, narrow ? 3 : 5);
      const x = linear(0, xm.max, left, right);
      let H = top; for (const st of opts.settings) H += headH + st.entries.length * rowH + gapH;
      H += narrow ? 20 : 8;
      const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': opts.ariaLabel });
      const gid = `race-${Math.random().toString(36).slice(2, 8)}`;
      const defs = s('defs'); svg.append(defs);
      for (const tp of [4, 2]) {
        const lg = s('linearGradient', { id: `${gid}-${tp}`, x1: 0, x2: 1 });
        lg.append(s('stop', { offset: 0, style: `stop-color:var(--tp${tp});stop-opacity:.55` }), s('stop', { offset: 1, style: `stop-color:var(--tp${tp});stop-opacity:1` }));
        defs.append(lg);
      }
      const grid = s('g', { class: 'grid' });
      for (let t = 0; t <= xm.max + 1e-9; t += xm.step) {
        grid.append(s('line', { x1: x(t), x2: x(t), y1: top - 6, y2: H - 8 }));
        svg.append(s('text', { class: 'tick', x: x(t), y: top - 12, 'text-anchor': 'middle', text: `${+t.toFixed(1)}` }));
      }
      svg.prepend(grid); svg.append(defs);
      svg.append(s('text', { class: 'axis-title', x: right, y: 12, 'text-anchor': 'end', text: narrow ? 'median round time, min · shorter is faster' : 'median completed-round time, minutes · shorter is faster' }));
      let y = top; let seq = 0;
      for (const st of opts.settings) {
        const stats = st.entries.map((e) => ({ ...e, st: RS.cohortStats(e.rounds) })).sort((a, b) => a.st.atSecs - b.st.atSecs);
        const ours = stats.find((e) => RS.RECIPES[e.recipe].ours);
        const head = s('text', { class: 'direct', x: 0, y: y + 20, style: 'font-size:14px' });
        head.textContent = st.label;
        svg.append(head);
        if (ours) {
          const others = stats.filter((e) => e !== ours);
          const lead = Math.min(...others.map((e) => e.st.atSecs)) / ours.st.atSecs;
          const badge = s('text', { class: 'direct', x: right + (narrow ? 90 : 144), y: y + 20, 'text-anchor': 'end', style: `font-size:13px;fill:var(--tp${st.tp}-text)` });
          badge.textContent = `${lead.toFixed(2)}× faster than next`;
          svg.append(badge);
        }
        y += headH;
        for (const e of stats) {
          const r = RS.RECIPES[e.recipe]; const cy = y + rowH / 2; const w = x(e.st.atSecs / 60) - left;
          const m = s('g', { class: 'mark', tabindex: 0, role: 'button', dataset: { recipe: e.recipe, setting: `${st.tp}|${st.mode}|${st.parallel}`, secs: String(e.st.atSecs), score: String(e.st.atScore), n: String(e.st.n) },
            'aria-label': `${r.name}, ${st.label}: ${e.st.repeated ? 'median ' : 'single round '}${RS.mmss(e.st.atSecs)} per round, score ${e.st.atScore} of 100${ours && e !== ours ? `, ${(e.st.atSecs / ours.st.atSecs).toFixed(2)} times RiNGSiDE's time` : ''}. Show the matched panel.` });
          m.append(s('rect', { class: 'hit', x: 0, y: y + 1, width: W, height: rowH - 2 }));
          // label column
          if (narrow) m.append(r.ours ? s('circle', { cx: 14, cy, r: 8, style: `fill:var(--tp${st.tp});filter:drop-shadow(0 0 5px var(--tp${st.tp}))` }) : token(e.recipe, 14, cy, 8));
          else {
            m.append(r.ours ? s('circle', { cx: 10, cy, r: 7, style: `fill:var(--tp${st.tp});filter:drop-shadow(0 0 5px var(--tp${st.tp}))` }) : token(e.recipe, 10, cy, 8));
            m.append(s('text', { class: r.ours ? 'direct' : 'direct soft', x: 24, y: cy + 4.5, style: 'font-size:13px', text: r.name }));
          }
          const bar = s('rect', { class: 'vis pop', x: left, y: cy - 8, width: Math.max(2, w), height: 16, rx: 8,
            style: r.ours ? `fill:url(#${gid}-${st.tp});filter:drop-shadow(0 0 8px var(--tp${st.tp}));transform-origin:left center;--d:${seq * 40}ms` : `fill:var(--cmp);fill-opacity:.28;stroke:var(--cmp);stroke-opacity:.55;stroke-dasharray:${r.dash || 'none'};--d:${seq * 40}ms` });
          m.append(bar);
          // every round as a tick on the bar
          for (const rr of e.rounds) m.append(s('circle', { cx: x(rr.seconds / 60), cy, r: 2.6, style: `fill:${r.ours ? '#fff' : 'var(--ink)'};opacity:${r.ours ? .9 : .55}` }));
          if (r.ours) m.append(RS.sparklePath(left + w + 6, cy - 9, 5, seq * .3));
          const lab = s('text', { class: r.ours ? 'direct' : 'direct soft', x: left + w + (r.ours ? 14 : 8), y: cy + 4.5, style: 'font-size:12.5px' });
          const ratio = ours && e !== ours ? ` · ${(e.st.atSecs / ours.st.atSecs).toFixed(2)}×` : '';
          lab.textContent = narrow ? `${RS.mmss(e.st.atSecs)} · ${e.st.atScore}${e.st.repeated ? '' : '*'}${ratio}` : `${RS.mmss(e.st.atSecs)} · ${e.st.atScore}/100${e.st.repeated ? '' : ' (single)'}${ratio}`;
          m.append(lab);
          RS.bindTip(m, () => {
            const box = h('div');
            box.append(h('div', { class: 'tt-val', text: `${RS.mmss(e.st.atSecs)} · ${e.st.atScore}/100` }));
            box.append(h('div', { class: 'tt-title', text: `${r.name} · ${st.label}` }));
            box.append(h('div', { class: 'xsmall', style: 'color:var(--ink-3)', text: e.st.repeated ? `median of ${e.st.n} rounds · times ${e.st.secs.map(RS.mmss).join(', ')} · scores ${e.st.scores.join(', ')}` : 'single round · no variance estimate' }));
            if (ours && e !== ours) box.append(h('div', { class: 'tt-row' }, h('span', { class: 'k', text: 'round time vs RiNGSiDE' }), h('strong', { text: `${(e.st.atSecs / ours.st.atSecs).toFixed(2)}×` })));
            if (e.st.truncated.length) box.append(h('div', { class: 'tt-row' }, h('span', { class: 'k', text: 'reported truncation' }), h('span', { class: 'flag-badge', text: `★ ${e.st.truncated.map((q) => RS.truncLabel(q.reported_truncation_cases)).join(', ')}` })));
            box.append(h('div', { class: 'tt-hint', text: 'Dots on the bar are the individual rounds. Click to open this setting\'s panel.' }));
            return box;
          }, () => { if (r.ours && RS.glitter) RS.glitter.burstAt(bar, { count: 36 }); opts.onSelect && opts.onSelect(st); });
          svg.append(m);
          y += rowH; seq++;
        }
        y += gapH;
      }
      if (narrow) svg.append(s('text', { class: 'missing', x: 0, y: H - 2, text: 'score / 100 · * single round, no variance estimate' }));
      el.append(svg);
    };
    RS.onResize(el, draw);
    draw(el.clientWidth || 700);
  };

  // ---------- tooltip for a tool-eval round ----------
  RS.roundTip = function (r, st) {
    const rec = RS.RECIPES[r.recipe];
    const box = h('div');
    box.append(h('div', { class: 'tt-val', text: `${r.score}/100 · ${RS.mmss(r.seconds)}` }));
    box.append(h('div', { class: 'tt-title' }, rec.name, ' · ', `round ${r.round}`));
    box.append(h('div', { class: 'k', style: 'color:var(--ink-3)', text: RS.cohortLabel(r.tp, r.mode, r.parallel) }));
    box.append(h('hr'));
    const row = (k, v) => box.append(h('div', { class: 'tt-row' }, h('span', { class: 'k', text: k }), h('span', { text: v })));
    row('points', `${r.points}/${r.max_points}`);
    row('pass · partial · fail', `${r.passed} · ${r.partial} · ${r.failed}`);
    row('round time', `${r.seconds} s`);
    row('truncation reported', r.reported_truncation_cases.length ? RS.truncLabel(r.reported_truncation_cases) : 'none reported');
    if (st && st.repeated) row(`cohort (n=${st.n})`, `median ${st.medScore} · ${RS.mmss(st.medSecs)}`);
    else if (st) row('cohort', 'single round · no variance estimate');
    box.append(h('div', { class: 'tt-hint', text: 'Click or press Enter to inspect the run and its receipts' }));
    return box;
  };
})();
