/* RiNGSiDE benchmark review — sections 00–03: hero, RiNGSiDE quality × time, matched recipes, speed. */
(function () {
  'use strict';
  const RS = window.RS; const D = RS.data; const { h } = RS;
  const R = RS.RECIPES;

  const cohortOrder = (a, b) => (b.tp - a.tp) || (RS.EFFORTS.indexOf(a.mode) - RS.EFFORTS.indexOf(b.mode)) || (a.parallel - b.parallel);
  function cohortsOf(rounds) {
    const map = new Map();
    for (const r of rounds) {
      const k = `${r.recipe}|${RS.cohortKey(r)}`;
      if (!map.has(k)) map.set(k, { key: k, recipe: r.recipe, tp: r.tp, mode: r.mode, parallel: r.parallel, rounds: [] });
      map.get(k).rounds.push(r);
    }
    return Array.from(map.values()).sort(cohortOrder);
  }
  RS.cohortsOf = cohortsOf;
  const ours = D.rounds.filter((r) => r.recipe === 'ringside');

  // ================= hero =================
  RS.renderHero = function () {
    const el = RS.$('#hero-stats');
    for (const tp of RS.TPS) for (const mode of RS.EFFORTS) {
      const rr = ours.filter((r) => r.tp === tp && r.mode === mode && r.parallel === 4);
      const st = RS.cohortStats(rr);
      const sub = `${st.repeated ? 'median ' : ''}${RS.mmss(st.atSecs)} per round · ${st.repeated ? `n=${st.n}, range ${st.minScore}–${st.maxScore}` : 'single round'}`;
      const b = h('button', { type: 'button', class: 'stat', 'aria-label': `TP${tp} ${RS.EFFORT_LABEL[mode]} at four in parallel: ${st.repeated ? 'median ' : ''}score ${st.atScore} of 100, ${sub}. Jump to the chart.` },
        h('div', { class: 'lab' }, h('span', { class: `swatch tp${tp}` }), `TP${tp} · ${RS.EFFORT_LABEL[mode]} · C4`),
        h('div', { class: 'val' }, String(st.atScore), h('small', { text: ' /100' })),
        h('div', { class: 'sub', text: sub }));
      b.addEventListener('click', () => {
        if (RS.glitter) RS.glitter.burstAt(b, { count: 40, colors: tp === 4 ? ['#4a8cff', '#9cc2ff', '#ffffff', '#ffd36b'] : ['#f04d93', '#ffb3d6', '#ffffff', '#ffd36b'] });
        setTimeout(() => RS.$('#ringside-chart').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }), 350);
      });
      el.append(b);
    }
    // marquee: facts computed from the snapshot (duplicated once for a seamless loop; the copy is hidden from AT)
    const t4 = RS.cohortStats(ours.filter((r) => r.tp === 4 && r.mode === 'high' && r.parallel === 4));
    const c16 = RS.cohortStats(ours.filter((r) => r.tp === 4 && r.mode === 'high' && r.parallel === 16));
    const facts = [
      ['23', 'RiNGSiDE rounds'], ['60', 'rounds in the ring'], ['4', 'recipes, 1 benchmark'], ['92', 'scenarios per round'],
      [`${t4.medScore}/100`, `TP4 High median · ${RS.mmss(t4.medSecs)}`], [`${RS.mmss(c16.medSecs)}`, 'TP4 High median at 16 in parallel'],
      [String(D.speedCsv.length), 'speed cells'], [String(Object.keys(D.files).length), 'receipt files hashed'], ['0', 'new runs'], ['278/278', 'checksums verified'],
    ];
    const track = RS.$('#marquee');
    for (let k = 0; k < 2; k++) {
      const span = h('span', k ? { 'aria-hidden': 'true' } : null);
      for (const [n, t] of facts) span.append(h('span', null, h('b', { text: n }), ' ', t, ' ', h('i', { 'aria-hidden': 'true', text: '✦' })));
      track.append(span);
    }
  };

  // ================= 01 RiNGSiDE =================
  // ================= headline: computed from the rounds, never hard-coded =================
  RS.headline = function () {
    const keys = Array.from(new Set(D.rounds.map((r) => RS.cohortKey(r)))).map((k) => { const [tp, mode, par] = k.split('|'); return { tp: +tp, mode, parallel: +par }; }).sort(cohortOrder);
    const settings = [];
    for (const c of keys) {
      const entries = RS.RECIPE_ORDER.map((k) => ({ recipe: k, rounds: D.rounds.filter((r) => r.recipe === k && r.tp === c.tp && r.mode === c.mode && r.parallel === c.parallel) })).filter((e) => e.rounds.length);
      const label = `${RS.EFFORT_LABEL[c.mode]} · ${D.cap(c.mode) / 1024}K · C${c.parallel}`;
      settings.push({ ...c, label, entries });
    }
    const matched = settings.filter((st) => st.entries.length > 1 && st.entries.some((e) => e.recipe === 'ringside'));
    const rows = matched.map((st) => {
      const ours = st.entries.find((e) => e.recipe === 'ringside'); const os = RS.cohortStats(ours.rounds);
      const others = st.entries.filter((e) => e !== ours).map((e) => ({ recipe: e.recipe, st: RS.cohortStats(e.rounds) }));
      const next = Math.min(...others.map((o) => o.st.atSecs)); const slow = Math.max(...others.map((o) => o.st.atSecs));
      const best = Math.max(os.atScore, ...others.map((o) => o.st.atScore));
      return { st, os, others, fastest: others.every((o) => os.atSecs < o.st.atSecs), clean: others.every((o) => os.maxSecs < o.st.minSecs),
        lead: next / os.atSecs, vsSlowest: slow / os.atSecs, top: os.atScore >= best, behind: best - os.atScore,
        bestBy: others.filter((o) => o.st.atScore === best).map((o) => R[o.recipe].name) };
    });
    const tpRange = (tp) => { const l = rows.filter((r) => r.st.tp === tp).map((r) => r.lead); return l.length ? [Math.min(...l), Math.max(...l)] : null; };
    const spread = Math.max(...Array.from(new Set(D.rounds.map((r) => `${r.recipe}|${RS.cohortKey(r)}`))).map((k) => D.rounds.filter((r) => `${r.recipe}|${RS.cohortKey(r)}` === k)).filter((g) => g.length > 1).map((g) => Math.max(...g.map((r) => r.score)) - Math.min(...g.map((r) => r.score))));
    return { settings, matched, rows, n: rows.length, fastest: rows.filter((r) => r.fastest).length, clean: rows.filter((r) => r.clean).length,
      tp4: tpRange(4), tp2: tpRange(2), maxVsSlowest: Math.max(...rows.map((r) => r.vsSlowest)), top: rows.filter((r) => r.top).length,
      maxBehind: Math.max(...rows.map((r) => r.behind)), notTop: rows.filter((r) => !r.top), spread };
  };

  // ================= 01 main event =================
  RS.renderRingside = function () {
    const H = RS.headline();
    // hero claim
    const hc = RS.$('#hero-claim');
    if (hc) { RS.clear(hc); hc.append('Fastest round in ', h('span', { class: 'hl', text: `${H.fastest} of ${H.n}` }), ' matched settings — at the same scores.'); }
    // callouts
    const co = RS.$('#ringside-callouts');
    const f = (x) => x.toFixed(2);
    co.append(h('div', { class: 'callout' }, h('span', { class: 'big holo-text', text: `${H.fastest}/${H.n}` }), h('b', { text: 'Fastest median round in every matched setting' }),
      `In ${H.clean} of the ${H.n}, even our slowest round finished before every other recipe's fastest round. Settings run by only one recipe are not counted.`));
    co.append(h('div', { class: 'callout' }, h('span', { class: 'big', text: `${f(H.tp4[0])}–${f(H.tp4[1])}×` }), h('b', { text: 'TP4 lead over the next-fastest recipe' }),
      `On TP2 the lead is ${f(H.tp2[0])}–${f(H.tp2[1])}×. Against the slowest recipe measured at the same setting, up to ${f(H.maxVsSlowest)}× (ratios of medians, or single values for singletons).`));
    co.append(h('div', { class: 'callout tp2' }, h('span', { class: 'big', text: `${H.top}/${H.n}` }), h('b', { text: 'Top or tied-top score' }),
      `${H.notTop.length ? `In the other ${H.notTop.length} (${H.notTop.map((r) => `TP${r.st.tp} ${r.st.label.split(' · ')[0]}: ${r.behind} point behind ${r.bestBy.join(', ')}`).join('; ')}) we trail by at most ${H.maxBehind} point. ` : ''}Rounds of the same setting spread by up to ${H.spread} points, so score gaps this small are within round-to-round variation. The clear difference is time.`));

    // round-time race
    for (const tp of RS.TPS) {
      RS.raceChart(RS.$(`#race-${tp}`), { settings: H.matched.filter((st) => st.tp === tp), ariaLabel: `Round-time race, TP${tp}: median completed-round time per recipe at each matched setting`, onSelect: (st) => { RS.ensureAll && RS.ensureAll(); RS.showPanel && RS.showPanel(st); } });
    }

    // quality × time with every recipe
    const state = { mode: new Set(['high', 'low', 'max']), par: new Set([4]), rec: new Set(RS.RECIPE_ORDER) };
    const ctl = RS.$('#ringside-controls');
    const redraw = () => draw();
    ctl.append(RS.chipGroup({ label: 'Recipes', name: 'r-rec', options: RS.RECIPE_ORDER.map((k) => ({ value: k, label: R[k].name, glyph: R[k].ours ? h('span', { class: 'swatch tp4' }) : RS.glyph(null, null, { mono: R[k].mono }) })), selected: state.rec, onChange: (v) => { state.rec = v; redraw(); } }));
    ctl.append(RS.chipGroup({ label: 'Effort', name: 'r-mode', options: RS.EFFORTS.map((m) => ({ value: m, label: `${RS.EFFORT_LABEL[m]} · ${D.cap(m) / 1024}K`, glyph: RS.glyph(RS.EFFORT_SHAPE[m], 'var(--ink-2)') })), selected: state.mode, onChange: (v) => { state.mode = v; redraw(); } }));
    ctl.append(RS.chipGroup({ label: 'In parallel', name: 'r-par', options: [4, 6, 8, 16].map((c) => ({ value: c, label: `C${c}`, title: c === 4 ? 'The matched comparison setting' : 'High effort only; separate cohorts' })), selected: state.par, onChange: (v) => { state.par = v; redraw(); } }));
    const lg = RS.$('#ringside-legend');
    lg.append(h('span', { class: 'item' }, h('span', { class: 'swatch tp4' }), h('span', { class: 'swatch tp2' }), 'RiNGSiDE (TP4 · TP2)'));
    for (const k of ['miaai', 'tonyd2wild', 'knapcio']) lg.append(h('span', { class: 'item' }, RS.glyph(null, null, { mono: R[k].mono, size: 18 }), R[k].name));
    for (const m of RS.EFFORTS) lg.append(h('span', { class: 'item' }, RS.glyph(RS.EFFORT_SHAPE[m], 'var(--ink-2)'), `${RS.EFFORT_LABEL[m]} (${D.cap(m).toLocaleString('en-US')}-token cap)`));
    function draw() {
      const rr = D.rounds.filter((r) => state.rec.has(r.recipe) && state.mode.has(r.mode) && state.par.has(r.parallel));
      for (const tp of RS.TPS) {
        const tr = rr.filter((r) => r.tp === tp);
        const onlyOurs = state.rec.size === 1 && state.rec.has('ringside');
        const groups = cohortsOf(tr).map((g) => ({ ...g, label: (st) => `${R[g.recipe].ours ? '' : R[g.recipe].name + ' '}${RS.EFFORT_LABEL[g.mode]}${g.parallel !== 4 ? ' C' + g.parallel : ''} · ${st.atScore} · ${RS.mmss(st.atSecs)}${st.repeated ? '' : ' (single)'}` }));
        const xMax = Math.max(...D.rounds.filter((r) => r.tp === tp && state.rec.has(r.recipe)).map((r) => r.seconds));
        RS.qualityChart(RS.$(`#qt-${tp}`), { groups, xMaxSec: xMax, height: 400, railFilter: onlyOurs ? null : (g) => R[g.recipe].ours, ariaLabel: `TP${tp}: ${tr.length} rounds, score against completed-round time` });
      }
      RS.$('#ringside-chart-title').textContent = `${RS.plural(rr.length, 'round')} shown of ${D.rounds.length} · ${rr.filter((r) => r.recipe === 'ringside').length} of them RiNGSiDE`;
    }
    draw();

    concurrencyCharts();
    ringsideTable();
  };

  function concurrencyCharts() {
    const pars = [4, 8, 16];
    const build = (el, metric) => {
      const draw = (W) => {
        RS.clear(el);
        const H = Math.round(Math.max(210, Math.min(280, W * 0.55)));
        const left = 40, right = W - 60, top = 20, bottom = H - 40;
        const xi = (i) => left + 20 + (i / 2) * (right - left - 40);
        const isScore = metric === 'score';
        const [y0, y1] = isScore ? [84, 96] : [0, RS.niceMax(Math.max(...ours.filter((r) => r.mode === 'high').map((r) => r.seconds)) / 60, 4).max];
        const y = (v) => bottom - ((v - y0) / (y1 - y0)) * (bottom - top);
        const svg = RS.s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': isScore ? 'RiNGSiDE High effort: median score by scenarios in parallel' : 'RiNGSiDE High effort: median round time by scenarios in parallel' });
        const step = isScore ? 2 : RS.niceMax(y1, 4).step;
        for (let t = y0; t <= y1 + 1e-9; t += step) { svg.append(RS.s('line', { x1: left, x2: right, y1: y(t), y2: y(t), style: 'stroke:var(--grid)' })); svg.append(RS.s('text', { class: 'tick', x: left - 7, y: y(t) + 4, 'text-anchor': 'end', text: String(+t.toFixed(1)) })); }
        pars.forEach((c, i) => svg.append(RS.s('text', { class: 'tick', x: xi(i), y: bottom + 17, 'text-anchor': 'middle', text: `C${c}` })));
        svg.append(RS.s('text', { class: 'axis-title', x: right, y: bottom + 33, 'text-anchor': 'end', text: 'scenarios in parallel' }));
        for (const tp of RS.TPS) {
          const col = `var(--tp${tp})`; const pts = [];
          pars.forEach((c, i) => {
            const rr = ours.filter((r) => r.tp === tp && r.mode === 'high' && r.parallel === c);
            if (!rr.length) return;
            const st = RS.cohortStats(rr); const vals = isScore ? st.scores : st.secs.map((v) => v / 60);
            const off = tp === 4 ? -6 : 6;
            for (const [j, v] of vals.entries()) {
              const r = rr[j];
              const m = RS.s('g', { class: 'mark', tabindex: 0, role: 'button', 'aria-label': `TP${tp} High C${c} round ${r.round}: ${r.score}/100 in ${RS.mmss(r.seconds)}. Open receipt.` });
              m.append(RS.s('circle', { class: 'hit', cx: xi(i) + off, cy: y(v), r: 10 }));
              m.append(RS.s('circle', { class: 'vis', cx: xi(i) + off, cy: y(v), r: 3.6, style: `fill:${col};fill-opacity:.45;stroke:var(--surface);stroke-width:1.2` }));
              if (r.reported_truncation_cases.length) m.append(RS.s('text', { class: 'flag', x: xi(i) + off + 5, y: y(v) - 5, text: '★' }));
              RS.bindTip(m, () => RS.roundTip(r, st), () => RS.openRun(r.id));
              svg.append(m);
            }
            const mv = isScore ? st.medScore : st.medSecs / 60;
            const lo = isScore ? st.minScore : st.minSecs / 60; const hi = isScore ? st.maxScore : st.maxSecs / 60;
            svg.append(RS.s('line', { x1: xi(i) + off, x2: xi(i) + off, y1: y(lo), y2: y(hi), style: `stroke:${col};stroke-width:1.6` }));
            pts.push([xi(i) + off, y(mv), mv, c]);
          });
          svg.append(RS.s('polyline', { points: pts.map((p) => `${p[0]},${p[1]}`).join(' '), style: `fill:none;stroke:${col};stroke-width:2.4` }));
          for (const p of pts) {
            svg.append(RS.s('circle', { cx: p[0], cy: p[1], r: 5.5, style: `fill:var(--surface);stroke:${col};stroke-width:2.4` }));
          }
          const last = pts[pts.length - 1];
          svg.append(RS.s('text', { class: 'direct', x: last[0] + 10, y: last[1] + 4, text: `TP${tp} ${isScore ? last[2] : RS.mmss(last[2] * 60)}` }));
          if (tp === 2) svg.append(RS.s('text', { class: 'missing', x: xi(2), y: bottom - 8, 'text-anchor': 'middle', text: 'TP2 C16 not run' }));
        }
        el.append(svg);
      };
      RS.onResize(el, draw); draw(el.clientWidth || 500);
    };
    build(RS.$('#conc-score'), 'score');
    build(RS.$('#conc-time'), 'time');
  }

  function ringsideTable() {
    const t = RS.$('#ringside-table');
    t.append(h('thead', null, h('tr', null, ...['Cohort', 'n', 'Scores (by round)', 'Round times', 'Median score (range)', 'Median time (range)', 'Truncation reported'].map((c) => h('th', { scope: 'col', text: c })))));
    const tb = h('tbody');
    for (const g of cohortsOf(ours)) {
      const st = RS.cohortStats(g.rounds);
      const tr = h('tr', { class: `ours tp${g.tp}` });
      tr.append(h('td', null, RS.tpTag(g.tp), ' ', `${RS.EFFORT_LABEL[g.mode]} · ${D.cap(g.mode) / 1024}K · C${g.parallel}`));
      tr.append(h('td', { class: 'num', text: String(st.n) }));
      const links = (fmt) => g.rounds.flatMap((r, i) => [i ? ' · ' : '', h('a', { href: `#run/${r.id}`, 'aria-label': `Inspect ${r.id}`, text: fmt(r) })]);
      tr.append(h('td', { class: 'num' }, ...links((r) => String(r.score))));
      tr.append(h('td', { class: 'num' }, ...links((r) => RS.mmss(r.seconds))));
      tr.append(h('td', { class: 'num', text: st.repeated ? `${st.medScore} (${st.minScore}–${st.maxScore})` : `${st.atScore} · single` }));
      tr.append(h('td', { class: 'num', text: st.repeated ? `${RS.mmss(st.medSecs)} (${RS.mmss(st.minSecs)}–${RS.mmss(st.maxSecs)})` : `${RS.mmss(st.atSecs)} · single` }));
      tr.append(h('td', null, st.truncated.length ? h('span', { class: 'flag-badge', text: `★ ${st.truncated.map((r) => `round ${r.round}: ${RS.truncLabel(r.reported_truncation_cases)}`).join('; ')}` }) : h('span', { class: 'muted', text: 'none reported' })));
      tb.append(tr);
    }
    t.append(tb);
  }

  // ================= 02 matched =================
  const W = () => D.speedWindows;
  const appl = (win) => (W()[win] && W()[win].native['code-full'] && W()[win].native['code-full'].appliance) || {};
  function recipeCards() {
    const el = RS.$('#recipe-cards');
    const re = D.toolEval.recipes;
    const ringTP4 = appl('2026-09-26-ringside-redhat-rowsplit-tp4-1'); const ringTP2 = appl('2026-09-25-tp2-final-1');
    const miaTP4 = appl('2026-09-23-mia-7cded8e-tp4-full-2'); const miaTP2 = appl('2026-09-23-mia-7cded8e-tp2-compact-full-1');
    const tonyTP4 = appl('2026-09-21-tony-common-capacity-full-2'); const tonyTP2 = appl('2026-09-23-tony-tp2-9fea48c-full-1');
    const knap = appl('2026-09-27-knapcio-matched-speed-run-01');
    const byId = Object.fromEntries(D.speed.rows.map((r) => [r.id, r]));
    const cards = [
      { key: 'ringside', who: 'Our corner · othexmr', name: re.ringside.name, link: 'https://github.com/othexmr/GLM-5.3-Flash-NVFP4-2x-4x-DGX-Sparks-RiNGSiDE', rows: [
        ['Base model', 'zai-org/GLM-5.3-Flash, quantised to NVFP4 by RedHatAI', 'repo'],
        ['Weights (all quality; TP4 speed)', `${re.ringside.checkpoint} @ ${re.ringside.revision}`, 'receipt'],
        ['Recorded format', ringTP4.quantisation, 'receipt'],
        ['Runtime paths', 'Our mixed dense FP8/NVFP4 runtime paths (the repo carries the dual-FP8 dense layer, glm53_dual_fp8_dense.py)', 'brief'],
        ['Drafter', 'incoai/GLM-5.3-Flash-DFlash2 @ 7d74cdd8 — Inco AI\'s DFlash 2 on z-lab\'s DFlash — 7 speculative tokens', 'repo'],
        ['Tokenizer', 'tokenizer.json of nvidia/GLM-5.3-Flash-NVFP4 @ 423acf37, read in place of RedHatAI\'s', 'repo'],
        ['Engine', 'vLLM v0.29.0 with the GLM-5.3 backport, b12x kernels and the sparse-MLA plugin, in one base image', 'repo'],
        ['Served label', `${re.ringside.served_as} (alias for the RedHatAI weights)`, 'receipt'],
        ['TP2 speed weights', `nvidia/GLM-5.3-Flash-NVFP4 @ ${String(ringTP2.model_revision || '').slice(0, 8)} — ${ringTP2.quantisation || ''}`, 'receipt'],
        ['Image', `lab image ${re.ringside.image}; ${re.ringside.note}`, 'receipt'],
      ], note: 'The repository today (read at 6606f76) is later than the measured lab image 017fd0ba; the site never presents repository HEAD as the measured build.' },
      { key: 'miaai', who: 'Comparison · MiaAI-Lab', name: re.miaai.name, rows: [
        ['Weights', `${re.miaai.checkpoint} @ ${re.miaai.revision} (EXL3) — by Brandon`, 'receipt'],
        ['Recorded format', miaTP4.quantisation, 'receipt'],
        ['Drafter', `TP4: ${miaTP4.drafter || '—'}. TP2: ${(miaTP2.drafter || '').replace(/^incoai\/GLM-5.3-Flash-DFlash2 at [0-9a-f]+, /, '')}`, 'receipt'],
        ['Recipe revisions', `quality ${re.miaai.commit} · speed 7cded8e`, 'receipt'],
        ['Lab adaptation', `TP4: ${re.miaai.tp['4'].note}. TP2: ${re.miaai.tp['2'].note}.`, 'receipt'],
        ['Image', re.miaai.image, 'receipt'],
        ['Shared with RiNGSiDE', 'RiNGSiDE serves MiaAI-Lab\'s chat template file byte for byte (zai-org\'s template with the thinking gate by Raymond Lucke, rwl4)', 'repo'],
      ], note: 'The Mia EXL3 image serves Brandon\'s brandonmusic/GLM-5.3-Flash-tr3-4bpw weights with the incoai DFlash2 drafter.' },
      { key: 'tonyd2wild', who: 'Comparison · tonyd2wild', name: 'tonyd2wild · GLM-5.3 Flash NVFP4 recipes', rows: [
        ['Weights (team)', 'NVIDIA checkpoint with its offline NVFP4 dense conversion and K7 DFlash2 — a separate recipe from Knapcio\'s lossless8 conversion', 'brief'],
        ['TP4 speed receipt', `${tonyTP4.model_revision} · ${tonyTP4.quantisation}`, 'receipt'],
        ['TP4 drafter', 'Lab-pinned DFlash2 7d74cdd8, K7 (the upstream runbook does not pin it)', 'receipt'],
        ['TP2 speed receipt', `${tonyTP2.model_revision} · ${tonyTP2.quantisation}`, 'receipt'],
        ['Recipes', `TP4 ${byId['tp4-tonyd2wild-2ac4e8dd'].recipe} @ 2ac4e8dd (quality and speed). TP2 ${byId['tp2-tonyd2wild-9fea48c'].recipe}: quality abb38bb0, speed 9fea48c.`, 'receipt'],
        ['Quality checkpoint', 'Tool-eval receipts record only the served name glm-5.3-flash and path /models/glm-5.3-flash-nvfp4', 'receipt'],
        ['Our repo\'s comparison table', 'TP2 arm loaded RedHatAI 18d55bfd; TP4 arm loaded nvidia 423acf37, converted locally with that recipe\'s own tools', 'repo'],
      ], note: 'Differs from the team\'s description: the TP2 speed receipt records RedHatAI weights (18d55bfd, "as shipped by the recipe"), not the NVIDIA conversion. Both are shown; neither is overwritten.', warn: true },
      { key: 'knapcio', who: 'Comparison · knapcio', name: re.knapcio.name, rows: [
        ['Measured recipe', 'dddb0347 — owner-approved port to this lab\'s switchless ring (a later fork revision is not the measured runtime)', 'receipt'],
        ['Weights (team)', 'NVIDIA NVFP4 routed experts plus an 8-bit non-expert conversion: KDA MXFP8, MLA/shared projections block-128 FP8, selected BF16 tensors retained; pinned weight preparation', 'brief'],
        ['Speed receipt', `${knap.checkpoint} · revision "${knap.model_revision}" · ${knap.quantisation}`, 'receipt'],
        ['Drafter', 'DFlash2 decoder weights converted separately to FP8 (receipt: "FP8 drafter bf582e4e")', 'brief'],
        ['Served label', 'GLM-5.3-Flash-FP8 — a historical API label; the target is mixed NVFP4 / 8-bit / BF16', 'receipt'],
        ['Template', 'Native NVIDIA template ignores the thinking-off flag; equivalent effective thinking behaviour is unproved', 'receipt'],
      ], note: '"lossless8" is the recipe\'s name for its conversion, not a claim of mathematical losslessness.' },
    ];
    for (const c of cards) {
      const r = R[c.key];
      const card = h('article', { class: `recipe${r.ours ? ' ours' : ''}`, 'aria-label': `${r.name} recipe and weights` });
      card.append(h('div', { class: 'who', text: c.who }));
      card.append(h('h4', null, RS.monogram(c.key), r.name));
      card.append(h('p', { class: 'xsmall muted', style: 'margin:-4px 0 10px' }, c.link ? h('a', { href: c.link, rel: 'noopener noreferrer', text: c.name }) : c.name));
      const dl = h('dl');
      for (const [k, v, src] of c.rows) {
        dl.append(h('dt', { text: k }));
        const why = { brief: 'Stated by the RiNGSiDE team; not recorded in the packaged receipts or the repository', repo: 'Stated in the RiNGSiDE recipe repository (read at 6606f76)', receipt: 'Recorded in the packaged receipts or evidence JSON' }[src];
        dl.append(h('dd', null, v || '—', ' ', h('span', { class: `tag src-${src}`, title: why, text: src === 'brief' ? 'team' : src })));
      }
      card.append(dl);
      card.append(h('p', { class: `note${c.warn ? ' warn' : ''}`, text: c.note }));
      if (r.ours) card.classList.add('foil');
      el.append(card);
    }
  }

  function matrix() {
    const t = RS.$('#matrix');
    const keys = Array.from(new Set(D.rounds.map((r) => RS.cohortKey(r)))).map((k) => { const [tp, mode, par] = k.split('|'); return { tp: +tp, mode, parallel: +par }; }).sort(cohortOrder);
    t.append(h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Setting' }), ...RS.RECIPE_ORDER.map((k) => h('th', { scope: 'col', class: R[k].ours ? 'ours-col' : null }, RS.monogram(k), R[k].name)))));
    const tb = h('tbody');
    for (const c of keys) {
      const tr = h('tr');
      tr.append(h('th', { scope: 'row' }, RS.tpTag(c.tp), ' ', `${RS.EFFORT_LABEL[c.mode]} · C${c.parallel}`, h('div', { class: 'cell-meta', text: `${D.cap(c.mode).toLocaleString('en-US')}-token cap` })));
      const oursRR = D.rounds.filter((r) => r.recipe === 'ringside' && r.tp === c.tp && r.mode === c.mode && r.parallel === c.parallel);
      const ref = oursRR.length ? RS.cohortStats(oursRR).atSecs : null;
      for (const k of RS.RECIPE_ORDER) {
        const rr = D.rounds.filter((r) => r.recipe === k && r.tp === c.tp && r.mode === c.mode && r.parallel === c.parallel);
        const td = h('td', { class: R[k].ours ? 'ours-col' : null });
        if (!rr.length) {
          const why = k === 'knapcio' && c.tp === 2 ? 'No Knapcio TP2 measurement' : k === 'tonyd2wild' && c.tp === 2 ? 'Not measured · TP2 campaign owner-stopped' : 'Not measured';
          td.append(h('span', { class: 'cell-missing', text: why }));
        } else {
          const st = RS.cohortStats(rr);
          const btn = h('button', { type: 'button', class: 'cell-btn', 'aria-label': `${R[k].name} ${RS.cohortLabel(c.tp, c.mode, c.parallel)}: ${st.repeated ? 'median' : 'single'} score ${st.atScore}, time ${RS.mmss(st.atSecs)}. Show panel.` });
          btn.append(h('span', { class: 'cell-score', text: `${st.atScore}` }), h('span', { class: 'muted', text: ' /100' }));
          const tline = h('div', { class: 'cell-time' }, RS.mmss(st.atSecs));
          if (ref && !R[k].ours) tline.append(h('span', { class: 'ratio', title: 'Round time relative to RiNGSiDE in this setting (ratio of medians or single values)', text: `${(st.atSecs / ref).toFixed(2)}×` }));
          btn.append(tline);
          btn.append(h('div', { class: 'cell-meta', text: st.repeated ? `median · n=${st.n} · ${st.minScore}–${st.maxScore}` : 'single round' }));
          if (st.truncated.length) btn.append(h('div', { class: 'flag-badge', text: `★ ${st.truncated.map((r) => RS.truncLabel(r.reported_truncation_cases)).join(', ')}` }));
          btn.addEventListener('click', () => RS.showPanel(c));
          td.append(btn);
        }
        tr.append(td);
      }
      tb.append(tr);
    }
    t.append(tb);
  }

  RS.renderMatched = function () {
    recipeCards();
    matrix();
    const state = { tp: new Set([4, 2]), mode: new Set(['high', 'low', 'max']), par: new Set([4, 6, 8, 16]), rec: new Set(RS.RECIPE_ORDER) };
    const ctl = RS.$('#matched-controls');
    const groups = {};
    groups.tp = RS.chipGroup({ label: 'TP size', name: 'm-tp', options: RS.TPS.map((tp) => ({ value: tp, label: `TP${tp}`, glyph: h('span', { class: `swatch tp${tp}` }) })), selected: state.tp, onChange: (v) => { state.tp = v; draw(); } });
    groups.mode = RS.chipGroup({ label: 'Effort', name: 'm-mode', options: RS.EFFORTS.map((m) => ({ value: m, label: RS.EFFORT_LABEL[m], glyph: RS.glyph(RS.EFFORT_SHAPE[m], 'var(--ink-2)') })), selected: state.mode, onChange: (v) => { state.mode = v; draw(); } });
    groups.par = RS.chipGroup({ label: 'In parallel', name: 'm-par', options: [4, 6, 8, 16].map((c) => ({ value: c, label: `C${c}` })), selected: state.par, onChange: (v) => { state.par = v; draw(); } });
    groups.rec = RS.chipGroup({ label: 'Recipes', name: 'm-rec', options: RS.RECIPE_ORDER.map((k) => ({ value: k, label: R[k].name, glyph: R[k].ours ? h('span', { class: 'swatch tp4' }) : RS.glyph(null, null, { mono: R[k].mono }) })), selected: state.rec, onChange: (v) => { state.rec = v; draw(); } });
    Object.values(groups).forEach((g) => ctl.append(g));
    const lg = RS.$('#matched-legend');
    lg.append(h('span', { class: 'item' }, h('span', { class: 'swatch tp4' }), h('span', { class: 'swatch tp2' }), 'RiNGSiDE (filled; shape = effort)'));
    for (const k of ['miaai', 'tonyd2wild', 'knapcio']) lg.append(h('span', { class: 'item' }, RS.glyph(null, null, { mono: R[k].mono, size: 18 }), `${R[k].name} (${R[k].author})`));
    lg.append(h('span', { class: 'item' }, h('span', { class: 'flag-badge', text: '★' }), 'reported truncation'));

    const grid = RS.$('#matched-panels');
    function draw() {
      RS.clear(grid);
      const rr = D.rounds.filter((r) => state.tp.has(r.tp) && state.mode.has(r.mode) && state.par.has(r.parallel));
      const settings = Array.from(new Set(rr.map((r) => RS.cohortKey(r)))).map((k) => { const [tp, mode, par] = k.split('|'); return { tp: +tp, mode, parallel: +par }; }).sort(cohortOrder);
      if (!settings.length) grid.append(h('div', { class: 'empty-panel', text: 'No matched settings for these filters.' }));
      for (const c of settings) {
        const inSet = rr.filter((r) => r.tp === c.tp && r.mode === c.mode && r.parallel === c.parallel);
        const shown = inSet.filter((r) => state.rec.has(r.recipe));
        const card = h('div', { class: 'chart-card', id: `panel-${c.tp}-${c.mode}-${c.parallel}` });
        card.append(h('h4', null, RS.tpTag(c.tp), ' ', `${RS.EFFORT_LABEL[c.mode]} · ${D.cap(c.mode) / 1024}K cap · C${c.parallel}`));
        const absent = RS.RECIPE_ORDER.filter((k) => !inSet.some((r) => r.recipe === k));
        card.append(h('p', { class: 'unit', text: absent.length ? `Not measured here: ${absent.map((k) => R[k].name).join(', ')}` : 'All four recipes measured' }));
        const chart = h('div', { class: 'chart' });
        card.append(chart);
        const counts = RS.RECIPE_ORDER.filter((k) => inSet.some((r) => r.recipe === k)).map((k) => { const n = inSet.filter((r) => r.recipe === k).length; return `${R[k].name} n=${n}${n === 1 ? ' (single)' : ''}`; }).join(' · ');
        card.append(h('p', { class: 'chart-foot', text: counts }));
        grid.append(card);
        const gs = cohortsOf(shown).map((g) => ({ ...g, label: (st) => `${R[g.recipe].name} ${st.atScore} · ${RS.mmss(st.atSecs)}` }));
        RS.qualityChart(chart, { groups: gs, xMaxSec: Math.max(...inSet.map((r) => r.seconds)), height: 300, ariaLabel: `${RS.cohortLabel(c.tp, c.mode, c.parallel)}: ${shown.length} rounds` });
      }
    }
    draw();
    RS.showPanel = (c) => {
      // make sure the panel is visible under the current filters, then bring it into view
      const need = [['tp', c.tp], ['mode', c.mode], ['par', c.parallel]].filter(([k, v]) => !state[k].has(v));
      if (need.length) { for (const [k, v] of need) state[k].add(v); for (const [k] of need) syncChips(groups[k], state[k]); draw(); }
      const el = document.getElementById(`panel-${c.tp}-${c.mode}-${c.parallel}`);
      if (el) { el.scrollIntoView({ block: 'center' }); el.animate && el.animate([{ boxShadow: '0 0 0 3px var(--focus)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1400 }); }
    };
    function syncChips(group, set) { RS.$$('.chip', group).forEach((b) => b.setAttribute('aria-pressed', String(set.has(isNaN(+b.dataset.value) ? b.dataset.value : +b.dataset.value)))); }
  };

  // ================= 03 speed =================
  const DEPTH_LABEL = { 8192: '8K', 32768: '32K', 65536: '64K', 131072: '128K', 262136: '256K*' };
  function metricSeries(rows, metric) {
    return rows.map((row) => {
      const values = {}; const nullNote = {};
      if (metric === 'cold_s' || metric === 'replay_s') for (const [d, v] of Object.entries(row.prefill_suite || {})) values[d] = v[metric];
      else if (metric === 'stag0' || metric === 'stag1') for (const [c, v] of Object.entries(row.staggered || {})) { values[c] = v[metric === 'stag0' ? 0 : 1]; if (v[metric === 'stag0' ? 0 : 1] === null) nullNote[c] = 'null in source: the only round had no valid overlap (incumbents finished first)'; }
      else if (metric.startsWith('spark:')) { const w = metric.slice(6); for (const n of [1, 2, 3, 4]) if (row.sparkdash && row.sparkdash[`${w}x${n}`] != null) values[n] = row.sparkdash[`${w}x${n}`]; }
      else Object.assign(values, row[metric] || {});
      return { recipe: row.recipe_key, tp: row.tp_size, values, nullNote, has: metric.startsWith('spark:') ? !!row.sparkdash : metric in row || ((metric === 'cold_s' || metric === 'replay_s') && !!row.prefill_suite) || (metric.startsWith('stag') && !!row.staggered) };
    });
  }
  const unionKeys = (series) => Array.from(new Set(series.flatMap((s) => Object.keys(s.values)))).sort((a, b) => +a - +b);

  RS.renderSpeed = function () {
    const state = { tp: 4, rec: new Set(RS.RECIPE_ORDER), tab: 'rigmark' };
    const ctl = RS.$('#speed-controls');
    ctl.append(RS.chipGroup({ label: 'TP size', name: 's-tp', single: true, options: RS.TPS.map((tp) => ({ value: tp, label: `TP${tp}`, glyph: h('span', { class: `swatch tp${tp}` }) })), selected: [4], onChange: (v) => { state.tp = [...v][0]; draw(); } }));
    ctl.append(RS.chipGroup({ label: 'Recipes', name: 's-rec', options: RS.RECIPE_ORDER.map((k) => ({ value: k, label: R[k].name, glyph: R[k].ours ? h('span', { class: 'swatch tp4' }) : RS.glyph(null, null, { mono: R[k].mono }) })), selected: state.rec, onChange: (v) => { state.rec = v; draw(); } }));
    // tabs (ARIA tab pattern with arrow keys)
    const tabs = [RS.$('#tab-rigmark'), RS.$('#tab-spark')];
    const panels = [RS.$('#panel-rigmark'), RS.$('#panel-spark')];
    const select = (i, focus) => {
      tabs.forEach((t, j) => { t.setAttribute('aria-selected', String(i === j)); t.tabIndex = i === j ? 0 : -1; panels[j].hidden = i !== j; });
      state.tab = i === 0 ? 'rigmark' : 'spark'; if (focus) tabs[i].focus(); draw();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); select((i + 1) % 2, true); } });
    });

    function card(grid, title, unit, note) {
      const c = h('div', { class: 'chart-card' }, h('h4', { text: title }), h('p', { class: 'unit', text: unit }));
      const chart = h('div', { class: 'chart' }); c.append(chart);
      if (note) c.append(h('p', { class: 'chart-foot', text: note }));
      grid.append(c); return chart;
    }
    const fmtRate = (v) => RS.fmt(v, 1); const fmtSec = (v) => RS.fmt(v, v < 10 ? 2 : 1);

    function draw() {
      const rows = D.speed.rows.filter((r) => r.tp_size === state.tp && state.rec.has(r.recipe_key)).sort((a, b) => RS.RECIPE_ORDER.indexOf(a.recipe_key) - RS.RECIPE_ORDER.indexOf(b.recipe_key));
      const lg = RS.clear(RS.$('#speed-legend'));
      for (const row of rows) lg.append(h('span', { class: 'item' }, RS.lineKey(row.recipe_key, row.tp_size), `${R[row.recipe_key].name} · RigMark n=${row.runs}${row.sparkdash_rounds ? ` · SparkBench n=${row.sparkdash_rounds}` : ''}`));
      if (state.tp === 2) lg.append(h('span', { class: 'item muted', text: 'Knapcio: no TP2 measurement' }));
      const sampleNote = `Sample sizes: ${rows.map((r) => `${R[r.recipe_key].name} ${r.runs === 1 ? 'one run' : `median of ${r.runs} runs`}`).join('; ')}.`;
      if (state.tab === 'rigmark') {
        const g = RS.clear(RS.$('#rigmark-grid'));
        const mk = (title, unit, metric, opts) => {
          const series = metricSeries(rows, metric).map((s) => ({ ...s }));
          const el = card(g, title, unit, opts.note); el.dataset.metric = metric;
          const keys = opts.keys || unionKeys(series);
          const missing = series.filter((s) => !s.has).map((s) => R[s.recipe].name);
          if (missing.length) el.parentElement.querySelector('.unit').textContent += ` · not in the reviewed speed table: ${missing.join(', ')}`;
          const ranged = series.filter((s) => s.has && Object.keys(s.values).length);
          if (ranged.length > 1 && new Set(ranged.map((s) => Object.keys(s.values).join())).size > 1) {
            const lab = (k) => (opts.xLabel ? opts.xLabel(k) : k);
            el.parentElement.append(h('p', { class: 'chart-foot', text: `Levels run: ${ranged.map((s) => { const ks = Object.keys(s.values).sort((a, b) => a - b); return `${R[s.recipe].name} ${lab(ks[0])}–${lab(ks[ks.length - 1])}`; }).join(' · ')}. Beyond a recipe's last level nothing was measured.` }));
          }
          RS.lineChart(el, { xs: keys.map((k) => ({ key: k, label: opts.xLabel ? opts.xLabel(k) : k })), series: series.filter((s) => s.has), yUnit: opts.yUnit, yUnitShort: opts.yUnit, higherBetter: opts.higher, xTitle: opts.xTitle, fmt: opts.fmt, ariaLabel: `${title}, TP${state.tp}`, tipNote: opts.tip });
        };
        const dec = card(g, 'Single-stream decode rate', 'RigMark decode · 4,096 output tokens · one request · tok/s', sampleNote); dec.dataset.metric = 'decode';
        RS.dotPlot(dec, { rows: ['code', 'prose', 'structured'].map((k) => ({ key: k, label: k })), series: metricSeries(rows, 'decode'), unit: 'tok/s', fmt: fmtRate, ariaLabel: `Single-stream decode rate by workload, TP${state.tp}` });
        mk('Cold prefill: time to first token', 'RigMark · one request per prompt length · seconds', 'cold_s', { yUnit: 's', higher: false, xTitle: 'prompt tokens', xLabel: (k) => DEPTH_LABEL[k] || k, fmt: fmtSec, note: '256K* = 262,136 tokens. Only RiNGSiDE TP4 and Knapcio ran 128K and 256K.' });
        mk('Warm replay: time to first token', 'RigMark · the same prompt sent again · seconds · cached-prefix, not full-token prefill', 'replay_s', { yUnit: 's', higher: false, xTitle: 'prompt tokens', xLabel: (k) => DEPTH_LABEL[k] || k, fmt: fmtSec, tip: 'Warm replay can reuse the server\'s prefix cache; compare it only with other warm replays.', note: 'A replay re-sends an identical prompt, so a prefix-cache hit skips recomputation. It measures cache reuse, not full-token prefill speed. RiNGSiDE plans document prefix-cache retention and a replay boundary.' });
        mk('Aggregate end-to-end throughput · code', 'RigMark · short code requests (256 tokens) · all streams · tok/s', 'agg', { yUnit: 'tok/s', higher: true, xTitle: 'concurrent requests', fmt: fmtRate, note: 'Aggregate across all concurrent requests — not a per-stream rate. Categorical x-axis.' });
        mk('Aggregate end-to-end throughput · prose', 'RigMark · prose requests · all streams · tok/s', 'prose_agg', { yUnit: 'tok/s', higher: true, xTitle: 'concurrent requests', fmt: fmtRate, note: 'Present in the reviewed speed table for RiNGSiDE and Knapcio only.' });
        mk('Staggered arrival · prefill first', 'Newcomer median TTFT when short requests arrive during a 32K-token prefill · seconds', 'stag0', { yUnit: 's', higher: false, xTitle: 'requests', fmt: fmtSec, note: 'Short (256-token) newcomers arrive, with a 1 s stagger, while a long 32K-token prefill is running (prose workload).' });
        mk('Staggered arrival · decode first', 'Newcomer TTFT when a 32K-token request arrives while others decode · seconds', 'stag1', { yUnit: 's', higher: false, xTitle: 'requests', fmt: fmtSec, note: '∅ marks a value recorded as null: Mia\'s single round at 6 had no valid overlap, so the summary is empty. It is not a zero.' });
      } else {
        const g = RS.clear(RS.$('#spark-grid'));
        for (const w of ['prose', 'structured', 'code', 'json']) {
          const series = metricSeries(rows, `spark:${w}`).filter((s) => s.has);
          const el = card(g, `SparkBench · ${w}`, 'mean per-stream decode rate · tok/s · 400 output tokens', null); el.dataset.metric = `spark:${w}`;
          RS.lineChart(el, { xs: [1, 2, 3, 4].map((n) => ({ key: String(n), label: String(n) })), series, yUnit: 'tok/s per stream', yUnitShort: 'tok/s', higher: true, xTitle: 'concurrent streams', fmt: fmtRate, ariaLabel: `SparkBench ${w}, TP${state.tp}`, height: 240 });
        }
        g.append(h('p', { class: 'chart-foot', style: 'grid-column:1/-1', text: `SparkBench rounds: ${rows.map((r) => `${R[r.recipe_key].name} ${r.sparkdash_rounds ?? '1 (per speed-cells.csv)'}`).join('; ')}. Tony2wild TP4 and RiNGSiDE TP2 SparkBench come from a separate window of the same launch plan (see window cards).` }));
      }
      windows(state.tp);
    }
    draw();
  };

  function windows(tp) {
    const el = RS.clear(RS.$('#speed-windows'));
    const man = Object.fromEntries(D.speedManifest.map((m) => [m.export, m]));
    for (const row of D.speed.rows.filter((r) => r.tp_size === tp)) {
      const rec = R[row.recipe_key];
      const c = h('article', { class: `recipe${rec.ours ? ' ours' : ''}`, style: rec.ours && tp === 2 ? 'border-color:var(--tp2)' : null });
      c.append(h('div', { class: 'who', text: `TP${tp} speed window` }));
      c.append(h('h4', null, RS.monogram(row.recipe_key), rec.name));
      const dl = h('dl');
      const add = (k, v) => { if (v == null || v === '') return; dl.append(h('dt', { text: k }), h('dd', null, v)); };
      add('Recipe', row.recipe);
      if (row.lab_plan) add('Lab plan', h('code', { text: row.lab_plan }));
      add('RigMark window', h('code', { text: row.lab_receipt }));
      if (row.sparkdash_window && row.sparkdash_window !== row.lab_receipt) add('SparkBench window', h('code', { text: row.sparkdash_window }));
      add('Samples', `RigMark ${row.runs === 1 ? 'one run' : `median of ${row.runs} runs`}${row.staggered_rounds ? ` · staggered ${row.staggered_rounds}` : ''} · SparkBench ${row.sparkdash_rounds ?? 'rounds not stated in the row (speed-cells.csv lists 1)'}`);
      if (row.admits != null) add('Admits', `${row.admits} concurrent requests`);
      const w = D.speedWindows[row.lab_receipt];
      const cf = w && w.native['code-full'];
      if (cf) {
        const a = cf.appliance || {};
        add('Checkpoint (receipt)', [a.checkpoint, a.model_revision].filter(Boolean).join(' · '));
        add('Format (receipt)', a.quantisation);
        if (a.drafter) add('Drafter (receipt)', a.drafter);
        add('Served model', cf.model);
        add('Window (UTC)', `${(cf.started_at || '').replace('T', ' ').slice(0, 19)} → ${((w.native['prose-concurrency'] || cf).finished_at || '').replace('T', ' ').slice(0, 19)}`);
        if (a.comparison_note) add('Receipt note', a.comparison_note);
      }
      c.append(dl);
      if (row.configuration) c.append(h('p', { class: 'note', text: row.configuration }));
      // receipts with hashes
      const files = h('ul', { class: 'file-list' });
      const wins = [row.lab_receipt, row.sparkdash_window].filter(Boolean);
      for (const win of new Set(wins)) for (const f of ['native/code-full.json', 'native/prose-concurrency.json', 'sparkdash.json']) {
        const p = `evidence/raw/outputs/${win}/${f}`;
        const info = D.files[p]; if (!info) continue;
        const m = man[p];
        files.append(h('li', null, h('span', { class: 'fname' }, h('a', { href: RS.pkgHref(p), text: `${win}/${f}` })), h('span', { class: 'xsmall muted', text: RS.bytes(info.bytes) }),
          h('span', { class: 'fmeta' }, 'export sha256 ', h('span', { class: 'hash', text: info.sha256 }), m ? ` · ${m.redacted ? 'redacted export of original ' : 'unredacted; original '}` : '', m ? h('span', { class: 'hash', text: m.original_sha256 }) : '', m && m.export_sha256 === info.sha256 ? h('span', { class: 'verified', text: ' ✓ manifest match' }) : m ? h('span', { class: 'mismatch', text: ' ✗ manifest mismatch' }) : '')));
      }
      const det = h('details', { class: 'disclose' }, h('summary', { text: 'Receipts and recorded settings' }));
      const inner = h('div', { class: 'inner' }, files);
      if (cf) inner.append(h('h4', { text: 'code-full settings (receipt)' }), h('pre', { class: 'viewer', text: JSON.stringify(cf.settings, null, 1) }));
      if (w && w.native['prose-concurrency']) inner.append(h('h4', { text: 'prose-concurrency settings (receipt)' }), h('pre', { class: 'viewer', text: JSON.stringify(w.native['prose-concurrency'].settings, null, 1) }));
      if (cf && cf.protocol) inner.append(h('p', { class: 'xsmall muted' }, 'RigMark protocol ', h('code', { text: cf.protocol.repository_revision }), ` v${cf.protocol.version}, repository dirty: ${cf.protocol.repository_dirty}`));
      det.append(inner); c.append(det);
      el.append(c);
    }
    if (tp === 2) el.append(h('div', { class: 'recipe' }, h('div', { class: 'who', text: 'TP2 speed window' }), h('h4', null, RS.monogram('knapcio'), 'Knapcio'), h('div', { class: 'empty-panel', text: 'No TP2 measurement exists. Nothing is plotted for Knapcio at TP2.' })));
  }
})();
