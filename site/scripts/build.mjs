#!/usr/bin/env node
// Build the static data bundle for the RiNGSiDE benchmark site.
//
//   node site/scripts/build.mjs          write site/generated/snapshot.js
//   node site/scripts/build.mjs --check  exit 1 if the committed bundle differs from what the snapshot gives
//
// Standard library only. Reads benchmark-package/ and never writes to it. The source JSON/CSV files are
// embedded as their exact original text (the browser parses them itself), so the site cannot silently
// round, rename or drop a value. Everything the build derives from receipts is listed under `extracts`
// and labelled as such in the UI.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');
const ROOT = join(SITE, '..');
const PKG = join(ROOT, 'benchmark-package');
const OUT = join(SITE, 'generated', 'snapshot.js');
const OUT_EXTRACTS = join(SITE, 'generated', 'receipt-extracts.js');
const CHECK = process.argv.includes('--check');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const rel = (p) => relative(PKG, p).split('\\').join('/');
const fail = (msg) => { console.error(`build: ${msg}`); process.exit(1); };

// 1. The prepared snapshot must match SHA256SUMS byte for byte before anything is built from it.
function verifySums() {
  const lines = readFileSync(join(PKG, 'SHA256SUMS'), 'utf8').split('\n').filter(Boolean);
  const bad = [];
  for (const line of lines) {
    const m = line.match(/^([0-9a-f]{64}) [ *](.+)$/);
    if (!m) { bad.push(`unparsable line: ${line}`); continue; }
    const file = join(PKG, m[2]);
    if (!existsSync(file)) { bad.push(`missing: ${m[2]}`); continue; }
    if (sha256(readFileSync(file)) !== m[1]) bad.push(`hash mismatch: ${m[2]}`);
  }
  if (bad.length) fail(`SHA256SUMS verification failed:\n  ${bad.join('\n  ')}`);
  return { files: lines.length, sums_sha256: sha256(readFileSync(join(PKG, 'SHA256SUMS'))) };
}

// 2. Source data, embedded verbatim.
const SOURCES = {
  toolEval: 'bench/results/evidence/tool-eval-current.json',
  baseline37: 'canonical-baseline/bench/results/evidence/tool-eval-current.json',
  historical: 'bench/results/evidence/tool-eval-historical.json',
  roundsCsv: 'tool-eval-rounds.csv',
  speed: 'speed-evidence.json',
  speedCsv: 'speed-cells.csv',
  identities: 'source-identities.json',
  sampled: 'sampled-appendix.json',
  speedManifest: 'evidence/export-manifest.json',
  receiptManifest: 'bench/results/tool-eval-logs/manifest.json',
};

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// 3. Receipt inventory: every exported receipt with its size and SHA-256, so the UI can show hashes and
// mark absent files (for example Knapcio rounds have no console.log) without fetching anything.
function inventory() {
  const dirs = ['bench/results/tool-eval-logs', 'evidence'];
  const files = {};
  const paths = dirs.flatMap((d) => walk(join(PKG, d)));
  paths.push(join(PKG, 'bench/results/tool-eval-logs.tar.gz'), join(PKG, 'SHA256SUMS'));
  for (const p of paths) {
    const buf = readFileSync(p);
    files[rel(p)] = { bytes: buf.length, sha256: sha256(buf) };
  }
  return files;
}

// 4. Per-round extracts from each exported result.json (read-only; values copied, not recomputed).
const STATUS = { pass: 'P', partial: 'p', fail: 'F' };
function extractRound(folder) {
  const d = JSON.parse(readFileSync(join(PKG, 'bench/results', folder, 'result.json'), 'utf8'));
  const cfg = { ...d.config }; delete cfg.scenario_ids;
  const meta = d.metadata || {};
  const sr = d.scores.scenario_results;
  return {
    final_score: d.final_score,
    status: d.status,
    run_id: d.run_id,
    total_scenarios: d.total_scenarios,
    tool_eval_bench_version: d.tool_eval_bench_version,
    config: cfg,
    metadata: Object.fromEntries(['label', 'server_model_id', 'server_model_root', 'engine_name', 'engine_version',
      'max_model_len', 'max_tokens', 'parallel', 'thinking_enabled', 'scenario_selector', 'trials'].map((k) => [k, meta[k] ?? null])),
    scores: Object.fromEntries(['total_points', 'max_points', 'total_tokens', 'median_turn_ms', 'token_efficiency',
      'worst_category', 'deployability', 'responsiveness'].map((k) => [k, d.scores[k] ?? null])),
    categories: (d.scores.category_scores || []).map((c) => [c.category, c.label, c.earned, c.max]),
    // one character per scenario in receipt order: P pass, p partial, F fail
    scenarioStatus: sr.map((s) => STATUS[s.status] ?? '?').join(''),
    scenarioIds: sr.map((s) => s.scenario_id).join(','),
    scenarioPoints: sr.map((s) => s.points),
    scenarioCompletionTokens: sr.map((s) => s.completion_tokens ?? null),
    scenarioSeconds: sr.map((s) => s.duration_seconds ?? null),
    scenarioNotes: Object.fromEntries(sr.filter((s) => s.status !== 'pass' && (s.summary || s.note))
      .map((s) => [s.scenario_id, [s.summary || '', s.note || ''].filter(Boolean).join(' — ').slice(0, 400)])),
  };
}

function scenarioCatalog(folder) {
  const d = JSON.parse(readFileSync(join(PKG, 'bench/results', folder, 'result.json'), 'utf8'));
  return d.scores.scenario_results.map((s) => {
    const m = /scenario=(TC-\d+)\s+([^\n]*)/.exec(s.raw_log || '');
    return [s.scenario_id, m ? m[2].trim() : '', s.expected_behavior || ''];
  });
}

function extractSampled(receipt) {
  const d = JSON.parse(readFileSync(join(PKG, receipt), 'utf8'));
  const cfg = { ...d.config }; delete cfg.scenario_ids;
  const meta = d.metadata || {};
  return {
    final_score: d.final_score, status: d.status, run_id: d.run_id, total_scenarios: d.total_scenarios,
    config: cfg,
    metadata: Object.fromEntries(['label', 'server_model_id', 'server_model_root', 'engine_version', 'max_tokens', 'parallel']
      .map((k) => [k, meta[k] ?? null])),
    scenarioStatus: d.scores.scenario_results.map((s) => STATUS[s.status] ?? '?').join(''),
  };
}

// Speed-window receipts: the recorded appliance (checkpoint, quantisation, drafter), protocol and settings.
// speed-evidence.json keeps the code-full run's settings as raw_settings; the staggered and prose-throughput
// cells come from prose-concurrency.json, whose own settings are extracted here so the UI can show both.
function extractSpeedWindow(win) {
  const out = { window: win, native: {}, sparkdash: null };
  for (const name of ['code-full', 'prose-concurrency']) {
    const p = join(PKG, 'evidence/raw/outputs', win, 'native', `${name}.json`);
    if (!existsSync(p)) continue;
    const d = JSON.parse(readFileSync(p, 'utf8'));
    const run = d.run || {};
    out.native[name] = {
      path: `evidence/raw/outputs/${win}/native/${name}.json`,
      started_at: run.started_at ?? null, finished_at: run.finished_at ?? null,
      label: run.label ?? null, model: run.model ?? null,
      appliance: run.appliance ?? null,
      protocol: d.protocol ? { repository_revision: d.protocol.repository_revision, version: d.protocol.version,
        repository_dirty: d.protocol.repository_dirty, prompts_sha256: d.protocol.prompts_sha256 } : null,
      settings: d.settings ?? null,
    };
  }
  const sp = join(PKG, 'evidence/raw/outputs', win, 'sparkdash.json');
  if (existsSync(sp)) {
    const d = JSON.parse(readFileSync(sp, 'utf8'));
    out.sparkdash = { path: `evidence/raw/outputs/${win}/sparkdash.json`, protocol: d.protocol ?? null,
      model: d.model ?? null, max_tokens: d.max_tokens ?? null, waves: Array.isArray(d.waves) ? d.waves.length : null };
  }
  return out;
}

function build() {
  const sums = verifySums();
  const sources = {};
  for (const [key, path] of Object.entries(SOURCES)) {
    const buf = readFileSync(join(PKG, path));
    sources[key] = { path, bytes: buf.length, sha256: sha256(buf), text: buf.toString('utf8') };
  }
  const toolEval = JSON.parse(sources.toolEval.text);
  const sampled = JSON.parse(sources.sampled.text);
  const rounds = {};
  for (const r of toolEval.rounds) rounds[r.id] = extractRound(r.receipt.folder);
  const extracts = {
    note: 'Copied from each exported receipt at build time by site/scripts/build.mjs; not part of the reviewed summary files.',
    rounds,
    scenarioCatalog: scenarioCatalog(toolEval.rounds[0].receipt.folder),
    sampled: Object.fromEntries(sampled.map((s) => [s.receipt, extractSampled(s.receipt)])),
  };
  // Small, needed at first paint: kept in the core bundle.
  const speedWindows = {};
  const speed = JSON.parse(sources.speed.text);
  for (const row of speed.rows) for (const win of new Set([row.lab_receipt, row.sparkdash_window].filter(Boolean))) {
    if (existsSync(join(PKG, 'evidence/raw/outputs', win))) speedWindows[win] = extractSpeedWindow(win);
  }
  // Scenario order is stored once when every receipt uses the catalog order (checked, not assumed).
  const order = extracts.scenarioCatalog.map((c) => c[0]).join(',');
  for (const x of Object.values(rounds)) if (x.scenarioIds === order) delete x.scenarioIds;
  const bundle = {
    schema: 1,
    package: 'benchmark-package',
    verified: { sha256sums_files: sums.files, sha256sums_sha256: sums.sums_sha256 },
    sources,
    files: inventory(),
    speedWindows,
  };
  const head = '// Generated by site/scripts/build.mjs from benchmark-package/. Do not edit by hand.\n';
  return {
    text: head + 'window.RS_SNAPSHOT = ' + JSON.stringify(bundle) + ';\n',
    extractsText: head + 'window.RS_EXTRACTS = ' + JSON.stringify(extracts) + ';\n',
    sums,
  };
}

const { text, extractsText, sums } = build();
const outputs = [[OUT, text], [OUT_EXTRACTS, extractsText]];
if (CHECK) {
  for (const [file, body] of outputs) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (current !== body) fail(`${relative(ROOT, file)} is stale; run \`node site/scripts/build.mjs\``);
  }
  console.log(`build --check: SHA256SUMS ${sums.files}/${sums.files} OK; generated bundles up to date`);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  for (const [file, body] of outputs) {
    writeFileSync(file, body);
    console.log(`build: wrote ${relative(ROOT, file)} (${(body.length / 1024).toFixed(0)} KiB)`);
  }
  console.log(`build: SHA256SUMS ${sums.files}/${sums.files} OK`);
}
