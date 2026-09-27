/* RiNGSiDE benchmark review — section 04: integrity checks, run inspector, tables, appendices, downloads. */
(function () {
  'use strict';
  const RS = window.RS; const D = RS.data; const { h } = RS;
  const R = RS.RECIPES;
  const ids = (cases) => (Array.isArray(cases) ? cases.map((c) => (typeof c === 'string' ? c : c.scenario)) : String(cases).match(/TC-\d+/g) || []).join(',');

  // ================= integrity: recomputed in the browser from the verbatim sources =================
  RS.checks = function () {
    const out = [];
    const add = (label, pass, detail) => out.push({ label, pass, detail });
    const rounds = D.rounds;
    const ours = rounds.filter((r) => r.recipe === 'ringside');
    add('Main tool-eval rounds', rounds.length === 60, `${rounds.length} completed temperature-zero, 92-case rounds`);
    add('RiNGSiDE rounds', ours.length === 23 && ours.filter((r) => r.tp === 4).length === 13 && ours.filter((r) => r.tp === 2).length === 10, `${ours.length} (${ours.filter((r) => r.tp === 4).length} TP4, ${ours.filter((r) => r.tp === 2).length} TP2)`);
    add('Every round is a 92-scenario round', rounds.every((r) => r.scenarios === 92 && r.max_points === 184), '92 scenarios, 184 points available in each');
    // CSV ↔ JSON
    let csvOk = 0; const csvBad = [];
    const byRun = new Map(rounds.map((r) => [r.run_id, r]));
    for (const c of D.roundsCsv) {
      const r = byRun.get(c.run_id);
      const ok = r && c.recipe === r.recipe && +c.tp === r.tp && c.mode === r.mode && +c.parallel === r.parallel && +c.round === r.round && +c.score === r.score && +c.seconds === r.seconds && ids(c.reported_truncation_cases) === ids(r.reported_truncation_cases);
      if (ok) csvOk++; else csvBad.push(c.run_id);
    }
    add('tool-eval-rounds.csv matches the JSON', csvOk === rounds.length && D.roundsCsv.length === rounds.length, `${csvOk}/${rounds.length} rows identical in recipe, TP, effort, concurrency, round, score, seconds, run id and truncation${csvBad.length ? ' · mismatches: ' + csvBad.join(', ') : ''}`);
    // 37-round snapshot
    const b = D.baseline37.rounds; const byRid = new Map(rounds.map((r) => [r.run_id, r]));
    const same = b.filter((x) => { const r = byRid.get(x.run_id); return r && JSON.stringify(x) === JSON.stringify(r); }).length;
    const bOurs = b.filter((x) => x.recipe === 'ringside').length; const bMia = b.filter((x) => x.recipe === 'miaai').length;
    add('Earlier 37-round snapshot', b.length === 37 && bOurs === 23 && bMia === 14 && same === 37, `${b.length} rounds = ${bOurs} RiNGSiDE + ${bMia} Mia; ${same}/37 identical to the same run in the 60-round file`);
    // receipt hashes
    let rh = 0; const rhBad = [];
    for (const r of rounds) { const f = D.files[`bench/results/${r.receipt.folder}/result.json`]; if (f && f.sha256 === r.receipt.result_sha256) rh++; else rhBad.push(r.id); }
    add('Round receipts match their recorded hash', rh === rounds.length, `${rh}/${rounds.length} result.json exports match receipt.result_sha256${rhBad.length ? ' · ' + rhBad.join(', ') : ''}`);
    let mm = 0; let mt = 0;
    for (const m of D.receiptManifest.files) { mt++; const f = D.files[`bench/results/tool-eval-logs/${m.export}`]; if (f && f.sha256 === m.export_sha256) mm++; }
    add('Tool-eval receipt manifest', mm === mt, `${mm}/${mt} exported files match manifest export_sha256`);
    let sm = 0;
    for (const m of D.speedManifest) { const f = D.files[m.export]; if (f && f.sha256 === m.export_sha256) sm++; }
    add('Speed and sampled receipt manifest', sm === D.speedManifest.length, `${sm}/${D.speedManifest.length} exported files match export_sha256`);
    // speed cells CSV ↔ JSON
    const rowsBy = new Map(D.speed.rows.map((r) => [`${r.recipe_key}|${r.tp_size}|${r.lab_receipt}`, r]));
    let cOk = 0; const cBad = [];
    for (const c of D.speedCsv) {
      const row = rowsBy.get(`${c.recipe}|${c.tp}|${c.window}`); let v;
      if (!row) { cBad.push(c); continue; }
      if (['decode', 'agg', 'prose_agg', 'sparkdash'].includes(c.metric)) v = (row[c.metric] || {})[c.cell];
      else if (c.metric === 'cold_s' || c.metric === 'replay_s') v = ((row.prefill_suite || {})[c.cell] || {})[c.metric];
      else v = ((row.staggered || {})[c.cell] || [])[c.metric === 'prefill_first_ttft_s' ? 0 : 1];
      const csvV = c.value === '' ? null : +c.value;
      if ((v ?? null) === csvV) cOk++; else cBad.push(c);
    }
    add('speed-cells.csv matches speed-evidence.json', cOk === D.speedCsv.length, `${cOk}/${D.speedCsv.length} cells identical; ${D.speedCsv.filter((c) => c.value === '').length} recorded empty (kept empty, not zero)`);
    const trunc = rounds.filter((r) => r.reported_truncation_cases.length);
    add('Reported truncations preserved', trunc.length === 4, trunc.map((r) => `${r.id}: ${RS.truncLabel(r.reported_truncation_cases)}`).join(' · '));
    add('Knapcio TP2', !rounds.some((r) => r.recipe === 'knapcio' && r.tp === 2) && !D.speed.rows.some((r) => r.recipe_key === 'knapcio' && r.tp_size === 2), 'no TP2 quality or speed measurement exists; none is drawn');
    return out;
  };

  function integrity() {
    const el = RS.$('#integrity');
    const checks = RS.checks();
    const passed = checks.filter((c) => c.pass).length;
    el.append(h('h3', { style: 'margin-top:0', text: `Snapshot integrity · ${passed}/${checks.length} checks pass in this browser` }));
    el.append(h('p', { class: 'small muted' }, `At build time every one of the ${D.verified.sha256sums_files} files listed in benchmark-package/SHA256SUMS matched its hash (SHA256SUMS itself: `, h('span', { class: 'hash', text: D.verified.sha256sums_sha256 }), '). The checks below re-run on every page load against the embedded original files.'));
    const ul = h('ul', { class: 'file-list' });
    for (const c of checks) ul.append(h('li', null, h('span', null, h('span', { class: c.pass ? 'verified' : 'mismatch', text: c.pass ? '✓ ' : '✗ ' }), h('strong', { text: c.label })), h('span', { class: 'xsmall muted', text: c.pass ? 'pass' : 'FAIL' }), h('span', { class: 'fmeta', text: c.detail })));
    el.append(ul);
    const btn = h('button', { class: 'btn', type: 'button', text: 'Re-hash all receipts in this browser' });
    const status = h('span', { class: 'small muted', 'aria-live': 'polite' });
    btn.addEventListener('click', async () => {
      if (location.protocol === 'file:' || !window.crypto || !crypto.subtle) { status.textContent = 'Needs the local server (node site/scripts/serve.mjs); browsers block file:// fetches.'; return; }
      btn.disabled = true; let ok = 0, bad = 0, n = 0; const entries = Object.entries(D.files);
      for (const [p, info] of entries) {
        try {
          const buf = await (await fetch(RS.pkgHref(p))).arrayBuffer();
          const hex = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf))).map((b) => b.toString(16).padStart(2, '0')).join('');
          hex === info.sha256 ? ok++ : bad++;
        } catch (e) { bad++; }
        n++; if (n % 10 === 0) status.textContent = `${n}/${entries.length} hashed…`;
      }
      status.innerHTML = ''; status.append(h('span', { class: bad ? 'mismatch' : 'verified', text: `${ok}/${entries.length} receipt files match the build inventory${bad ? `; ${bad} differ or failed to load` : ''}.` }));
      btn.disabled = false;
    });
    el.append(h('div', { class: 'btn-row' }, btn, status));
  }

  // ================= identities & settings =================
  function identities() {
    const t = RS.$('#identities');
    const cols = ['recipe', 'tp', 'tool_eval_source', 'speed_source', 'checkpoint_note'];
    t.append(h('thead', null, h('tr', null, ...['Recipe', 'TP', 'Tool-eval source', 'Speed source', 'Checkpoint note'].map((c) => h('th', { scope: 'col', text: c })))));
    const tb = h('tbody');
    for (const r of D.identities.rows) {
      const ours = r.recipe === 'RiNGSiDE';
      const tr = h('tr', { class: ours ? `ours tp${r.tp.slice(2)}` : null });
      for (const c of cols) {
        const v = r[c];
        const diff = (c === 'speed_source' && r.speed_source !== r.tool_eval_source);
        tr.append(h('td', { class: c.includes('source') ? 'wrap' : c === 'checkpoint_note' ? 'wrap' : null }, c.includes('source') ? h('span', { class: 'hash', text: v }) : v, diff ? h('span', { class: 'tag warn', style: 'margin-left:6px', title: 'Quality and speed used different sources', text: 'differs' }) : ''));
      }
      tb.append(tr);
    }
    t.append(tb);
    t.parentElement.after(h('p', { class: 'small muted' }, 'Tool-eval suite commit ', h('span', { class: 'hash', text: D.identities.tool_eval_commit }), '. Lab plan hashes identify launch plans, not Git commits.'));
  }

  function settingsKV() {
    const s = D.settings; const b = D.toolEval.benchmark;
    const kv = RS.$('#settings-kv');
    const add = (k, v) => kv.append(h('dt', { text: k }), h('dd', null, v));
    add('Benchmark', `${b.repository} ${b.version} (commit `); kv.lastChild.append(h('span', { class: 'hash', text: b.commit }), ')');
    add('Suite', `${b.scenarios} scenarios: ${b.suite}; ${b.trials_per_round} trial per round`);
    add('Sampling', `temperature ${s.temperature} · seed ${s.seed} · top_p ${s.top_p} · top_k ${s.top_k} · min_p ${s.min_p} · repetition penalty ${s.repetition_penalty}`);
    add('Thinking', `enabled (${s.thinking}); effort via chat_template_kwargs.reasoning_effort`);
    add('Output cap per turn', Object.entries(s.output_tokens).map(([k, v]) => `${RS.EFFORT_LABEL[k]} ${v.toLocaleString('en-US')}`).join(' · '));
    add('Turns and timeout', `max ${s.max_turns} turns · ${s.timeout_seconds} s per request`);
    add('Scenarios in parallel', `${s.parallel} for the comparison cohorts; 6, 8 and 16 in separate cohorts`);
    add('Reference date', s.reference_date);
    add('Round time', s.round_time);
    add('Snapshot', `reviewed ${D.toolEval.snapshot.reviewed} (UTC${D.toolEval.snapshot.utc_offset}) · status ${D.toolEval.status}`);
    add('Limits', D.toolEval.limits);
  }

  // ================= generic progressive table =================
  function progressiveTable({ table, status, columns, rows, rowClass, empty }) {
    let sortKey = null, sortDir = 1, token = 0;
    const thead = h('thead'); const tb = h('tbody');
    const trh = h('tr');
    for (const c of columns) {
      const th = h('th', { scope: 'col', 'aria-sort': 'none' });
      if (c.sort) {
        const b = h('button', { type: 'button', text: c.label });
        b.addEventListener('click', () => { sortDir = sortKey === c.key ? -sortDir : 1; sortKey = c.key; RS.$$('th', trh).forEach((x) => x.setAttribute('aria-sort', 'none')); th.setAttribute('aria-sort', sortDir > 0 ? 'ascending' : 'descending'); render(current); });
        th.append(b);
      } else th.textContent = c.label;
      trh.append(th);
    }
    thead.append(trh); table.append(thead, tb);
    let current = rows;
    function render(list) {
      current = list; const my = ++token;
      let data = list.slice();
      if (sortKey) { const c = columns.find((x) => x.key === sortKey); data.sort((a, b) => { const va = c.sort(a), vb = c.sort(b); return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir; }); }
      RS.clear(tb);
      if (!data.length) { tb.append(h('tr', null, h('td', { colspan: columns.length, class: 'muted', text: empty || 'No rows match.' }))); status.textContent = '0 rows'; return; }
      let i = 0; const CH = 40;
      const step = () => {
        if (my !== token) return;
        const frag = document.createDocumentFragment();
        for (const row of data.slice(i, i + CH)) {
          const tr = h('tr', { class: rowClass ? rowClass(row) : null });
          for (const c of columns) { const td = h('td', { class: c.cls || null }); const v = c.cell(row); td.append(v instanceof Node ? v : document.createTextNode(v == null ? '' : String(v))); tr.append(td); }
          frag.append(tr);
        }
        tb.append(frag); i += CH;
        status.textContent = i < data.length ? `Showing ${i} of ${data.length} rows…` : `${data.length} of ${rows.length} rows`;
        if (i < data.length) requestAnimationFrame(step);
      };
      step();
    }
    render(rows);
    return { render, get view() { return current; } };
  }

  // ================= all runs =================
  function runsTable() {
    const state = { rec: new Set(RS.RECIPE_ORDER), tp: new Set([4, 2]), mode: new Set(RS.EFFORTS), q: '' };
    const ctl = RS.$('#runs-controls');
    const files = (r) => {
      const wrap = h('span');
      for (const f of ['result.json', 'report-1.md', 'console.log', 'receipt.json']) {
        const p = `bench/results/${r.receipt.folder}/${f}`;
        if (D.files[p]) wrap.append(h('a', { href: RS.pkgHref(p), text: f.replace('.json', '').replace('-1.md', '').replace('.log', '') }), ' ');
        else if (f === 'console.log') wrap.append(h('span', { class: 'muted', title: 'Not in the exported receipt folder', text: 'no console ' }));
      }
      return wrap;
    };
    const cols = [
      { key: 'recipe', label: 'Recipe', sort: (r) => RS.RECIPE_ORDER.indexOf(r.recipe), cell: (r) => h('span', null, RS.monogram(r.recipe), ' ', R[r.recipe].name) },
      { key: 'tp', label: 'TP', sort: (r) => r.tp, cell: (r) => RS.tpTag(r.tp) },
      { key: 'mode', label: 'Effort', sort: (r) => RS.EFFORTS.indexOf(r.mode), cell: (r) => RS.EFFORT_LABEL[r.mode] },
      { key: 'cap', label: 'Cap', sort: (r) => D.cap(r.mode), cell: (r) => D.cap(r.mode).toLocaleString('en-US'), cls: 'num' },
      { key: 'parallel', label: 'C', sort: (r) => r.parallel, cell: (r) => `C${r.parallel}`, cls: 'num' },
      { key: 'round', label: 'Round', sort: (r) => r.round, cell: (r) => r.round, cls: 'num' },
      { key: 'score', label: 'Score', sort: (r) => r.score, cell: (r) => h('strong', { text: String(r.score) }), cls: 'num' },
      { key: 'points', label: 'Points', sort: (r) => r.points, cell: (r) => `${r.points}/${r.max_points}`, cls: 'num' },
      { key: 'ppf', label: 'Pass · partial · fail', cell: (r) => `${r.passed} · ${r.partial} · ${r.failed}`, cls: 'num' },
      { key: 'time', label: 'Round time', sort: (r) => r.seconds, cell: (r) => RS.mmss(r.seconds), cls: 'num' },
      { key: 'seconds', label: 'Seconds (as stored)', sort: (r) => r.seconds, cell: (r) => String(r.seconds), cls: 'num' },
      { key: 'trunc', label: 'Truncation reported', sort: (r) => r.reported_truncation_cases.length, cell: (r) => (r.reported_truncation_cases.length ? h('span', { class: 'flag-badge', text: `★ ${RS.truncLabel(r.reported_truncation_cases)}` }) : h('span', { class: 'muted', text: 'none' })) },
      { key: 'started', label: 'Started (UTC+7)', sort: (r) => r.started || r.run_id, cell: (r) => r.started || h('span', { class: 'muted', title: 'Not in the summary file; the run id carries the UTC start', text: 'see run id' }) },
      { key: 'run_id', label: 'Run id', sort: (r) => r.run_id, cell: (r) => h('span', { class: 'hash', text: r.run_id }) },
      { key: 'files', label: 'Receipt', cell: files },
      { key: 'inspect', label: '', cell: (r) => h('button', { class: 'btn', type: 'button', onclick: () => RS.openRun(r.id), 'aria-label': `Inspect ${r.id}`, text: 'Inspect' }) },
    ];
    const tbl = progressiveTable({ table: RS.$('#runs-table'), status: RS.$('#runs-status'), columns: cols, rows: D.rounds, rowClass: (r) => (r.recipe === 'ringside' ? `ours tp${r.tp}` : null) });
    const apply = () => tbl.render(D.rounds.filter((r) => state.rec.has(r.recipe) && state.tp.has(r.tp) && state.mode.has(r.mode) && (!state.q || `${r.id} ${r.run_id} ${R[r.recipe].name}`.toLowerCase().includes(state.q))));
    ctl.append(RS.chipGroup({ label: 'Recipe', name: 't-rec', options: RS.RECIPE_ORDER.map((k) => ({ value: k, label: R[k].name })), selected: state.rec, onChange: (v) => { state.rec = v; apply(); } }));
    ctl.append(RS.chipGroup({ label: 'TP', name: 't-tp', options: RS.TPS.map((tp) => ({ value: tp, label: `TP${tp}` })), selected: state.tp, onChange: (v) => { state.tp = v; apply(); } }));
    ctl.append(RS.chipGroup({ label: 'Effort', name: 't-mode', options: RS.EFFORTS.map((m) => ({ value: m, label: RS.EFFORT_LABEL[m] })), selected: state.mode, onChange: (v) => { state.mode = v; apply(); } }));
    const q = h('input', { type: 'search', placeholder: 'Search run id…', 'aria-label': 'Search rounds by id or run id' });
    q.addEventListener('input', () => { state.q = q.value.trim().toLowerCase(); apply(); });
    ctl.append(q);
    ctl.append(h('button', { class: 'btn', type: 'button', text: 'Download this view (CSV)', onclick: () => {
      const rows = tbl.view.map((r) => ({ ...r, cap: D.cap(r.mode), reported_truncation_cases: RS.truncLabel(r.reported_truncation_cases), receipt_folder: r.receipt.folder, result_sha256: r.receipt.result_sha256, source_path: r.source.path, source_sha256: r.source.sha256 }));
      RS.download('ringside-review-rounds-view.csv', RS.toCSV(rows, ['id', 'recipe', 'tp', 'mode', 'cap', 'parallel', 'round', 'score', 'points', 'max_points', 'passed', 'partial', 'failed', 'seconds', 'started', 'finished', 'run_id', 'reported_truncation_cases', 'receipt_folder', 'result_sha256', 'source_path', 'source_sha256']));
    } }));
  }

  // ================= speed cells =================
  function cellsTable() {
    const state = { rec: new Set(RS.RECIPE_ORDER), tp: new Set([4, 2]), metric: 'all' };
    const ctl = RS.$('#cells-controls');
    const label = { decode: 'RigMark decode (tok/s)', agg: 'RigMark aggregate · code (tok/s)', prose_agg: 'RigMark aggregate · prose (tok/s)', cold_s: 'RigMark cold TTFT (s)', replay_s: 'RigMark warm replay TTFT (s)', prefill_first_ttft_s: 'Staggered · prefill first (s)', decode_first_ttft_s: 'Staggered · decode first (s)', sparkdash: 'SparkBench per-stream (tok/s)' };
    const cols = [
      { key: 'recipe', label: 'Recipe', sort: (c) => RS.RECIPE_ORDER.indexOf(c.recipe), cell: (c) => R[c.recipe] ? R[c.recipe].name : c.recipe },
      { key: 'tp', label: 'TP', sort: (c) => +c.tp, cell: (c) => `TP${c.tp}` },
      { key: 'metric', label: 'Metric', sort: (c) => c.metric, cell: (c) => label[c.metric] || c.metric },
      { key: 'cell', label: 'Cell', sort: (c) => (isNaN(+c.cell) ? c.cell : +c.cell), cell: (c) => c.cell },
      { key: 'value', label: 'Value (as stored)', sort: (c) => (c.value === '' ? -1 : +c.value), cell: (c) => (c.value === '' ? h('span', { class: 'muted', text: 'empty (null in source)' }) : c.value), cls: 'num' },
      { key: 'rounds', label: 'Rounds', sort: (c) => +c.rounds, cell: (c) => c.rounds, cls: 'num' },
      { key: 'window', label: 'Window', sort: (c) => c.window, cell: (c) => h('code', { text: c.window }) },
    ];
    const tbl = progressiveTable({ table: RS.$('#cells-table'), status: RS.$('#cells-status'), columns: cols, rows: D.speedCsv });
    const apply = () => tbl.render(D.speedCsv.filter((c) => state.rec.has(c.recipe) && state.tp.has(+c.tp) && (state.metric === 'all' || c.metric === state.metric)));
    ctl.append(RS.chipGroup({ label: 'Recipe', name: 'c-rec', options: RS.RECIPE_ORDER.map((k) => ({ value: k, label: R[k].name })), selected: state.rec, onChange: (v) => { state.rec = v; apply(); } }));
    ctl.append(RS.chipGroup({ label: 'TP', name: 'c-tp', options: RS.TPS.map((tp) => ({ value: tp, label: `TP${tp}` })), selected: state.tp, onChange: (v) => { state.tp = v; apply(); } }));
    const sel = h('select', { 'aria-label': 'Metric' }, h('option', { value: 'all', text: 'All metrics' }), ...Object.entries(label).map(([k, v]) => h('option', { value: k, text: v })));
    sel.addEventListener('change', () => { state.metric = sel.value; apply(); });
    ctl.append(h('label', { class: 'control' }, h('span', { class: 'control-label', text: 'Metric' }), sel));
  }

  // ================= scenario grid (lazy) =================
  function scenarioGrid(X) {
    const el = RS.clear(RS.$('#scenario-grid'));
    if (!X) { el.append(h('p', { class: 'lazy-note', text: 'Receipt extracts could not be loaded. Rebuild with node site/scripts/build.mjs.' })); return; }
    const cat = X.scenarioCatalog;
    const order = D.rounds.slice().sort((a, b) => RS.RECIPE_ORDER.indexOf(a.recipe) - RS.RECIPE_ORDER.indexOf(b.recipe) || b.tp - a.tp || RS.EFFORTS.indexOf(a.mode) - RS.EFFORTS.indexOf(b.mode) || a.parallel - b.parallel || a.round - b.round);
    // failure/partial counts per scenario, per recipe
    const counts = cat.map(() => ({ total: 0, ours: 0 }));
    for (const r of order) { const st = X.rounds[r.id].scenarioStatus; for (let i = 0; i < st.length; i++) if (st[i] !== 'P') { counts[i].total++; if (r.recipe === 'ringside') counts[i].ours++; } }
    const wrap = h('div', { style: 'min-width:720px' });
    const head = h('div', { style: 'display:grid;grid-template-columns:190px 1fr;gap:10px;align-items:end' }, h('span', { class: 'xsmall muted', text: 'not-pass count, all 60 rounds' }));
    const bars = h('div', { style: 'display:grid;grid-template-columns:repeat(92,1fr);gap:1px;height:36px;align-items:end' });
    const maxC = Math.max(...counts.map((c) => c.total));
    cat.forEach((c, i) => bars.append(h('i', { style: `display:block;height:${Math.max(1, (counts[i].total / maxC) * 36)}px;background:var(--ink-3);border-radius:1px`, dataset: { i } })));
    head.append(bars); wrap.append(head);
    const rows = h('div', { role: 'list' });
    for (const r of order) {
      const x = X.rounds[r.id];
      const btn = h('button', { type: 'button', class: 'cell-btn', role: 'listitem', style: 'display:grid;grid-template-columns:190px 1fr;gap:10px;align-items:center;margin:0;padding:1px 4px;width:100%', 'aria-label': `${r.id}: ${r.passed} pass, ${r.partial} partial, ${r.failed} fail. Inspect.`, onclick: () => RS.openRun(r.id) });
      btn.append(h('span', { class: 'xsmall', style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, RS.monogram(r.recipe, 'tiny'), ' ', `TP${r.tp} ${RS.EFFORT_LABEL[r.mode]} C${r.parallel} r${r.round} · ${r.score}`));
      const strip = h('span', { style: 'display:grid;grid-template-columns:repeat(92,1fr);gap:1px' });
      for (let i = 0; i < x.scenarioStatus.length; i++) strip.append(h('i', { class: `s-${x.scenarioStatus[i]}`, style: 'display:block;height:10px;border-radius:1px', dataset: { i, r: r.id } }));
      btn.append(strip); rows.append(btn);
    }
    wrap.append(rows); el.append(wrap);
    el.append(h('div', { class: 'legend', style: 'margin-top:10px' }, h('span', { class: 'item' }, h('i', { class: 's-P', style: 'width:12px;height:12px;display:inline-block;border-radius:2px' }), 'pass'), h('span', { class: 'item' }, h('i', { class: 's-p', style: 'width:12px;height:12px;display:inline-block;border-radius:2px' }), 'partial'), h('span', { class: 'item' }, h('i', { class: 's-F', style: 'width:12px;height:12px;display:inline-block;border-radius:2px' }), 'fail')));
    // one delegated tooltip for 5,520 cells
    el.addEventListener('pointermove', (e) => {
      const t = e.target.closest('i[data-i]'); if (!t) { RS.tooltip.hide(); return; }
      const i = +t.dataset.i; const [id, name, expect] = cat[i];
      const box = h('div', null, h('div', { class: 'tt-title', text: `${id} · ${name}` }), h('div', { class: 'xsmall', style: 'color:var(--ink-3)', text: expect }), h('hr'));
      box.append(h('div', { class: 'tt-row' }, h('span', { class: 'k', text: 'not-pass in all 60 rounds' }), h('strong', { text: String(counts[i].total) })));
      box.append(h('div', { class: 'tt-row' }, h('span', { class: 'k', text: 'not-pass in RiNGSiDE\'s 23' }), h('strong', { text: String(counts[i].ours) })));
      if (t.dataset.r) {
        const x = X.rounds[t.dataset.r]; const st = { P: 'pass', p: 'partial', F: 'fail' }[x.scenarioStatus[i]];
        box.append(h('hr'), h('div', { class: 'tt-row' }, h('span', { class: 'k', text: t.dataset.r }), h('strong', { text: `${st} · ${x.scenarioPoints[i]} pt` })));
        if (x.scenarioCompletionTokens[i] != null) box.append(h('div', { class: 'tt-row' }, h('span', { class: 'k', text: 'completion tokens (receipt)' }), h('span', { text: x.scenarioCompletionTokens[i].toLocaleString('en-US') })));
        if (x.scenarioNotes[id]) box.append(h('div', { class: 'tt-hint', text: x.scenarioNotes[id] }));
      }
      RS.tooltip.show(box, t, e);
    });
    el.addEventListener('pointerleave', () => RS.tooltip.hide());
  }

  // ================= inspector =================
  const dlg = () => RS.$('#inspector');
  RS.openRun = function (id, { push = true } = {}) {
    const r = D.rounds.find((x) => x.id === id); if (!r) return;
    const d = RS.clear(dlg());
    const rec = R[r.recipe];
    const close = h('button', { class: 'btn close', type: 'button', text: 'Close', 'aria-label': 'Close run inspector' });
    close.addEventListener('click', () => d.close());
    d.append(h('div', { class: 'insp-head' }, rec.ours ? h('span', { class: `swatch tp${r.tp}`, style: 'width:14px;height:14px;margin-top:8px' }) : RS.monogram(r.recipe),
      h('div', null, h('h3', { id: 'insp-title', text: `${rec.name} · ${RS.cohortLabel(r.tp, r.mode, r.parallel)} · round ${r.round}` }), h('div', { class: 'xsmall muted' }, h('span', { class: 'hash', text: r.id }), ' · ', h('a', { href: `#run/${r.id}`, text: 'link to this run' }))), close));
    const body = h('div', { class: 'insp-body' });
    d.append(body);
    const st = RS.cohortStats(D.rounds.filter((x) => x.recipe === r.recipe && RS.cohortKey(x) === RS.cohortKey(r)));
    body.append(h('div', { style: 'display:flex;gap:28px;flex-wrap:wrap;align-items:flex-end' },
      h('div', null, h('div', { class: 'bigscore', text: `${r.score}` }), h('div', { class: 'xsmall muted', text: `score / 100 · ${r.points}/${r.max_points} points` })),
      h('div', null, h('div', { class: 'bigscore', text: RS.mmss(r.seconds) }), h('div', { class: 'xsmall muted', text: `completed-round time · ${r.seconds} s as stored` })),
      h('div', { style: 'flex:1;min-width:200px' }, h('div', { class: 'pfbar', 'aria-hidden': 'true' }, h('span', { style: `flex:${r.passed};background:color-mix(in srgb, var(--ink) 22%, transparent)` }), h('span', { style: `flex:${r.partial};background:var(--tp2)` }), h('span', { style: `flex:${r.failed};background:var(--ink)` })), h('div', { class: 'xsmall muted', text: `${r.passed} pass · ${r.partial} partial · ${r.failed} fail of ${r.scenarios}` }))));
    const trunc = r.reported_truncation_cases;
    body.append(h('div', { class: 'caveat' }, h('span', { class: 'ico', 'aria-hidden': 'true', text: trunc.length ? '★' : 'i' }), h('div', null, trunc.length ? h('strong', { text: 'Reported output-cap truncation: ' }) : h('strong', { text: 'No truncation reported. ' }),
      trunc.length ? trunc.map((c) => (typeof c === 'string' ? c : `${c.scenario} (${c.status}) — ${c.note}`)).join(' · ') : 'Per-turn finish reasons are not fully retained, so an absent report does not prove the cap was never reached.')));
    const kv = (pairs) => { const dl = h('dl', { class: 'kv' }); for (const [k, v] of pairs) if (v != null && v !== '') dl.append(h('dt', { text: k }), h('dd', null, v)); return dl; };
    const idRow = D.identities.rows.find((x) => x.recipe === ({ ringside: 'RiNGSiDE', miaai: 'Mia', tonyd2wild: 'Tony2wild', knapcio: 'Knapcio' })[r.recipe] && x.tp === `TP${r.tp}`);
    body.append(h('h4', { text: 'Setting' }), kv([
      ['Tensor parallel', `TP${r.tp}`], ['Effort', `${RS.EFFORT_LABEL[r.mode]} (reasoning_effort "${r.mode}")`], ['Output cap', `${D.cap(r.mode).toLocaleString('en-US')} tokens per turn`],
      ['Scenarios in parallel', String(r.parallel)], ['Cohort', st.repeated ? `n=${st.n} · median ${st.medScore} · ${RS.mmss(st.medSecs)} · range ${st.minScore}–${st.maxScore}, ${RS.mmss(st.minSecs)}–${RS.mmss(st.maxSecs)}` : 'single round · no variance estimate'],
      ['Sampling', `temperature ${D.settings.temperature}, seed ${D.settings.seed}, top_p ${D.settings.top_p}, top_k ${D.settings.top_k}, min_p ${D.settings.min_p}, repetition ${D.settings.repetition_penalty}`],
      ['Suite', `${D.toolEval.benchmark.repository} ${D.toolEval.benchmark.version} · ${D.toolEval.benchmark.suite} · max ${D.settings.max_turns} turns · ${D.settings.timeout_seconds} s timeout`],
      ['Started / finished', r.started ? `${r.started} → ${r.finished} (UTC${D.toolEval.snapshot.utc_offset})` : 'not in the summary file; the run id records the UTC start'],
      ['Run id', h('span', { class: 'hash', text: r.run_id })],
      ['Max scenario completion tokens', r.max_scenario_completion_tokens != null ? r.max_scenario_completion_tokens.toLocaleString('en-US') : null],
    ]));
    body.append(h('h4', { text: 'Source identity' }), kv([
      ['Tool-eval source', idRow ? h('span', { class: 'hash', text: idRow.tool_eval_source }) : null],
      ['Checkpoint note', idRow ? idRow.checkpoint_note : null],
      ['Recipe note', D.toolEval.recipes[r.recipe] ? D.toolEval.recipes[r.recipe].note : null],
    ]));
    const recvd = h('div', null, h('p', { class: 'lazy-note', text: 'Loading receipt-recorded settings…' }));
    body.append(h('h4', { text: 'Recorded in the receipt (result.json)' }), recvd);
    RS.whenExtracts((X) => {
      RS.clear(recvd);
      const x = X && X.rounds[r.id];
      if (!x) { recvd.append(h('p', { class: 'muted small', text: 'Receipt extracts unavailable; open result.json below.' })); return; }
      recvd.append(kv([
        ['Served model label', x.config.model], ['Server model root', x.metadata.server_model_root], ['Engine', `${x.metadata.engine_name || ''} ${x.metadata.engine_version || ''}`.trim()],
        ['Max model length', x.metadata.max_model_len != null ? x.metadata.max_model_len.toLocaleString('en-US') : null], ['max_tokens', x.metadata.max_tokens != null ? x.metadata.max_tokens.toLocaleString('en-US') : null],
        ['Request parameters', h('code', { text: JSON.stringify(x.config.extra_params) })], ['Concurrency', String(x.config.concurrency)], ['Label', x.metadata.label],
        ['Final score (receipt)', `${x.final_score} · ${x.scores.total_points}/${x.scores.max_points} points · status ${x.status}`],
        ['Tokens · median turn', `${(x.scores.total_tokens || 0).toLocaleString('en-US')} total tokens · ${x.scores.median_turn_ms} ms median turn`],
      ]));
      const strip = h('div', { class: 'strip', role: 'img', 'aria-label': `Scenario outcomes: ${r.passed} pass, ${r.partial} partial, ${r.failed} fail` });
      for (let i = 0; i < x.scenarioStatus.length; i++) strip.append(h('i', { class: `s-${x.scenarioStatus[i]}`, title: `${X.scenarioCatalog[i][0]} ${X.scenarioCatalog[i][1]}: ${{ P: 'pass', p: 'partial', F: 'fail' }[x.scenarioStatus[i]]}` }));
      recvd.append(h('h4', { text: 'Scenario outcomes (TC-01 → TC-92)' }), strip);
      const notes = Object.entries(x.scenarioNotes);
      if (notes.length) {
        const ul = h('ul', { class: 'small', style: 'padding-left:18px' });
        for (const [sid, n] of notes) { const i = X.scenarioCatalog.findIndex((c) => c[0] === sid); ul.append(h('li', null, h('strong', { text: `${sid} ${X.scenarioCatalog[i] ? X.scenarioCatalog[i][1] : ''} · ${{ p: 'partial', F: 'fail' }[x.scenarioStatus[i]] || ''}: ` }), n)); }
        recvd.append(h('details', { class: 'disclose' }, h('summary', { text: `Non-pass scenarios (${notes.length}) — summaries from the receipt` }), h('div', { class: 'inner' }, ul)));
      }
      recvd.append(h('h4', { text: 'Category scores' }), h('div', { class: 'table-wrap', style: 'max-height:none;box-shadow:none' }, h('table', { class: 'data-table' }, h('tbody', null, ...x.categories.map(([c, l, e, m]) => h('tr', null, h('td', { text: c }), h('td', { text: l }), h('td', { class: 'num', text: `${e}/${m}` })))))));
    });
    // receipts
    body.append(h('h4', { text: 'Receipt files' }));
    body.append(h('p', { class: 'xsmall muted' }, 'Original lab source ', h('code', { text: r.source.path }), ' · sha256 ', h('span', { class: 'hash', text: r.source.sha256 }), '. Exports are redacted derivatives (private addresses, paths and host names removed).'));
    const ul = h('ul', { class: 'file-list' });
    const manByExport = new Map(D.receiptManifest.files.map((m) => [`bench/results/tool-eval-logs/${m.export}`, m]));
    for (const f of ['result.json', 'report-1.md', 'console.log', 'receipt.json']) {
      const p = `bench/results/${r.receipt.folder}/${f}`; const info = D.files[p]; const m = manByExport.get(p);
      if (!info) { ul.append(h('li', null, h('span', { class: 'fname muted', text: f }), h('span', { class: 'xsmall muted', text: 'not in this receipt folder' }))); continue; }
      const view = h('button', { class: 'btn', type: 'button', text: 'View' });
      const holder = h('div', { style: 'grid-column:1/-1' });
      view.addEventListener('click', async () => {
        RS.clear(holder);
        try {
          if (location.protocol === 'file:') throw new Error('file');
          const txt = await (await fetch(RS.pkgHref(p))).text();
          const LIM = 200000;
          holder.append(h('pre', { class: 'viewer', tabindex: 0, text: txt.length > LIM ? txt.slice(0, LIM) + `\n\n… ${RS.bytes(txt.length - LIM)} more — open the file for the rest.` : txt }));
        } catch (e) { holder.append(h('p', { class: 'small muted', text: 'Inline viewing needs the local server (node site/scripts/serve.mjs). The link opens the file directly.' })); }
      });
      const matchR = f === 'result.json' ? (info.sha256 === r.receipt.result_sha256 ? h('span', { class: 'verified', text: ' ✓ matches receipt.result_sha256' }) : h('span', { class: 'mismatch', text: ' ✗ differs from receipt.result_sha256' })) : '';
      ul.append(h('li', null, h('span', { class: 'fname' }, h('a', { href: RS.pkgHref(p), text: f })), h('span', null, h('span', { class: 'xsmall muted', text: RS.bytes(info.bytes) + ' ' }), view),
        h('span', { class: 'fmeta' }, 'sha256 ', h('span', { class: 'hash', text: info.sha256 }), matchR, m ? h('span', null, ' · original ', h('span', { class: 'hash', text: m.original_sha256 }), m.export_sha256 === info.sha256 ? h('span', { class: 'verified', text: ' ✓ manifest' }) : h('span', { class: 'mismatch', text: ' ✗ manifest' })) : ''), holder));
    }
    body.append(ul);
    // other rounds in the cohort
    const sib = D.rounds.filter((x) => x.recipe === r.recipe && RS.cohortKey(x) === RS.cohortKey(r) && x.id !== r.id);
    if (sib.length) body.append(h('p', { class: 'small' }, 'Other rounds in this cohort: ', ...sib.flatMap((x, i) => [i ? ' · ' : '', h('a', { href: `#run/${x.id}`, text: `round ${x.round} (${x.score}, ${RS.mmss(x.seconds)})` })])));
    if (!d.open) d.showModal();
    close.focus();
    if (push && location.hash !== `#run/${id}`) history.replaceState(null, '', `#run/${id}`);
  };
  document.addEventListener('DOMContentLoaded', () => {
    dlg().addEventListener('close', () => { if (location.hash.startsWith('#run/')) history.replaceState(null, '', location.pathname + location.search + '#all-runs'); });
    dlg().addEventListener('click', (e) => { if (e.target === dlg()) dlg().close(); });
  });

  // ================= appendices =================
  function sampled() {
    const S = D.sampled;
    const rows = S.map((x, i) => ({ id: `sampled-${i}`, recipe: x.recipe === 'RiNGSiDE' ? 'ringside' : 'miaai', tp: x.tp, mode: x.effort, parallel: x.concurrency, round: 1, score: x.score, seconds: x.seconds, reported_truncation_cases: [], points: null, max_points: null, _s: x }));
    const groups = rows.map((r) => ({ key: r.id, recipe: r.recipe, tp: r.tp, mode: r.mode, parallel: r.parallel, rounds: [r], label: () => `${R[r.recipe].name} ${RS.EFFORT_LABEL[r.mode]} C${r.parallel} · ${r.score}` }));
    const el = RS.$('#sampled-chart');
    // own chart and own axis: temperature-one values never share the main axes or medians
    RS.qualityChart(el, { groups, yDomain: [84, 96], ariaLabel: 'Temperature-one observations: score against round time',
      tip: (r) => { const x = r._s; return h('div', null, h('div', { class: 'tt-val', text: `${x.score}/100 · ${RS.mmss(x.seconds)}` }), h('div', { class: 'tt-title', text: `${x.recipe} TP${x.tp} ${RS.EFFORT_LABEL[x.effort]} C${x.concurrency}` }), h('div', { class: 'xsmall', text: `temperature ${x.temperature}, top_p ${x.top_p} · single observation · ${x.status}` }), h('div', { class: 'tt-hint', text: 'Click or press Enter to open the receipt' })); },
      open: (r) => window.open(RS.pkgHref(r._s.receipt), '_blank', 'noopener'),
      aria: (r) => { const x = r._s; return `${x.recipe} TP${x.tp} ${x.effort} C${x.concurrency}, temperature ${x.temperature}: ${x.score}/100 in ${RS.mmss(x.seconds)}. Opens receipt.`; } });
    const t = RS.$('#sampled-table');
    t.append(h('thead', null, h('tr', null, ...['Recipe', 'Setting', 'Score', 'Time', 'Status', 'Receipt'].map((c) => h('th', { scope: 'col', text: c })))));
    const tb = h('tbody');
    for (const x of S) {
      const info = D.files[x.receipt];
      tb.append(h('tr', null, h('td', { text: x.recipe }), h('td', { text: `TP${x.tp} ${x.effort} C${x.concurrency} · T${x.temperature} p${x.top_p}` }), h('td', { class: 'num', text: String(x.score) }), h('td', { class: 'num', text: `${RS.mmss(x.seconds)} (${x.seconds} s)` }), h('td', { class: 'wrap', text: x.status }), h('td', null, h('a', { href: RS.pkgHref(x.receipt), text: 'result.json' }), info ? h('div', { class: 'hash xsmall muted', text: RS.shortHash(info.sha256, 16) }) : '')));
    }
    t.append(tb);
  }

  function historical() {
    const H = D.historical; const el = RS.$('#historical');
    el.append(h('p', { class: 'prose' }, 'Two RiNGSiDE TP4 release rounds on the ', h('strong', { text: 'earlier 69-case suite' }), ` (tool-eval-bench ${H.version}, commit `, h('span', { class: 'hash', text: RS.shortHash(H.benchmark_commit, 8) }), `). Reasoning: ${H.reasoning}. Elapsed time was not recorded (`, h('code', { text: String(H.elapsed_seconds) }), '), so these rounds cannot be placed on a time axis, and a 69-case score is not comparable with the 92-case scores above.'));
    const row = h('div', { style: 'display:flex;gap:28px;flex-wrap:wrap' });
    H.rounds.forEach((r, i) => row.append(h('div', null, h('div', { class: 'bigscore', text: String(r.score) }), h('div', { class: 'xsmall muted' }, `round ${r.round} · ${r.points}/${r.max_points} points · 69 cases · time not recorded · `, h('a', { href: RS.pkgHref(`bench/results/tool-eval-logs/historical/release-tp4-${i + 1}/result.json`), text: 'receipt' })))));
    el.append(row);
  }

  function baseline37() {
    const el = RS.$('#baseline37'); const b = D.baseline37.rounds;
    el.append(h('p', { class: 'prose' }, `The original chart generator's snapshot holds ${b.length} rounds: all ${b.filter((x) => x.recipe === 'ringside').length} RiNGSiDE rounds above plus ${b.filter((x) => x.recipe === 'miaai').length} Mia rounds. It is not "37 of ours". Every one of those rounds appears unchanged in the 60-round file; the 23 later additions are Tony2wild (17), Knapcio (4) and Mia at 6 and 8 in parallel (2).`));
    const pic = h('picture', null, h('source', { media: '(prefers-color-scheme: dark)', srcset: RS.pkgHref('bench/results/baseline-tool-eval-dark.svg') }), h('img', { src: RS.pkgHref('bench/results/baseline-tool-eval-light.svg'), alt: 'The original RiNGSiDE tool-eval chart from the earlier generator: TP4 and TP2 score against round time with Mia in hollow grey', loading: 'lazy', style: 'width:100%;max-width:760px;display:block;border:1px solid var(--border);border-radius:10px;background:#fcfcfb' }));
    el.append(h('details', { class: 'disclose' }, h('summary', { text: 'Show the original generator chart (reference for the established chart language)' }), h('div', { class: 'inner' }, pic)));
    el.append(h('p', { class: 'small' }, h('a', { href: RS.pkgHref('canonical-baseline/bench/results/evidence/tool-eval-current.json'), text: '37-round evidence JSON' }), ' · ', h('a', { href: RS.pkgHref('bench/results/baseline-speed-light.svg'), text: 'original speed chart' }), ' · ', h('a', { href: RS.pkgHref('index.html'), text: 'previous static review page' })));
  }

  function downloads() {
    const el = RS.$('#downloads');
    const items = [['tool-eval-rounds.csv', 'All 60 rounds (CSV)'], ['bench/results/evidence/tool-eval-current.json', 'Tool-eval evidence (JSON)'], ['speed-cells.csv', 'Speed cells (CSV)'], ['speed-evidence.json', 'Speed evidence (JSON)'], ['source-identities.json', 'Source identities (JSON)'], ['sampled-appendix.json', 'Temperature-one appendix (JSON)'], ['bench/results/evidence/tool-eval-historical.json', '69-case history (JSON)'], ['bench/results/tool-eval-logs/manifest.json', 'Tool-eval receipt manifest'], ['evidence/export-manifest.json', 'Speed receipt manifest'], ['SHA256SUMS', 'SHA256SUMS'], ['bench/results/tool-eval-logs.tar.gz', 'All tool-eval receipts (tar.gz)']];
    for (const [p, label] of items) {
      const info = D.files[p] || Object.values(D.sources).find((s) => s.path === p);
      el.append(h('a', { class: 'btn', href: RS.pkgHref(p), download: p.split('/').pop(), title: info ? `sha256 ${info.sha256}` : p }, '↓ ', label, info ? h('span', { class: 'xsmall muted', text: ` ${RS.bytes(info.bytes)}` }) : ''));
    }
  }

  RS.renderEvidence = function () {
    integrity(); identities(); settingsKV(); runsTable(); cellsTable(); sampled(); historical(); baseline37(); downloads();
    RS.whenExtracts(scenarioGrid);
  };
})();
