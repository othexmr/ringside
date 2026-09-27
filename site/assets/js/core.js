/* RiNGSiDE benchmark review — core: data model, statistics, formatting, DOM and tooltip helpers.
   Classic script (no modules) so the site also opens straight from file://. */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const SNAP = window.RS_SNAPSHOT;

  // ---------- constants ----------
  RS.PKG = '../benchmark-package/';       // receipts are linked in place, never copied
  RS.RECIPES = {
    ringside:   { key: 'ringside',   name: 'RiNGSiDE',  mono: 'R', author: 'othexmr',    ours: true },
    miaai:      { key: 'miaai',      name: 'Mia',       mono: 'M', author: 'MiaAI-Lab',  dash: '7 4' },
    tonyd2wild: { key: 'tonyd2wild', name: 'Tony2wild', mono: 'T', author: 'tonyd2wild', dash: '2 3' },
    knapcio:    { key: 'knapcio',    name: 'Knapcio',   mono: 'K', author: 'knapcio',    dash: '10 3 2 3' },
  };
  RS.RECIPE_ORDER = ['ringside', 'miaai', 'tonyd2wild', 'knapcio'];
  RS.EFFORTS = ['high', 'low', 'max'];
  RS.EFFORT_LABEL = { high: 'High', low: 'Low', max: 'Max' };
  RS.EFFORT_SHAPE = { high: 'circle', low: 'square', max: 'diamond' };   // established generator language
  RS.TPS = [4, 2];

  // ---------- parsing (verbatim sources) ----------
  function parseCSV(text) {
    const rows = []; let row = []; let field = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    const head = rows.shift();
    return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
  }
  RS.parseCSV = parseCSV;

  const src = SNAP.sources;
  const D = (RS.data = {
    toolEval: JSON.parse(src.toolEval.text),
    baseline37: JSON.parse(src.baseline37.text),
    historical: JSON.parse(src.historical.text),
    roundsCsv: parseCSV(src.roundsCsv.text),
    speed: JSON.parse(src.speed.text),
    speedCsv: parseCSV(src.speedCsv.text),
    identities: JSON.parse(src.identities.text),
    sampled: JSON.parse(src.sampled.text),
    speedManifest: JSON.parse(src.speedManifest.text),
    receiptManifest: JSON.parse(src.receiptManifest.text),
    files: SNAP.files,
    sources: src,
    speedWindows: SNAP.speedWindows,
    verified: SNAP.verified,
  });
  D.rounds = D.toolEval.rounds;
  D.settings = D.toolEval.settings;
  D.cap = (mode) => D.settings.output_tokens[mode];

  // ---------- statistics (medians/ranges for repeated cohorts only) ----------
  RS.median = function (xs) {
    const s = xs.slice().sort((a, b) => a - b); const n = s.length;
    if (!n) return null;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  };
  RS.cohortKey = (r) => `${r.tp}|${r.mode}|${r.parallel}`;
  RS.cohortStats = function (rounds) {
    const n = rounds.length;
    const scores = rounds.map((r) => r.score); const secs = rounds.map((r) => r.seconds);
    return {
      n, repeated: n > 1,
      scores, secs,
      medScore: n > 1 ? RS.median(scores) : null,
      medSecs: n > 1 ? RS.median(secs) : null,
      minScore: Math.min(...scores), maxScore: Math.max(...scores),
      minSecs: Math.min(...secs), maxSecs: Math.max(...secs),
      // the value to place a cohort at: the median when repeated, the single observation otherwise
      atScore: n > 1 ? RS.median(scores) : scores[0],
      atSecs: n > 1 ? RS.median(secs) : secs[0],
      truncated: rounds.filter((r) => r.reported_truncation_cases.length),
    };
  };
  RS.roundsFor = (pred) => D.rounds.filter(pred);
  RS.cohortMeta = (recipe, tp, mode, parallel) => D.toolEval.cohorts.find((c) => c.recipe === recipe && c.tp === tp && c.mode === mode && c.parallel === parallel);

  // ---------- formatting ----------
  RS.mmss = function (sec) {
    if (sec == null || !isFinite(sec)) return '—';
    const t = Math.round(sec); const m = Math.floor(t / 60); const s = t % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  RS.secExact = (sec) => (Number.isInteger(sec) ? `${sec} s` : `${sec} s`);  // exact value as stored
  RS.fmt = function (v, digits) {
    if (v == null || !isFinite(v)) return '—';
    if (digits == null) digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
    return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  };
  RS.plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  RS.shortHash = (h, n = 12) => (h ? h.slice(0, n) : '');
  RS.bytes = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(2)} MiB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KiB` : `${b} B`);
  RS.truncLabel = (cases) => cases.map((c) => (typeof c === 'string' ? c : c.scenario)).join(', ');
  RS.cohortLabel = (tp, mode, parallel) => `TP${tp} · ${RS.EFFORT_LABEL[mode]} · ${D.cap(mode) / 1024}K cap · C${parallel}`;

  // ---------- DOM ----------
  const SVGNS = 'http://www.w3.org/2000/svg';
  RS.h = function (tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  };
  RS.s = function (tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  };
  RS.$ = (sel, root = document) => root.querySelector(sel);
  RS.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  RS.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  RS.pkgHref = (path) => RS.PKG + path.split('/').map(encodeURIComponent).join('/');
  RS.receiptHref = (folder, file) => RS.pkgHref(`bench/results/${folder}/${file}`);

  RS.monogram = function (key, extra) {
    const r = RS.RECIPES[key];
    return RS.h('span', { class: `monogram${r.ours ? ' ours' : ''}${extra ? ' ' + extra : ''}`, 'aria-hidden': 'true', text: r.mono });
  };
  RS.tpTag = (tp) => RS.h('span', { class: `tag tp${tp}`, text: `TP${tp}` });

  // ---------- chip groups (multi-select toggles with aria-pressed) ----------
  RS.chipGroup = function ({ label, options, selected, onChange, single, name }) {
    const wrap = RS.h('div', { class: 'control', role: 'group', 'aria-label': label });
    wrap.append(RS.h('span', { class: 'control-label', 'aria-hidden': 'true', text: label }));
    const seg = RS.h('div', { class: 'seg' });
    const state = new Set(selected);
    const buttons = options.map((o) => {
      const b = RS.h('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.has(o.value)), dataset: { value: String(o.value), group: name || label } });
      if (o.glyph) b.append(o.glyph);
      b.append(o.label);
      if (o.title) b.title = o.title;
      if (o.disabled) b.disabled = true;
      b.addEventListener('click', () => {
        if (single) { state.clear(); state.add(o.value); }
        else if (state.has(o.value)) { if (state.size > 1) state.delete(o.value); }
        else state.add(o.value);
        for (const [i, bb] of buttons.entries()) bb.setAttribute('aria-pressed', String(state.has(options[i].value)));
        onChange(new Set(state));
      });
      seg.append(b);
      return b;
    });
    wrap.append(seg);
    wrap.getState = () => new Set(state);
    return wrap;
  };

  // ---------- tooltip (hover and keyboard focus; never the only route to a value) ----------
  const tip = RS.h('div', { class: 'tooltip', role: 'tooltip', id: 'rs-tooltip' });
  document.addEventListener('DOMContentLoaded', () => document.body.append(tip));
  let tipOwner = null;
  RS.tooltip = {
    show(content, anchor, evt) {
      RS.clear(tip).append(content);
      tip.classList.add('show');
      tipOwner = anchor;
      let x, y;
      if (evt && evt.clientX != null && evt.type.startsWith('pointer')) { x = evt.clientX; y = evt.clientY; }
      else { const b = anchor.getBoundingClientRect(); x = b.left + b.width / 2; y = b.top; }
      const w = tip.offsetWidth; const h = tip.offsetHeight; const pad = 12;
      let left = x + 16; let top = y - h - 12;
      if (left + w > innerWidth - pad) left = Math.max(pad, x - w - 16);
      if (top < pad) top = y + 20;
      if (top + h > innerHeight - pad) top = Math.max(pad, innerHeight - h - pad);
      tip.style.left = `${left}px`; tip.style.top = `${top}px`;
    },
    hide(anchor) { if (!anchor || anchor === tipOwner) { tip.classList.remove('show'); tipOwner = null; } },
  };
  RS.bindTip = function (el, build, onActivate) {
    el.addEventListener('pointerenter', (e) => RS.tooltip.show(build(), el, e));
    el.addEventListener('pointermove', (e) => RS.tooltip.show(build(), el, e));
    el.addEventListener('pointerleave', () => RS.tooltip.hide(el));
    el.addEventListener('focus', () => RS.tooltip.show(build(), el));
    el.addEventListener('blur', () => RS.tooltip.hide(el));
    if (onActivate) {
      el.addEventListener('click', onActivate);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(e); } });
    }
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') RS.tooltip.hide(); });
  document.addEventListener('scroll', () => RS.tooltip.hide(), { passive: true });

  // ---------- responsive re-render ----------
  RS.onResize = function (el, fn) {
    let last = 0; let raf = 0;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w === last || w === 0) return;
      last = w; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => fn(w));
    });
    ro.observe(el);
    return ro;
  };

  // ---------- storage (per-viewer convenience only; always optional) ----------
  RS.store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode etc. */ } },
  };

  // ---------- downloads (generated from the current view; originals remain the reference) ----------
  RS.download = function (name, text, type = 'text/csv') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = RS.h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  RS.toCSV = function (rows, cols) {
    const esc = (v) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
  };

  // ---------- lazy receipt extracts ----------
  RS.extracts = null;
  const waiters = [];
  RS.whenExtracts = (fn) => (RS.extracts ? fn(RS.extracts) : waiters.push(fn));
  RS.loadExtracts = function () {
    if (RS._extractsLoading) return; RS._extractsLoading = true;
    const sc = document.createElement('script');
    sc.src = 'generated/receipt-extracts.js';
    sc.onload = () => { RS.extracts = window.RS_EXTRACTS; waiters.splice(0).forEach((fn) => fn(RS.extracts)); };
    sc.onerror = () => { RS.extractsError = true; waiters.splice(0).forEach((fn) => fn(null)); };
    document.head.append(sc);
  };
})();
