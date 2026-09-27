#!/usr/bin/env node
// Data validation for the RiNGSiDE review site, independent of the browser code.
//
//   node site/scripts/validate.mjs        prints a report and writes site/validation/data-report.json
//
// Standard library only; reads benchmark-package/ and the generated bundles, writes nothing else.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SITE, '..');
const PKG = join(ROOT, 'benchmark-package');
const read = (p) => readFileSync(join(PKG, p));
const json = (p) => JSON.parse(read(p).toString('utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const results = [];
const check = (name, pass, detail) => { results.push({ name, pass: !!pass, detail }); };

function csv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const tcIds = (x) => (Array.isArray(x) ? x.map((c) => (typeof c === 'string' ? c : c.scenario)) : String(x).match(/TC-\d+/g) || []).join(',');

// 1. Snapshot integrity
const sums = read('SHA256SUMS').toString('utf8').split('\n').filter(Boolean);
let okSums = 0; const badSums = [];
for (const line of sums) { const [h, p] = [line.slice(0, 64), line.slice(66)]; existsSync(join(PKG, p)) && sha(read(p)) === h ? okSums++ : badSums.push(p); }
check('SHA256SUMS verifies the snapshot', okSums === sums.length, `${okSums}/${sums.length} files match${badSums.length ? '; bad: ' + badSums.join(', ') : ''}`);
// In git, also prove the snapshot directories are untouched. The public Pages export has no
// original-chart-generator/, and a plain copy has no git at all; SHA256SUMS above still covers the snapshot there.
const frozen = ['benchmark-package', 'original-chart-generator'].filter((d) => existsSync(join(ROOT, d)));
let inGit = false;
try { inGit = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() === ROOT; } catch { inGit = false; }
if (inGit) {
  let unchanged = null;
  try { execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...frozen], { cwd: ROOT }); execFileSync('git', ['diff', '--quiet', '--cached', '--', ...frozen], { cwd: ROOT }); unchanged = true; } catch { unchanged = false; }
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', ...frozen], { cwd: ROOT }).toString().trim();
  check(`${frozen.map((d) => d + '/').join(' and ')} unchanged in git`, unchanged && !untracked, unchanged && !untracked ? 'no modified, staged or untracked files' : `modified or untracked: ${untracked || 'see git status'}`);
} else {
  check('Snapshot directories unchanged', okSums === sums.length, 'not a git checkout, so the SHA256SUMS verification above is the check');
}
try { execFileSync('node', [join(SITE, 'scripts/build.mjs'), '--check'], { stdio: 'pipe' }); check('Generated bundles are current', true, 'build.mjs --check passed'); }
catch (e) { check('Generated bundles are current', false, String(e.stderr || e.message)); }

// 2. Tool-eval rounds
const te = json('bench/results/evidence/tool-eval-current.json');
const R = te.rounds;
const ours = R.filter((r) => r.recipe === 'ringside');
check('60 main rounds, all temperature-zero 92-case', R.length === 60 && te.settings.temperature === 0 && te.benchmark.scenarios === 92 && R.every((r) => r.scenarios === 92 && r.max_points === 184), `${R.length} rounds; settings.temperature ${te.settings.temperature}; 92 scenarios each`);
check('23 RiNGSiDE rounds: 13 TP4 + 10 TP2', ours.length === 23 && ours.filter((r) => r.tp === 4).length === 13 && ours.filter((r) => r.tp === 2).length === 10, `${ours.length} = ${ours.filter((r) => r.tp === 4).length} TP4 + ${ours.filter((r) => r.tp === 2).length} TP2`);
const perRecipe = Object.fromEntries(['ringside', 'miaai', 'tonyd2wild', 'knapcio'].map((k) => [k, { tp4: R.filter((r) => r.recipe === k && r.tp === 4).length, tp2: R.filter((r) => r.recipe === k && r.tp === 2).length }]));
check('Per-recipe round counts', perRecipe.miaai.tp4 === 9 && perRecipe.miaai.tp2 === 7 && perRecipe.tonyd2wild.tp4 === 13 && perRecipe.tonyd2wild.tp2 === 4 && perRecipe.knapcio.tp4 === 4 && perRecipe.knapcio.tp2 === 0, JSON.stringify(perRecipe));
const cohortMismatch = te.cohorts.filter((c) => R.filter((r) => r.recipe === c.recipe && r.tp === c.tp && r.mode === c.mode && r.parallel === c.parallel).length !== c.completed || c.state !== 'complete');
check('Every cohort complete with its recorded round count', !cohortMismatch.length && te.cohorts.reduce((a, c) => a + c.completed, 0) === 60, `${te.cohorts.length} cohorts, ${te.cohorts.reduce((a, c) => a + c.completed, 0)} rounds${cohortMismatch.length ? '; mismatched: ' + JSON.stringify(cohortMismatch) : ''}`);

// 3. CSV ↔ JSON
const rc = csv(read('tool-eval-rounds.csv').toString('utf8'));
const byRun = new Map(R.map((r) => [r.run_id, r]));
const csvBad = rc.filter((c) => { const r = byRun.get(c.run_id); return !r || c.recipe !== r.recipe || +c.tp !== r.tp || c.mode !== r.mode || +c.parallel !== r.parallel || +c.round !== r.round || +c.score !== r.score || +c.seconds !== r.seconds || tcIds(c.reported_truncation_cases) !== tcIds(r.reported_truncation_cases); });
check('tool-eval-rounds.csv equals the JSON', rc.length === 60 && !csvBad.length, `${rc.length - csvBad.length}/${rc.length} rows equal (score, seconds to full stored precision, settings, run id, truncation ids)`);

// 4. 37-round baseline
const b37 = json('canonical-baseline/bench/results/evidence/tool-eval-current.json').rounds;
const b37same = b37.filter((x) => { const r = byRun.get(x.run_id); return r && JSON.stringify(r) === JSON.stringify(x); }).length;
check('37-round snapshot = 23 RiNGSiDE + 14 Mia, identical to the 60-round file', b37.length === 37 && b37.filter((x) => x.recipe === 'ringside').length === 23 && b37.filter((x) => x.recipe === 'miaai').length === 14 && b37same === 37, `${b37.length} rounds; ${b37same}/37 byte-identical records`);
const b37ours = new Set(b37.filter((x) => x.recipe === 'ringside').map((x) => x.run_id));
check('The 37-round snapshot contains exactly our 23 rounds', ours.every((r) => b37ours.has(r.run_id)) && b37ours.size === 23, `${[...b37ours].filter((id) => byRun.get(id) && byRun.get(id).recipe === 'ringside').length}/23 RiNGSiDE run ids present`);

// 5. Receipts
const resBad = R.filter((r) => sha(read(`bench/results/${r.receipt.folder}/result.json`)) !== r.receipt.result_sha256);
check('Each round result.json matches receipt.result_sha256', !resBad.length, `${60 - resBad.length}/60${resBad.length ? '; bad: ' + resBad.map((r) => r.id).join(', ') : ''}`);
const scoreBad = R.filter((r) => { const d = json(`bench/results/${r.receipt.folder}/result.json`); const sr = d.scores.scenario_results; return d.final_score !== r.score || d.scores.total_points !== r.points || d.run_id !== r.run_id || sr.length !== 92 || sr.filter((s) => s.status === 'pass').length !== r.passed || sr.filter((s) => s.status === 'partial').length !== r.partial || sr.filter((s) => s.status === 'fail').length !== r.failed || d.config.concurrency !== r.parallel; });
check('Summary score/points/pass-partial-fail/concurrency equal each receipt', !scoreBad.length, `${60 - scoreBad.length}/60 rounds agree with their result.json${scoreBad.length ? '; ' + scoreBad.map((r) => r.id).join(', ') : ''}`);
const man = json('bench/results/tool-eval-logs/manifest.json').files;
const manBad = man.filter((m) => sha(read(`bench/results/tool-eval-logs/${m.export}`)) !== m.export_sha256);
check('Tool-eval receipt manifest export hashes', !manBad.length, `${man.length - manBad.length}/${man.length}`);
const sman = json('evidence/export-manifest.json');
const smanBad = sman.filter((m) => sha(read(m.export)) !== m.export_sha256);
check('Speed/sampled receipt manifest export hashes', !smanBad.length, `${sman.length - smanBad.length}/${sman.length}`);
const missingConsole = R.filter((r) => !existsSync(join(PKG, 'bench/results', r.receipt.folder, 'console.log'))).map((r) => r.id);
check('Receipt folders list the files they hold', R.every((r) => r.receipt.files.every((f) => existsSync(join(PKG, 'bench/results', r.receipt.folder, f)))), `all listed files present; rounds without console.log (shown as absent, not hidden): ${missingConsole.join(', ') || 'none'}`);

// 6. Truncation flags against receipts
const trunc = R.filter((r) => r.reported_truncation_cases.length);
const truncDetail = trunc.map((r) => {
  const d = json(`bench/results/${r.receipt.folder}/result.json`);
  const kinds = tcIds(r.reported_truncation_cases).split(',').map((id) => { const s = d.scores.scenario_results.find((x) => x.scenario_id === id); return `${id}:${s ? s.status + '/' + (s.failure_kind || '—') : 'missing'}`; });
  return `${r.id} ${kinds.join(' ')}`;
});
const truncOk = trunc.length === 4 && truncDetail.every((t) => t.includes('reasoning_truncated'));
check('Reported truncations: 4 rounds, each confirmed as reasoning_truncated in its receipt', truncOk, truncDetail.join(' · '));
const otherKinds = [];
for (const r of R) { const d = json(`bench/results/${r.receipt.folder}/result.json`); for (const s of d.scores.scenario_results) if (s.failure_kind && /trunc|budget/.test(s.failure_kind) && !tcIds(r.reported_truncation_cases).split(',').includes(s.scenario_id)) otherKinds.push(`${r.id} ${s.scenario_id} ${s.failure_kind}`); }
check('No unreported reasoning_truncated scenarios', !otherKinds.some((k) => k.includes('reasoning_truncated')), otherKinds.length ? `other budget/truncation kinds (not output-cap reports, left as recorded): ${otherKinds.join(' · ')}` : 'none');

// 7. Gaps
const has = (rec, tp, mode, par) => R.some((r) => r.recipe === rec && r.tp === tp && (!mode || r.mode === mode) && (!par || r.parallel === par));
check('TP2 gaps as documented', !has('knapcio', 2) && !has('tonyd2wild', 2, 'low') && !has('tonyd2wild', 2, 'high', 8) && !has('miaai', 2, 'high', 8) && !has('ringside', 2, 'high', 16) && R.filter((r) => r.recipe === 'tonyd2wild' && r.tp === 2 && r.mode === 'high' && r.parallel === 4).length === 3 && R.filter((r) => r.recipe === 'tonyd2wild' && r.tp === 2 && r.mode === 'max').length === 1, 'Knapcio TP2 none; Tony2wild TP2 = 3 High/C4 + 1 Max/C4; no TP2 C16; only RiNGSiDE at TP2 C8');
check('No Knapcio Low measurement', !has('knapcio', 4, 'low'), 'Knapcio TP4 cohorts: High C4/C8/C16 and Max C4, all singletons');

// 8. Speed
const sp = json('speed-evidence.json');
const sc = csv(read('speed-cells.csv').toString('utf8'));
const rowOf = new Map(sp.rows.map((r) => [`${r.recipe_key}|${r.tp_size}|${r.lab_receipt}`, r]));
let cellOk = 0;
for (const c of sc) {
  const row = rowOf.get(`${c.recipe}|${c.tp}|${c.window}`); if (!row) continue; let v;
  if (['decode', 'agg', 'prose_agg', 'sparkdash'].includes(c.metric)) v = (row[c.metric] || {})[c.cell];
  else if (c.metric === 'cold_s' || c.metric === 'replay_s') v = ((row.prefill_suite || {})[c.cell] || {})[c.metric];
  else v = ((row.staggered || {})[c.cell] || [])[c.metric === 'prefill_first_ttft_s' ? 0 : 1];
  if ((v ?? null) === (c.value === '' ? null : +c.value)) cellOk++;
}
let jsonCells = 0;
for (const r of sp.rows) { for (const k of ['decode', 'agg', 'prose_agg', 'sparkdash']) jsonCells += Object.keys(r[k] || {}).length; jsonCells += Object.keys(r.prefill_suite || {}).length * 2 + Object.keys(r.staggered || {}).length * 2; }
check('speed-cells.csv equals speed-evidence.json', cellOk === sc.length && jsonCells === sc.length, `${cellOk}/${sc.length} CSV cells equal; JSON holds ${jsonCells} cells; ${sc.filter((c) => c.value === '').length} empty cells kept empty`);
check('No TP2 Knapcio speed row', !sp.rows.some((r) => r.recipe_key === 'knapcio' && r.tp_size === 2), `${sp.rows.length} speed rows: ${sp.rows.map((r) => r.id).join(', ')}`);
const nulls = sp.rows.flatMap((r) => Object.entries(r.staggered || {}).flatMap(([c, v]) => v.map((x, i) => (x === null ? `${r.id} C${c} ${i ? 'decode-first' : 'prefill-first'}` : null)).filter(Boolean)));
check('Null staggered values identified (not zeroed)', nulls.length === 2, nulls.join(' · '));
// speed values against the raw RigMark receipts where the summary names a field
let rawChecks = 0, rawBad = [];
for (const r of sp.rows) {
  const p = `evidence/raw/outputs/${r.lab_receipt}/native/code-full.json`; if (!existsSync(join(PKG, p))) continue;
  const d = json(p);
  for (const [depth, v] of Object.entries(r.prefill_suite || {})) {
    const pr = (d.prefill || {})[depth]; if (!pr) continue;
    for (const [k, rk] of [['cold_s', 'cold'], ['replay_s', 'warm_replay']]) { rawChecks++; const raw = pr[rk] && pr[rk].ttft_seconds; if (raw == null || Math.abs(raw - v[k]) > 5e-4) rawBad.push(`${r.id} ${depth} ${k} ${v[k]} vs ${raw}`); }
  }
}
check('RigMark cold/warm TTFT equal the raw code-full receipts (to stored 3 decimals)', !rawBad.length && rawChecks > 0, `${rawChecks - rawBad.length}/${rawChecks} values${rawBad.length ? '; ' + rawBad.join(' · ') : ''}`);

// 9. Identities, appendices
const ids = json('source-identities.json');
check('Source identities: 7 rows, tool-eval suite commit bd35ba91', ids.rows.length === 7 && ids.tool_eval_commit === te.benchmark.commit, ids.rows.map((r) => `${r.recipe} ${r.tp}: ${r.tool_eval_source} / ${r.speed_source}`).join(' · '));
const smp = json('sampled-appendix.json');
const smpBad = smp.filter((s) => { const d = json(s.receipt); return d.config.temperature !== 1 || d.final_score !== s.score || (d.config.extra_params || {}).top_p !== s.top_p; });
check('Temperature-one appendix: 6 observations match their receipts', smp.length === 6 && !smpBad.length, `${smp.length - smpBad.length}/${smp.length} (temperature 1, top_p 0.95, score)`);
const hist = json('bench/results/evidence/tool-eval-historical.json');
check('69-case history kept separate: 2 rounds, no elapsed time', hist.rounds.length === 2 && hist.elapsed_seconds === null && hist.rounds.every((r) => r.max_points === 138), hist.rounds.map((r) => `${r.score}/100 (${r.points}/${r.max_points})`).join(', '));

const passed = results.filter((r) => r.pass).length;
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`);
console.log(`\n${passed}/${results.length} data checks passed`);
mkdirSync(join(SITE, 'validation'), { recursive: true });
writeFileSync(join(SITE, 'validation', 'data-report.json'), JSON.stringify({ passed, total: results.length, results }, null, 2) + '\n');
process.exit(passed === results.length ? 0 : 1);
