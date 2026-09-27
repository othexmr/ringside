#!/usr/bin/env node
// Browser checks for the RiNGSiDE review site (Playwright + Chromium).
//
//   node site/scripts/e2e.mjs [--screenshots]
//
// Starts the local server on a free port, then checks rendered charts and tables against the source
// JSON/CSV (mark by mark, including pixel positions recovered from each chart's own axis ticks),
// filters, keyboard operation, the run inspector, deep links, both themes, desktop and 390 px mobile,
// reduced motion and file:// opening. Writes site/validation/e2e-report.json; with --screenshots also
// writes review screenshots to site/validation/screenshots/.
// Playwright resolves from node_modules, or set PLAYWRIGHT_MODULE to its index.mjs.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SITE, '..');
const PKG = join(ROOT, 'benchmark-package');
const SHOTS = process.argv.includes('--screenshots');
let pw;
try { pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch { try { pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs'); } catch { console.error('Playwright not found: npm i -D playwright, or set PLAYWRIGHT_MODULE'); process.exit(2); } }
const { chromium } = pw;

const te = JSON.parse(readFileSync(join(PKG, 'bench/results/evidence/tool-eval-current.json'), 'utf8'));
const sp = JSON.parse(readFileSync(join(PKG, 'speed-evidence.json'), 'utf8'));
const R = te.rounds;
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n      ${detail}` : ''}`); };

const port = await new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const server = spawn(process.execPath, [join(SITE, 'scripts/serve.mjs'), String(port)], { stdio: 'pipe' });
await new Promise((res) => server.stdout.once('data', res));
const BASE = `http://127.0.0.1:${port}/site/`;
const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });

async function open(opts = {}, hash = '') {
  const ctx = await browser.newContext({ viewport: { width: opts.width || 1360, height: opts.height || 900 }, colorScheme: opts.scheme || 'light', reducedMotion: opts.reducedMotion || 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + hash);
  await page.waitForSelector('html[data-ready="1"]');
  await page.evaluate(() => window.RS.ensureAll());
  await page.waitForFunction(() => !!window.RS_EXTRACTS);
  await page.waitForTimeout(500);
  return { page, ctx, errors };
}

// Recover a chart's linear mapping from its tick labels, then check every quality mark sits where its data says.
const QUALITY_GEOMETRY = (root) => {
  const out = [];
  for (const svg of root.querySelectorAll('svg')) {
    const ticks = [...svg.querySelectorAll(':scope > text.tick')];
    const yt = ticks.filter((t) => t.getAttribute('text-anchor') === 'end').map((t) => [+t.textContent, +t.getAttribute('y') - 4]);
    const xt = ticks.filter((t) => t.getAttribute('text-anchor') === 'middle').map((t) => [+t.textContent, +t.getAttribute('x')]);
    if (yt.length < 2 || xt.length < 2) continue;
    const lin = (pts) => { const [a, b] = [pts[0], pts[pts.length - 1]]; return (v) => a[1] + ((v - a[0]) / (b[0] - a[0])) * (b[1] - a[1]); };
    const fy = lin(yt); const fx = lin(xt);
    for (const m of svg.querySelectorAll('.mark[data-round]')) {
      const hit = m.querySelector('circle.hit');
      out.push({ id: m.dataset.round, score: +m.dataset.score, seconds: +m.dataset.seconds, dx: Math.abs(+hit.getAttribute('cx') - fx(+m.dataset.seconds / 60)), dy: Math.abs(+hit.getAttribute('cy') - fy(+m.dataset.score)), label: m.getAttribute('aria-label') });
    }
  }
  return out;
};
const byId = new Map(R.map((r) => [r.id, r]));
function verifyMarks(marks, expectIds, name) {
  const ids = marks.map((m) => m.id).sort();
  const want = [...expectIds].sort();
  const valueBad = marks.filter((m) => { const r = byId.get(m.id); return !r || r.score !== m.score || r.seconds !== m.seconds; });
  const geoBad = marks.filter((m) => m.dx > 0.75 || m.dy > 0.75);
  const labelBad = marks.filter((m) => !m.label || !m.label.includes(`score ${byId.get(m.id).score}`));
  check(name, JSON.stringify(ids) === JSON.stringify(want) && !valueBad.length && !geoBad.length && !labelBad.length,
    `${marks.length} marks (expected ${want.length}); values ${marks.length - valueBad.length}/${marks.length} equal to JSON; positions within 0.75 px ${marks.length - geoBad.length}/${marks.length}; accessible labels ${marks.length - labelBad.length}/${marks.length}`);
}

try {
  // ---------------- desktop, light ----------------
  const { page, errors } = await open();
  const ours = R.filter((r) => r.recipe === 'ringside');
  const med = (xs) => { const s = xs.slice().sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  // headline claims, recomputed here from the JSON
  const settingsAll = [...new Set(R.map((r) => `${r.tp}|${r.mode}|${r.parallel}`))];
  const matchedSettings = settingsAll.filter((k) => { const rr = R.filter((r) => `${r.tp}|${r.mode}|${r.parallel}` === k); return rr.some((r) => r.recipe === 'ringside') && new Set(rr.map((r) => r.recipe)).size > 1; });
  let fastest = 0, clean = 0, bars = 0;
  for (const k of matchedSettings) {
    const by = {}; for (const r of R.filter((r) => `${r.tp}|${r.mode}|${r.parallel}` === k)) (by[r.recipe] ||= []).push(r);
    bars += Object.keys(by).length;
    const o = by.ringside; const others = Object.entries(by).filter(([k2]) => k2 !== 'ringside').map(([, v]) => v);
    if (others.every((v) => med(o.map((r) => r.seconds)) < med(v.map((r) => r.seconds)))) fastest++;
    if (others.every((v) => Math.max(...o.map((r) => r.seconds)) < Math.min(...v.map((r) => r.seconds)))) clean++;
  }
  const claim = await page.textContent('#hero-claim');
  const callouts = await page.textContent('#ringside-callouts');
  check('Headline claims equal what the JSON gives', claim.includes(`${fastest} of ${matchedSettings.length}`) && callouts.includes(`${fastest}/${matchedSettings.length}`) && callouts.includes(`In ${clean} of the ${matchedSettings.length}, even our slowest round`), `fastest median in ${fastest}/${matchedSettings.length} matched settings; slowest-beats-their-fastest in ${clean}/${matchedSettings.length}; hero: "${claim.trim()}"`);
  // round-time race bars
  const raceBars = await page.$$eval('#race-4 .mark[data-setting], #race-2 .mark[data-setting]', (ms) => ms.map((m) => ({ recipe: m.dataset.recipe, setting: m.dataset.setting, secs: +m.dataset.secs, score: +m.dataset.score, y: m.querySelector('rect.vis').getBBox().y, w: m.querySelector('rect.vis').getBBox().width })));
  let raceOk = 0; const raceBad = [];
  for (const b of raceBars) {
    const rr = R.filter((r) => r.recipe === b.recipe && `${r.tp}|${r.mode}|${r.parallel}` === b.setting);
    if (rr.length && b.secs === med(rr.map((r) => r.seconds)) && b.score === med(rr.map((r) => r.score))) raceOk++; else raceBad.push(`${b.recipe} ${b.setting}`);
  }
  const shortestOurs = matchedSettings.every((k) => { const g = raceBars.filter((b) => b.setting === k); const o = g.find((b) => b.recipe === 'ringside'); return o && g.every((b) => b === o || b.w > o.w); });
  check('Round-time race: every bar equals the JSON median/single value; RiNGSiDE bar shortest in each setting', raceBars.length === bars && raceOk === bars && shortestOurs, `${raceOk}/${bars} bars across ${matchedSettings.length} matched settings${raceBad.length ? '; bad: ' + raceBad.join(', ') : ''}`);

  let marks = await page.$eval('#ringside-chart', QUALITY_GEOMETRY);
  verifyMarks(marks, R.filter((r) => r.parallel === 4).map((r) => r.id), 'Section 01 default view: every recipe\'s C4 rounds (TP4 and TP2 panels), at their data positions');
  for (const c of [6, 8, 16]) await page.click(`#ringside-controls .chip[data-group="r-par"][data-value="${c}"]`);
  marks = await page.$eval('#ringside-chart', QUALITY_GEOMETRY);
  verifyMarks(marks, R.map((r) => r.id), 'Section 01 with C6/C8/C16: all 60 rounds from four recipes');
  for (const k of ['miaai', 'tonyd2wild', 'knapcio']) await page.click(`#ringside-controls .chip[data-group="r-rec"][data-value="${k}"]`);
  marks = await page.$eval('#ringside-chart', QUALITY_GEOMETRY);
  verifyMarks(marks, ours.map((r) => r.id), 'Section 01 recipe filter: RiNGSiDE only leaves our 23 rounds (13 TP4, 10 TP2)');
  const title = await page.textContent('#ringside-chart-title');
  check('Section 01 status reports shown/total', title.includes('23 rounds shown of 60') && title.includes('23 of them RiNGSiDE'), title);

  const medians = await page.$$eval('#ringside-table tbody tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim())));
  const cohortOk = medians.length === 9 && medians.every((c) => /\d/.test(c[4]));
  check('RiNGSiDE cohort table: 9 cohorts, singletons labelled single', cohortOk && medians.filter((c) => c[4].includes('single')).length === 2, medians.map((c) => `${c[0]}: ${c[4]} / ${c[5]}`).join(' · '));

  marks = await page.$eval('#matched-panels', QUALITY_GEOMETRY);
  verifyMarks(marks, R.map((r) => r.id), 'Section 02 panels: all 60 main rounds, each at its data position');
  const panels = await page.$$eval('#matched-panels .chart-card', (cs) => cs.length);
  check('Section 02: one panel per matched setting', panels === new Set(R.map((r) => `${r.tp}|${r.mode}|${r.parallel}`)).size, `${panels} panels`);
  await page.click('#matched-controls .chip[data-group="m-tp"][data-value="2"]');
  marks = await page.$eval('#matched-panels', QUALITY_GEOMETRY);
  verifyMarks(marks, R.filter((r) => r.tp === 4).map((r) => r.id), 'Section 02 TP filter: TP4 only');
  await page.click('#matched-controls .chip[data-group="m-rec"][data-value="knapcio"]');
  marks = await page.$eval('#matched-panels', QUALITY_GEOMETRY);
  verifyMarks(marks, R.filter((r) => r.tp === 4 && r.recipe !== 'knapcio').map((r) => r.id), 'Section 02 recipe filter: Knapcio hidden');

  // matrix against JSON medians / single values
  const matrix = await page.$$eval('#matrix tbody tr', (trs) => trs.map((tr) => ({ head: tr.querySelector('th').textContent.replace(tr.querySelector('th .cell-meta').textContent, ''), cells: [...tr.querySelectorAll('td')].map((td) => ({ score: td.querySelector('.cell-score') ? +td.querySelector('.cell-score').textContent : null, missing: !!td.querySelector('.cell-missing'), time: td.querySelector('.cell-time') ? td.querySelector('.cell-time').firstChild.textContent : null })) })));
  const settings = [...new Set(R.map((r) => `${r.tp}|${r.mode}|${r.parallel}`))];
  let mOk = 0, mTotal = 0, gaps = 0;
  const mmss = (s) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const order = ['ringside', 'miaai', 'tonyd2wild', 'knapcio'];
  for (const row of matrix) {
    const tp = +/TP(\d)/.exec(row.head)[1]; const mode = /(High|Low|Max)/.exec(row.head)[1].toLowerCase(); const par = +/· C(\d+)/.exec(row.head)[1];
    row.cells.forEach((c, i) => {
      mTotal++;
      const rr = R.filter((r) => r.recipe === order[i] && r.tp === tp && r.mode === mode && r.parallel === par);
      if (!rr.length) { if (c.missing) { mOk++; gaps++; } return; }
      if (c.score === med(rr.map((r) => r.score)) && c.time === mmss(med(rr.map((r) => r.seconds)))) mOk++;
      else if (process.env.DEBUG) console.log('matrix mismatch', row.head, order[i], c, med(rr.map((r) => r.score)), mmss(med(rr.map((r) => r.seconds))));
    });
  }
  check('Coverage matrix equals JSON medians/single values; gaps hatched, not zero', matrix.length === settings.length && mOk === mTotal, `${matrix.length} settings × 4 recipes: ${mOk}/${mTotal} cells correct, ${gaps} not-measured cells`);

  // speed charts against speed-evidence.json
  const expectedSpeed = (tp, metric) => {
    const out = [];
    for (const row of sp.rows.filter((r) => r.tp_size === tp)) {
      let vals = {};
      if (metric === 'cold_s' || metric === 'replay_s') for (const [d, v] of Object.entries(row.prefill_suite || {})) vals[d] = v[metric];
      else if (metric === 'stag0' || metric === 'stag1') for (const [c, v] of Object.entries(row.staggered || {})) vals[c] = v[metric === 'stag0' ? 0 : 1];
      else if (metric.startsWith('spark:')) { const w = metric.slice(6); for (const n of [1, 2, 3, 4]) if (row.sparkdash && row.sparkdash[`${w}x${n}`] != null) vals[n] = row.sparkdash[`${w}x${n}`]; }
      else vals = row[metric] || {};
      for (const [x, v] of Object.entries(vals)) if (v != null) out.push(`${row.recipe_key}|${x}|${v}`);
    }
    return out.sort();
  };
  const readSpeed = (sel) => page.$$eval(`${sel} .chart[data-metric]`, (els) => els.map((el) => ({ metric: el.dataset.metric, pts: [...el.querySelectorAll('[data-point]')].map((p) => `${p.dataset.recipe}|${p.dataset.x}|${p.dataset.v}`).sort() })));
  const speedGeometry = (sel) => page.$$eval(`${sel} .chart[data-metric] svg`, (svgs) => svgs.flatMap((svg) => {
    const yt = [...svg.querySelectorAll(':scope > text.tick')].filter((t) => t.getAttribute('text-anchor') === 'end').map((t) => [parseFloat(t.textContent.replace(/,/g, '')), +t.getAttribute('y') - 4]);
    if (yt.length < 2) return [];
    const [a, b] = [yt[0], yt[yt.length - 1]]; const fy = (v) => a[1] + ((v - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
    return [...svg.querySelectorAll('circle[data-point]')].map((c) => Math.abs(+c.getAttribute('cy') - fy(+c.dataset.v)));
  }));
  for (const tp of [4, 2]) {
    if (tp === 2) { await page.click('#speed-controls .chip[data-group="s-tp"][data-value="2"]'); await page.waitForTimeout(200); }
    const charts = await readSpeed('#rigmark-grid');
    const bad = charts.filter((c) => JSON.stringify(c.pts) !== JSON.stringify(expectedSpeed(tp, c.metric)));
    const nPts = charts.reduce((a, c) => a + c.pts.length, 0);
    const geo = await speedGeometry('#rigmark-grid');
    check(`RigMark TP${tp}: every plotted value equals speed-evidence.json`, charts.length === 7 && !bad.length && geo.every((d) => d < 0.75), `${charts.length} charts, ${nPts} points; line-chart positions within 0.75 px: ${geo.filter((d) => d < 0.75).length}/${geo.length}${bad.length ? '; mismatched: ' + bad.map((b) => b.metric).join(', ') : ''}`);
    await page.click('#tab-spark'); await page.waitForTimeout(200);
    const sc = await readSpeed('#spark-grid');
    const sbad = sc.filter((c) => JSON.stringify(c.pts) !== JSON.stringify(expectedSpeed(tp, c.metric)));
    check(`SparkBench TP${tp}: every plotted value equals speed-evidence.json`, sc.length === 4 && !sbad.length, `${sc.length} charts, ${sc.reduce((a, c) => a + c.pts.length, 0)} points`);
    await page.click('#tab-rigmark'); await page.waitForTimeout(200);
  }
  const knapTP2 = await page.$$eval('#rigmark-grid [data-recipe="knapcio"]', (e) => e.length);
  check('TP2 speed view plots nothing for Knapcio', knapTP2 === 0, `${knapTP2} Knapcio points at TP2`);
  const nullMark = await page.$$eval('#rigmark-grid .chart[data-metric="stag1"] text.missing', (t) => t.map((x) => x.textContent));
  check('Null decode-first cell drawn as ∅, not zero (TP2 Mia C6)', nullMark.includes('M∅'), nullMark.join(', '));

  // tables (progressive rendering finishes)
  await page.waitForFunction(() => document.querySelectorAll('#runs-table tbody tr').length === 60 && document.querySelectorAll('#cells-table tbody tr').length === 309, null, { timeout: 10000 });
  check('All-runs table renders 60 rows; speed-cells table 309 rows', true, 'progressive rendering completed');
  const integrity = await page.textContent('#integrity h3');
  check('In-browser integrity checks all pass', /(\d+)\/\1 checks pass/.test(integrity), integrity);
  const grid = await page.$$eval('#scenario-grid [role="listitem"]', (e) => e.length);
  const cells = await page.$$eval('#scenario-grid i[data-r]', (e) => e.length);
  check('Scenario grid: 60 rounds × 92 scenarios', grid === 60 && cells === 60 * 92, `${grid} rows, ${cells} cells`);

  // keyboard: chip toggles with Space, mark opens inspector with Enter, Escape closes, tabs with arrows
  const chip = '#ringside-controls .chip[data-group="r-mode"][data-value="low"]';
  await page.focus(chip); await page.keyboard.press('Space');
  const pressed = await page.getAttribute(chip, 'aria-pressed');
  await page.focus('#ringside-chart .mark');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#inspector[open]', { state: 'attached', timeout: 5000 });
  const inspTitle = await page.textContent('#insp-title');
  const focusInDialog = await page.evaluate(() => document.getElementById('inspector').contains(document.activeElement));
  await page.keyboard.press('Escape');
  const closed = await page.$eval('#inspector', (d) => !d.open);
  check('Keyboard: Space toggles a filter chip; Enter on a mark opens the inspector; focus moves in; Escape closes', pressed === 'false' && inspTitle.includes('RiNGSiDE') && focusInDialog && closed, `chip aria-pressed=${pressed}; inspector "${inspTitle}"`);
  await page.focus('#tab-rigmark'); await page.keyboard.press('ArrowRight');
  const sel = await page.getAttribute('#tab-spark', 'aria-selected'); const hid = await page.$eval('#panel-rigmark', (p) => p.hidden);
  check('Keyboard: arrow keys switch RigMark/SparkBench tabs', sel === 'true' && hid, `SparkBench selected=${sel}`);
  await page.focus('#rigmark-grid [role="button"]').catch(() => {});

  // inspector content for a truncated RiNGSiDE round via deep link
  const d = await open({}, '#run/ours-tp4-high-c16-2');
  await d.page.waitForSelector('#inspector[open]', { state: 'attached' });
  await d.page.waitForFunction(() => document.querySelector('#inspector .strip'));
  const txt = await d.page.textContent('#inspector');
  const strip = await d.page.$$eval('#inspector .strip i', (e) => e.length);
  check('Deep link #run/ours-tp4-high-c16-2 opens the inspector with its truncation, receipt hashes and 92-scenario strip', txt.includes('TC-88') && txt.includes('matches receipt.result_sha256') && strip === 92 && txt.includes('lab plan 92817b8d'), `strip cells ${strip}`);
  await d.ctx.close();

  check('No console errors (desktop light)', errors.length === 0, errors.join(' | '));

  // ---------------- themes × viewports ----------------
  for (const [w, scheme] of [[1360, 'light'], [1360, 'dark'], [390, 'light'], [390, 'dark'], [768, 'light']]) {
    const v = await open({ width: w, height: w < 500 ? 844 : 900, scheme });
    const overflow = await v.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const bg = await v.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const m = await v.page.$eval('#matched-panels', QUALITY_GEOMETRY);
    const bad = m.filter((x) => x.dx > 0.75 || x.dy > 0.75).length;
    check(`${w}px ${scheme}: no horizontal page scroll, charts render, marks positioned`, overflow <= 0 && m.length === 60 && !bad && v.errors.length === 0, `overflow ${overflow}px; body ${bg}; ${m.length} matched marks; errors ${v.errors.length}`);
    if (SHOTS) {
      const dir = join(SITE, 'validation', 'screenshots'); mkdirSync(dir, { recursive: true });
      const tag = `${w < 500 ? 'mobile' : w < 1000 ? 'tablet' : 'desktop'}-${scheme}`;
      await v.page.screenshot({ path: join(dir, `${tag}-top.jpg`), type: 'jpeg', quality: 72 });
      for (const [sel, name] of [['#ringside-callouts', 'headline'], ['#race-4', 'race-tp4'], ['#ringside-chart', 'quality-time'], ['#matrix', 'matrix'], ['#rigmark-grid', 'rigmark']]) {
        if (w === 768 && name !== 'matrix') continue;
        const el = await v.page.$(sel); await el.scrollIntoViewIfNeeded(); await v.page.waitForTimeout(150);
        await v.page.evaluate(() => { document.querySelector('.topbar').style.visibility = 'hidden'; });
        await el.screenshot({ path: join(dir, `${tag}-${name}.jpg`), type: 'jpeg', quality: 72 });
        await v.page.evaluate(() => { document.querySelector('.topbar').style.visibility = ''; });
      }
    }
    await v.ctx.close();
  }
  if (SHOTS) {
    const l = await open({ width: 1360 });
    const dir = join(SITE, 'validation', 'screenshots');
    for (const [sel, name] of [['#matched-panels', 'matched-panels'], ['#recipe-cards', 'recipe-cards'], ['#integrity', 'integrity'], ['#scenario-grid', 'scenario-grid']]) {
      const el = await l.page.$(sel); await el.scrollIntoViewIfNeeded(); await l.page.waitForTimeout(150);
      await l.page.evaluate(() => { document.querySelector('.topbar').style.visibility = 'hidden'; });
      await el.screenshot({ path: join(dir, `desktop-light-${name}.jpg`), type: 'jpeg', quality: 72 });
    }
    await l.page.evaluate(() => { document.querySelector('.topbar').style.visibility = ''; });
    await l.page.evaluate(() => window.RS.openRun('knapcio-tp4-high-c16-1'));
    await l.page.waitForFunction(() => document.querySelector('#inspector .strip'));
    await l.page.screenshot({ path: join(dir, 'desktop-light-inspector.jpg'), type: 'jpeg', quality: 72 });
    await l.ctx.close();
  }

  // reduced motion
  const rm = await open({ reducedMotion: 'reduce' });
  const dur = await rm.page.$eval('.ring-dash', (e) => getComputedStyle(e).animationDuration);
  await rm.page.mouse.move(300, 300); await rm.page.mouse.move(600, 500, { steps: 8 });
  await rm.page.evaluate(() => { window.RS.glitter.burst(400, 400); window.RS.glitter.rain(); });
  const rmParts = await rm.page.evaluate(() => window.RS.glitter.particles);
  check('prefers-reduced-motion stops decorative animation and glitter motion', parseFloat(dur) < 0.01 && rmParts === 0, `ring animation-duration ${dur}; live glitter particles after trail/burst/rain: ${rmParts}`);
  await rm.ctx.close();

  // file:// opening
  const fctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const fp = await fctx.newPage(); const ferr = [];
  fp.on('pageerror', (e) => ferr.push(e.message));
  await fp.goto(pathToFileURL(join(SITE, 'index.html')).href);
  await fp.waitForSelector('html[data-ready="1"]');
  await fp.evaluate(() => window.RS.ensureAll());
  await fp.waitForFunction(() => !!window.RS_EXTRACTS, null, { timeout: 8000 }).catch(() => {});
  const fm = await fp.$$eval('#matched-panels .mark[data-round]', (e) => e.length);
  const fx = await fp.evaluate(() => !!window.RS_EXTRACTS);
  check('Opens directly from file:// (charts, tables and receipt extracts load)', fm === 60 && fx && ferr.length === 0, `${fm} marks; extracts ${fx}; errors ${ferr.length}`);
  await fctx.close();

  // glitter: decoration only, never in the way, and switchable
  const gl = await open();
  const g1 = await gl.page.evaluate(() => ({
    canvases: ['glitter-sky', 'glitter-fx', 'glitter-hero'].map((id) => { const c = document.getElementById(id); return c ? [getComputedStyle(c).pointerEvents, c.getAttribute('aria-hidden')] : null; }),
    pressed: document.getElementById('glitter-toggle').getAttribute('aria-pressed'),
  }));
  await gl.page.mouse.move(200, 300); await gl.page.mouse.move(700, 420, { steps: 12 });
  await gl.page.click('#wordmark');
  const live = await gl.page.evaluate(() => window.RS.glitter.particles);
  check('Glitter layers are decorative: pointer-events none, aria-hidden, on by default; trail and bursts spawn', g1.canvases.every((c) => c && c[0] === 'none' && c[1] === 'true') && g1.pressed === 'true' && live > 20, `${JSON.stringify(g1.canvases)}; toggle pressed=${g1.pressed}; live particles after trail + wordmark click: ${live}`);
  // a real mouse click through the glitter layers still reaches a chart mark
  await gl.page.$eval('#ringside-chart', (e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await gl.page.waitForTimeout(700);
  const hit = await gl.page.$('#ringside-chart .mark circle.hit');
  await hit.scrollIntoViewIfNeeded();
  const box = await hit.boundingBox();
  await gl.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await gl.page.waitForSelector('#inspector[open]', { state: 'attached', timeout: 5000 });
  check('Mouse click on a chart mark opens the inspector through the glitter layers', true, 'inspector opened');
  await gl.page.keyboard.press('Escape');
  await gl.page.click('#glitter-toggle');
  const off = await gl.page.evaluate(() => [document.getElementById('glitter-toggle').getAttribute('aria-pressed'), document.documentElement.dataset.glitter, localStorage.getItem('rs-glitter')]);
  await gl.page.reload(); await gl.page.waitForSelector('html[data-ready="1"]');
  await gl.page.evaluate(() => window.RS.glitter.burst(300, 300));
  const after = await gl.page.evaluate(() => [document.getElementById('glitter-toggle').getAttribute('aria-pressed'), window.RS.glitter.particles]);
  check('Glitter toggle switches off, persists across reload, and stops bursts', off[0] === 'false' && off[1] === 'off' && off[2] === 'off' && after[0] === 'false' && after[1] === 0, `after click ${JSON.stringify(off)}; after reload pressed=${after[0]}, burst particles=${after[1]}`);
  await gl.ctx.close();

  // accessibility basics
  const a = await open();
  const a11y = await a.page.evaluate(() => ({
    unlabeledMarks: [...document.querySelectorAll('.mark')].filter((m) => !m.getAttribute('aria-label')).length,
    marks: document.querySelectorAll('.mark').length,
    unnamedButtons: [...document.querySelectorAll('button')].filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim())).length,
    imgsNoAlt: [...document.querySelectorAll('img')].filter((i) => !i.getAttribute('alt')).length,
    h1: document.querySelectorAll('h1').length,
    lang: document.documentElement.lang,
  }));
  check('Accessibility basics: labelled marks and buttons, alt text, one h1, lang set', a11y.unlabeledMarks === 0 && a11y.unnamedButtons === 0 && a11y.imgsNoAlt === 0 && a11y.h1 === 1 && a11y.lang === 'en', JSON.stringify(a11y));
  const ext = await a.page.evaluate(() => [...document.querySelectorAll('script[src],link[href]')].map((e) => e.src || e.href).filter((u) => !u.startsWith(location.origin)));
  check('No external runtime requests (scripts/styles are local; no analytics)', ext.length === 0, ext.join(', ') || 'all local');
  await a.ctx.close();

  // disco ball: a decorative canvas inside the hero; animated normally, a still frame under reduced motion
  const discoState = async (o) => {
    const d = await open(o);
    await d.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const sample = () => d.page.evaluate(() => {
      const c = document.getElementById('disco'); if (!c) return null;
      const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0, sum = 0;
      for (let i = 3; i < x.length; i += 16) { if (x[i] > 0) lit++; sum = (sum + x[i - 3] * 3 + x[i - 2] * 5 + x[i - 1] * 7) % 1e9; }
      return { pe: getComputedStyle(c).pointerEvents, aria: c.getAttribute('aria-hidden'), inHero: !!c.closest('.hero, header, #hero, section'), lit, sum };
    });
    await d.page.waitForTimeout(400); const s1 = await sample(); await d.page.waitForTimeout(600); const s2 = await sample();
    const rate = () => d.page.evaluate(() => new Promise((r) => { const c0 = window.RS.discoClock(), w0 = performance.now(); setTimeout(() => r((window.RS.discoClock() - c0) / ((performance.now() - w0) / 1000)), 400); }));
    const idle = await rate(); await d.page.click('#wordmark'); const spun = await rate();
    s1.spin = [idle, spun];
    await d.ctx.close(); return [s1, s2, d.errors];
  };
  const [dm1, dm2, dmErr] = await discoState({});
  const [dr1, dr2, drErr] = await discoState({ reducedMotion: 'reduce' });
  check('Disco ball canvas is decorative: pointer-events none, aria-hidden; spins (faster after a wordmark click), holds a still frame under reduced motion',
    dm1 && dm1.pe === 'none' && dm1.aria === 'true' && dm1.lit > 1000 && dm1.sum !== dm2.sum && dm1.spin[1] > 2 * dm1.spin[0] &&
    dr1 && dr1.lit > 1000 && dr1.sum === dr2.sum && dr1.spin[0] === 0 && dr1.spin[1] === 0 && !dmErr.length && !drErr.length,
    `lit samples ${dm1?.lit}; animating ${dm1?.sum !== dm2?.sum}; spin rate ${dm1?.spin.map((x) => x.toFixed(2)).join(' → ')} after click; reduced-motion still ${dr1?.sum === dr2?.sum} (lit ${dr1?.lit}, spin ${dr1?.spin.join(' → ')})`);

  // X/Twitter cards and trailer: every number they show is recomputed here from the JSON
  const lead4 = matchedSettings.filter((k) => k.startsWith('4|')).map((k) => {
    const by = {}; for (const r of R.filter((r) => `${r.tp}|${r.mode}|${r.parallel}` === k)) (by[r.recipe] ||= []).push(r.seconds);
    const o = med(by.ringside); return Math.min(...Object.entries(by).filter(([k2]) => k2 !== 'ringside').map(([, v]) => med(v))) / o;
  });
  const leadTxt = `${Math.min(...lead4).toFixed(2)}–${Math.max(...lead4).toFixed(2)}×`;
  const nm = matchedSettings.length;
  const CARDS = { hero: [1600, 900, [`${fastest} of ${nm}`, `${clean}/${nm}`, leadTxt]], race: [1600, 900, []], scatter: [1600, 900, []],
    speed: [1600, 900, []], square: [1080, 1080, [`${fastest} of ${nm}`, leadTxt]], header: [1500, 500, [`${fastest} of ${nm}`]] };
  const sp4 = sp.rows.find((r) => r.recipe_key === 'ringside' && r.tp_size === 4);
  const aggTxt = `${sp4.agg['16'].toLocaleString('en-US', { maximumFractionDigits: 0 })} tok/s`;
  const stagTxt = `${sp4.staggered['16'][0].toFixed(1)} s`;
  CARDS.speed[2].push(aggTxt.replace(' tok/s', ''), stagTxt);
  const cardBad = [];
  for (const [name, [w, hgt, want]] of Object.entries(CARDS)) {
    const cctx = await browser.newContext({ viewport: { width: w, height: hgt }, colorScheme: 'dark', reducedMotion: 'reduce' });
    const cp = await cctx.newPage(); const cerr = []; cp.on('pageerror', (e) => cerr.push(e.message));
    await cp.goto(`${BASE}social/cards.html?card=${name}`); await cp.waitForFunction(() => window.CARD_READY === true, null, { timeout: 20000 });
    const info = await cp.evaluate(() => ({ text: document.body.innerText, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
      bars: [...document.querySelectorAll('.mark[data-setting]')].map((m) => ({ recipe: m.dataset.recipe, setting: m.dataset.setting, secs: +m.dataset.secs, score: +m.dataset.score })),
      overflow: [...document.querySelectorAll('.claim, .sub, .foot, .panel-x, .stats-x')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1; }).length }));
    for (const s of want) if (!info.text.includes(s)) cardBad.push(`${name}: missing "${s}"`);
    if (info.sw > w || info.sh > hgt || info.overflow) cardBad.push(`${name}: content outside ${w}×${hgt}`);
    if (cerr.length) cardBad.push(`${name}: ${cerr.join('; ')}`);
    for (const b of info.bars) { const rr = R.filter((r) => r.recipe === b.recipe && `${r.tp}|${r.mode}|${r.parallel}` === b.setting); if (!rr.length || b.secs !== med(rr.map((r) => r.seconds)) || b.score !== med(rr.map((r) => r.score))) cardBad.push(`${name}: bar ${b.recipe} ${b.setting}`); }
    if (name === 'race' && info.bars.length !== matchedSettings.filter((k) => k.startsWith('4|')).reduce((n, k) => n + new Set(R.filter((r) => `${r.tp}|${r.mode}|${r.parallel}` === k).map((r) => r.recipe)).size, 0)) cardBad.push(`race: ${info.bars.length} bars`);
    await cctx.close();
  }
  check('X cards: every card renders inside its exact size, and its headline numbers and race bars equal the JSON', cardBad.length === 0, cardBad.join(' | ') || `${Object.keys(CARDS).length} cards; hero ${fastest} of ${nm}, ${clean}/${nm}, TP4 ${leadTxt}; speed ${aggTxt}, ${stagTxt}`);

  const tctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await tctx.addInitScript(() => {
    window.__drawn = new Set(); const P = CanvasRenderingContext2D.prototype;
    for (const fn of ['fillText', 'strokeText']) { const orig = P[fn]; P[fn] = function (s, ...rest) { window.__drawn.add(String(s)); return orig.call(this, s, ...rest); }; }
  });
  const tp = await tctx.newPage(); const terr = []; tp.on('pageerror', (e) => terr.push(e.message));
  await tp.goto(`${BASE}social/trailer.html?t=0`); await tp.waitForFunction(() => window.TRAILER_READY === true, null, { timeout: 20000 });
  const drawn = await tp.evaluate(() => { window.__drawn.clear(); for (const t of [2, 6, 10.5, 19.6, 23.5, 28, 33.5, 38]) window.renderAt(t); return [...window.__drawn]; });
  await tctx.close();
  const raceKey = '4|high|4';
  const raceWant = [...new Set(R.filter((r) => `${r.tp}|${r.mode}|${r.parallel}` === raceKey).map((r) => r.recipe))].map((rc) => {
    const rr = R.filter((r) => r.recipe === rc && `${r.tp}|${r.mode}|${r.parallel}` === raceKey); const s = Math.round(med(rr.map((r) => r.seconds)));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · ${med(rr.map((r) => r.score))}/100`;
  });
  const tExact = [String(new Set(R.map((r) => r.recipe)).size), String(R.length), [...new Set(R.map((r) => r.scenarios))].join('/')];
  const tWant = [`${fastest}/${nm}`, `In all ${clean}, our slowest round beat every other recipe's fastest.`,
    `Fastest round in ${fastest} of ${nm} matched settings`, leadTxt, aggTxt, stagTxt, ...raceWant];
  const tMiss = [...tExact.filter((s) => !drawn.includes(s)), ...tWant.filter((s) => !drawn.some((d) => d.includes(s)))];
  check('Trailer: every scene renders without errors, and the numbers it draws equal the JSON', !tMiss.length && !terr.length,
    tMiss.length ? `missing: ${tMiss.join(' | ')}` : `${drawn.length} strings drawn over 8 scenes; race ${raceWant.join(', ')}; ${leadTxt}; ${aggTxt}; ${stagTxt}${terr.length ? '; errors ' + terr.join('; ') : ''}`);
} finally {
  await browser.close();
  server.kill();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} browser checks passed`);
mkdirSync(join(SITE, 'validation'), { recursive: true });
writeFileSync(join(SITE, 'validation', 'e2e-report.json'), JSON.stringify({ passed, total: results.length, results }, null, 2) + '\n');
process.exit(passed === results.length ? 0 : 1);
