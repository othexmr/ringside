#!/usr/bin/env node
// Assemble the public GitHub Pages tree from site/ and benchmark-package/.
//
//   node site/scripts/pages.mjs --out _site --base-url https://othexmr.github.io/ringside [--noindex]
//   node site/scripts/pages.mjs --out ../ringside --base-url https://othexmr.github.io/ringside --repo
//
// Steps:
//   1. Run build.mjs --check (SHA256SUMS 278/278 and bundles up to date) and validate.mjs (26 data checks).
//      Any failure stops the export.
//   2. Copy site/ and benchmark-package/ side by side, so the site's ../benchmark-package/ receipt links keep working.
//      Add a root index.html that redirects to site/, a 404 page and .nojekyll.
//   3. Switch index.html and the docs to public mode:
//      - drop <!--draft-->…<!--/draft--> blocks;
//      - unwrap <!--public … public--> blocks;
//      - fill %BASE_URL% and %FASTEST%, where %FASTEST% is recomputed here from tool-eval-current.json.
//      --noindex keeps a robots noindex tag.
//   4. Re-verify every copied snapshot file against SHA256SUMS. Refuse leftover markers, files over 100 MB, or more than 1 GB in total.
// --repo also writes .github/workflows/pages.yml, a README, LICENSE (MIT, code), LICENSE-DATA.md (CC BY 4.0, data and media)
// and a .gitignore, for the standalone public repository othexmr/ringside.
// Never included: original-chart-generator/, social/README.md (post copy) and node_modules. The old internal build brief
// (CLAUDE-WEBSITE-PROMPT.md) is refused too, should it ever reappear.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(SITE, '..');
const PKG = join(ROOT, 'benchmark-package');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const OUT = resolve(opt('--out') || join(ROOT, '_site'));
const BASE = (opt('--base-url') || '').replace(/\/+$/, '');
const NOINDEX = args.includes('--noindex');
const REPO = args.includes('--repo');
const SKIP_CHECKS = args.includes('--skip-checks');
const die = (m) => { console.error(`pages: ${m}`); process.exit(1); };

if (!/^https:\/\/[^\s"'<>]+$/.test(BASE)) die('--base-url https://… is required (the public URL the site will live at)');
if (OUT === ROOT || ROOT.startsWith(OUT + sep) || OUT === SITE || OUT.startsWith(SITE + sep) || OUT.startsWith(PKG + sep) || OUT === PKG) die(`refusing to write into ${OUT}`);
if (existsSync(join(OUT, '.git')) && !REPO) die(`${OUT} is a git checkout; pass --repo to export a repository tree into it`);

// 1. checks
if (!SKIP_CHECKS) {
  for (const [script, a] of [['build.mjs', ['--check']], ['validate.mjs', []]]) {
    const r = spawnSync(process.execPath, [join(SITE, 'scripts', script), ...a], { encoding: 'utf8' });
    const last = (r.stdout || '').trim().split('\n').pop();
    if (r.status !== 0) die(`${script} failed:\n${r.stdout}\n${r.stderr}`);
    console.log(`ok  ${script}: ${last}`);
  }
}

// 2. copy (keeping a repo export's .git)
if (existsSync(OUT)) for (const e of readdirSync(OUT)) if (e !== '.git') rmSync(join(OUT, e), { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const skip = new Set([join(SITE, 'node_modules'), join(SITE, 'social', 'README.md')]);
cpSync(SITE, join(OUT, 'site'), { recursive: true, filter: (src) => !skip.has(src) });
cpSync(PKG, join(OUT, 'benchmark-package'), { recursive: true });

// 3. public mode
const te = JSON.parse(readFileSync(join(PKG, 'bench/results/evidence/tool-eval-current.json'), 'utf8'));
const R = te.rounds; const key = (r) => `${r.tp}|${r.mode}|${r.parallel}`;
const med = (xs) => { const s = xs.slice().sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const matched = [...new Set(R.map(key))].filter((k) => { const rr = R.filter((r) => key(r) === k); return rr.some((r) => r.recipe === 'ringside') && new Set(rr.map((r) => r.recipe)).size > 1; });
const fastest = matched.filter((k) => {
  const by = {}; for (const r of R.filter((r) => key(r) === k)) (by[r.recipe] ||= []).push(r.seconds);
  const o = med(by.ringside); return Object.entries(by).every(([rc, v]) => rc === 'ringside' || o < med(v));
}).length;
const FASTEST = `${fastest} of ${matched.length}`;

function publicMode(text) {
  let t = text.replace(/<!--draft-->[\s\S]*?<!--\/draft-->/g, '').replace(/<!--public\n?([\s\S]*?)\n?\s*public-->\n?/g, '$1\n');
  t = t.replaceAll('%BASE_URL%', BASE).replaceAll('%FASTEST%', FASTEST);
  return t;
}
const pages = ['site/index.html', 'site/README.md', 'site/VALIDATION.md'];
for (const f of pages) {
  const p = join(OUT, f); let t = publicMode(readFileSync(p, 'utf8'));
  if (f.endsWith('.html')) {
    t = t.replace(/<meta name="robots"[^>]*>\n?/g, '');
    if (NOINDEX) t = t.replace('<meta name="viewport"', '<meta name="robots" content="noindex, nofollow">\n<meta name="viewport"');
  }
  writeFileSync(p, t);
}
const redirect = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${NOINDEX ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<title>${title}</title>
${body}
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#09071a;color:#efeaff;font:600 18px system-ui,sans-serif}a{color:#ffd36b}</style>
</head>
`;
writeFileSync(join(OUT, 'index.html'), redirect('RiNGSiDE', `<meta http-equiv="refresh" content="0; url=site/">\n<link rel="canonical" href="${BASE}/site/">`) +
  '<body><p>RiNGSiDE benchmark review → <a href="site/">open the site</a></p></body>\n</html>\n');
writeFileSync(join(OUT, '404.html'), redirect('Not found · RiNGSiDE', '') +
  `<body><p>Nothing here. <a href="${BASE}/site/">Back to the ring →</a></p></body>\n</html>\n`);
writeFileSync(join(OUT, '.nojekyll'), '');

if (REPO) {
  writeFileSync(join(OUT, '.gitignore'), '_site/\nnode_modules/\n.DS_Store\n');
  mkdirSync(join(OUT, '.github', 'workflows'), { recursive: true });
  cpSync(join(ROOT, '.github', 'workflows', 'pages.yml'), join(OUT, '.github', 'workflows', 'pages.yml'));
  writeFileSync(join(OUT, 'README.md'), `# RiNGSiDE: GLM-5.3 Flash on DGX Sparks

**Live site: ${BASE}/site/**

RiNGSiDE is our GLM-5.3 Flash recipe for four DGX Sparks in a switchless ring (TP4) and for two Sparks (TP2).
This site compares it with the independently authored MiaAI-Lab, tonyd2wild and knapcio recipes at matched settings:
tool-eval score against completed-round time first, then matched recipe comparisons, then RigMark and SparkBench speed.
Every run, setting, source hash, missing measurement, truncation and receipt is inspectable.

- Recipe: https://github.com/othexmr/GLM-5.3-Flash-NVFP4-2x-4x-DGX-Sparks-RiNGSiDE
- \`benchmark-package/\` is the hash-verified measurement snapshot (\`SHA256SUMS\`, ${Object.keys(sums()).length} files). The site links its receipts in place.
- \`site/\` is the static site: no backend, no analytics, no external requests. See [site/README.md](site/README.md) and [site/VALIDATION.md](site/VALIDATION.md).

Complete-recipe comparison of historical measurements: weights, runtime, drafter, template and topology all differ.
The headline is about round time at matched settings; scores are the same within the round-to-round spread.

Deploys with GitHub Actions: **Actions → Deploy to GitHub Pages → Run workflow**. The workflow verifies the snapshot and data before publishing.

## Credits

- **Recipes:** RiNGSiDE by othexmr (ours); comparison recipes by MiaAI-Lab, tonyd2wild and knapcio, with thanks.
- **Weights and drafters:** zai-org (GLM-5.3 Flash), RedHatAI, NVIDIA and brandonmusic, and incoai (DFlash2, on z-lab's DFlash).
- **Benchmarks:** SeraphimSerapis/tool-eval-bench, alexellis/rigmark and MiaAI-Lab/sparkDash.

## Licence

- **Code** (\`site/\` scripts, styles and markup): MIT. See [LICENSE](LICENSE).
- **Data, charts, social cards and trailer:** CC BY 4.0, except third-party material. See [LICENSE-DATA.md](LICENSE-DATA.md).
- **Fonts:** SIL Open Font License, in \`site/assets/fonts/\`.
`);
  writeFileSync(join(OUT, 'LICENSE'), `MIT License

Copyright (c) ${new Date().getUTCFullYear()} othexmr

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`);
  writeFileSync(join(OUT, 'LICENSE-DATA.md'), `# Data and media licence

Copyright (c) ${new Date().getUTCFullYear()} othexmr

Except where noted below, the following are licensed under the
**Creative Commons Attribution 4.0 International licence (CC BY 4.0)**,
https://creativecommons.org/licenses/by/4.0/ (full text: https://creativecommons.org/licenses/by/4.0/legalcode):

- the benchmark data and receipts in \`benchmark-package/\`;
- the charts, the X/Twitter cards and the trailer in \`site/social/\`;
- the site's written content.

You may share and adapt them for any purpose, provided you give appropriate credit (for example "RiNGSiDE benchmark review, othexmr"), link to the licence, and indicate if changes were made.

**Not covered.** These remain under their owners' own terms:
- material by third parties inside the receipts, including the benchmark suites' scenario text and prompts (SeraphimSerapis/tool-eval-bench, alexellis/rigmark, MiaAI-Lab/sparkDash);
- files that carry their own licence headers;
- the bundled fonts (SIL Open Font License, see \`site/assets/fonts/\`);
- names and marks of the recipes, models and companies mentioned, which are used here only to identify them.

The site's code is MIT-licensed; see \`LICENSE\`.
`);
}

// 4. verify the copy
function sums() {
  const out = {};
  for (const line of readFileSync(join(PKG, 'SHA256SUMS'), 'utf8').split('\n')) { const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/); if (m) out[m[2].replace(/^\.\//, '')] = m[1]; }
  return out;
}
const S = sums(); let okCount = 0; const bad = [];
for (const [f, h] of Object.entries(S)) {
  const p = join(OUT, 'benchmark-package', f);
  if (existsSync(p) && createHash('sha256').update(readFileSync(p)).digest('hex') === h) okCount++; else bad.push(f);
}
if (bad.length) die(`copied snapshot differs from SHA256SUMS: ${bad.slice(0, 5).join(', ')}`);
let total = 0, files = 0; const big = []; const leftovers = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name); if (e.name === '.git') continue;
    if (e.isDirectory()) { walk(p); continue; }
    const s = statSync(p).size; total += s; files++; if (s > 100 * 1048576) big.push(relative(OUT, p));
    if (/\.(html|md)$/.test(e.name) && !relative(OUT, p).startsWith('benchmark-package') && !/social\/(cards|trailer)\.html$/.test(p)) {
      const t = readFileSync(p, 'utf8'); if (/<!--(\/?draft|public)\b|public-->|%BASE_URL%|%FASTEST%/.test(t)) leftovers.push(relative(OUT, p));
    }
  }
})(OUT);
if (big.length) die(`files over GitHub Pages' 100 MB limit: ${big.join(', ')}`);
if (total > 1024 ** 3) die(`site is ${(total / 1048576).toFixed(0)} MB, over the 1 GB Pages limit`);
if (leftovers.length) die(`unresolved draft/public markers in ${leftovers.join(', ')}`);
for (const banned of ['CLAUDE-WEBSITE-PROMPT.md', 'original-chart-generator', join('site', 'social', 'README.md')]) if (existsSync(join(OUT, banned))) die(`${banned} must not be published`);
const idx = readFileSync(join(OUT, 'site/index.html'), 'utf8');
if (/Private review draft/.test(idx)) die('site/index.html still carries the private-draft label');

console.log(`ok  public mode: headline "${FASTEST}", ${NOINDEX ? 'noindex' : 'indexable'}, base ${BASE}/`);
console.log(`ok  snapshot copy ${okCount}/${Object.keys(S).length} files match SHA256SUMS`);
console.log(`ok  ${relative(process.cwd(), OUT) || '.'}: ${files} files, ${(total / 1048576).toFixed(1)} MB${REPO ? ' (repository export with workflow + README)' : ''}`);
