# RiNGSiDE benchmark review site

A static, client-side website built from the hash-verified snapshot in `../benchmark-package/`. RiNGSiDE is our recipe and the focus. Mia (MiaAI-Lab), Tony2wild (tonyd2wild) and Knapcio (knapcio) are credited comparison recipes. Nothing here runs a benchmark or contacts a DGX Spark. Live at **https://othexmr.github.io/ringside/**.

## Commands

Everything uses Node 18+ and the standard library. Only the optional browser tests need Playwright.

```sh
node site/scripts/build.mjs            # verify SHA256SUMS (278 files), then regenerate site/generated/*.js
node site/scripts/build.mjs --check    # fail if the committed bundles differ from the snapshot
node site/scripts/serve.mjs            # http://127.0.0.1:8000/site/  (serves the repo root, localhost only)
node site/scripts/validate.mjs         # 26 data checks → site/validation/data-report.json
node site/scripts/e2e.mjs              # 40 browser checks → site/validation/e2e-report.json
node site/scripts/e2e.mjs --screenshots   # also refresh site/validation/screenshots/
node site/scripts/social.mjs           # X/Twitter cards → site/social/out/*.png
node site/scripts/trailer.mjs          # 40 s trailer → site/social/out/ringside-trailer-1920x1080.mp4 (needs ffmpeg)
```

`site/index.html` also opens straight from disk (`file://`). Only two things need the local server: inline receipt viewing in the run inspector, and the "re-hash receipts in this browser" button, because browsers block `fetch` from `file://`. Receipt links work either way.

To run the browser tests elsewhere, run `npm install` in `site/` (installs Playwright) or set `PLAYWRIGHT_MODULE` to a Playwright `index.mjs`. In this container the global Playwright and the preinstalled Chromium are used.

## Publishing on GitHub Pages

`node site/scripts/pages.mjs --out _site --base-url https://<owner>.github.io/<repo>` assembles the public tree. The steps:
- It first runs `build.mjs --check` and `validate.mjs`, and stops on any failure.
- It copies `site/` and `benchmark-package/` side by side, so receipt links keep working, and adds a root redirect to `site/`, a 404 page and `.nojekyll`.
- It fills in `index.html`'s canonical, Open Graph and X-card tags (kept in a ` …
` block because they need the final URL). The "N of M" headline in those tags is recomputed from the JSON.
- It re-verifies all 278 copied snapshot files against `SHA256SUMS`.
- It publishes only the site and the snapshot: not `original-chart-generator/` or `social/README.md` (post copy, kept in the source repository). `--noindex` keeps search engines out.

`.github/workflows/pages.yml` runs the same command and deploys the result. It runs only when started by hand from the Actions tab, with an "indexable" switch, after Settings → Pages → Source is set to **GitHub Actions**.


This repository is the public export of the RiNGSiDE review: the site and the measurement snapshot, regenerated from the RiNGSiDE source with `pages.mjs --repo`. To deploy, run **Actions → Deploy to GitHub Pages → Run workflow**; the workflow runs `pages.mjs` and publishes `_site/`. The base URL comes from `actions/configure-pages`, so a custom domain needs no code change.

## How it is built

- **No runtime dependencies, no backend, no telemetry.** The page uses hand-written SVG charts and a canvas glitter engine in plain scripts (`assets/js/`), loads everything from local files, and makes no external requests. Fonts are bundled locally in `assets/fonts/` under the SIL Open Font License (Bricolage Grotesque, JetBrains Mono). The external links are the recipe repository, Brandon's Hugging Face page and the speculative-prefill example cited in the interpretation rules.
- **Data stays verbatim.** `scripts/build.mjs` embeds the original JSON/CSV **text** (`tool-eval-current.json`, `tool-eval-rounds.csv`, `speed-evidence.json`, `speed-cells.csv`, `source-identities.json`, `sampled-appendix.json`, the 69-case history, the 37-round snapshot and both receipt manifests) into `generated/snapshot.js`. The browser parses them itself, so no value is rounded or rewritten in transit. The build also records the size and SHA-256 of every receipt file (246 files).
- **Receipt extracts** (per-scenario outcomes, served model, engine, request parameters, and the speed windows' recorded checkpoint, quantisation, drafter and settings) are copied from the exported receipts into `generated/receipt-extracts.js`, which loads lazily after first paint, and into `snapshot.js`. The UI labels them as receipt-derived.
- **Receipts are linked in place** (`../benchmark-package/...`), never copied. `benchmark-package/` and `original-chart-generator/` are unchanged.

## Reading order and what is on the page

1. **The main event: quality × speed, everyone in the ring.** The headline is computed from the rounds at load time, never typed in:
   - RiNGSiDE had the **fastest median round in 8 of 8 matched settings**, and in all 8 even our slowest round finished before every other recipe's fastest.
   - The lead over the next-fastest recipe is **1.30–1.59× on TP4** and 1.03–1.09× on TP2.
   - Our score is **top or tied-top in 6 of 8**, and at most 1 point behind in the other two. That gap is within the 5-point round-to-round spread, and the page says so.

   Below the headline, the **round-time race** shows one bar per recipe per matched setting, with every round as a dot on its bar. The **quality × time scatter** has TP4 and TP2 panels and shows all four recipes (effort as shape for everyone), with filters for recipe, effort and concurrency; it can narrow to RiNGSiDE only, showing our 23 rounds (13 TP4, 10 TP2). The section ends with our own concurrency cohorts and cohort table.
2. **Every bout, up close.** Recipe and weight cards tagged `receipt` / `repo` / `team`. A coverage matrix across 10 settings × 4 recipes shows medians, ratios to RiNGSiDE, truncation flags and hatched gaps. Small-multiple panels have filters for TP, effort, concurrency and recipe.
3. **Speed.** RigMark (decode, cold TTFT, warm replay TTFT, code and prose aggregate throughput, both staggered directions) and SparkBench (per-stream decode across four workloads) sit on separate tabs, filtered by TP and recipe. Speed-window cards list their receipts, hashes and recorded settings.
4. **Scorecards (evidence).** Live integrity checks, exact source identities, interpretation rules and the tool-eval settings. Also here: every run (sortable, filterable, CSV export of the current view), a 60×92 scenario-outcome grid, all 309 speed cells, the temperature-one and 69-case appendices, the 37-round snapshot note, downloads and credits.

Every plotted round opens a **run inspector** (click, or Enter on a focused mark) with its settings, source identity, receipt-recorded configuration, 92-scenario strip, file hashes and inline receipt viewer. Deep links use `#run/<id>`, for example `#run/ours-tp4-high-c16-2`.

## Look and feel: Fight Night

- **The arena.** The dark theme is a midnight disco arena; the light theme is "daylight glitter" in pastels; the hero is dark in both. The hero shows a mirror ball hanging inside the four-Spark ring, with the TP2 pair beneath it, sweeping spotlights and a holographic-foil wordmark whose two i-dots are TP4 and TP2 gems. Sections are rounds: Round 1 · Our corner, Round 2 · Sparring partners, Round 3 · Speed, Final bell · Scorecards. The hero scorecards are tickets, and a marquee runs snapshot facts computed from the data.
- **The mirror ball** (`assets/js/discoball.js`) is drawn on a canvas. It has about 420 tiles in 18 latitude bands on a tilted axis and spins once every 18 s, lit by four off-axis coloured lights (white key, blue, pink and gold). Each tile's colour comes from its facing: diffuse shading plus a sharp specular term, so tiles flash as they turn into a light. The brightest flashes throw four-point starburst glints. The ball also throws coloured light specks across the hero that sweep with the spin, sways gently on its string, and speeds up for a moment when you click the wordmark. Under `prefers-reduced-motion`, or with glitter off, it holds one still frame. The canvas is `aria-hidden`, has `pointer-events: none`, and pauses off-screen.
- **Glitter** (`assets/js/glitter.js`) has four parts: a twinkling page sky behind the glass panels, a denser party layer inside the hero, a sparkle trail that follows the pointer, and bursts when you click RiNGSiDE marks, scorecards or the wordmark (the wordmark also makes it rain glitter). Sparkles are cached glowing sprites, so the effect stays cheap. It is decoration only: the canvases are `aria-hidden` with `pointer-events: none`; the animation loop stops when the tab is hidden; and the hero layer pauses off-screen. Under `prefers-reduced-motion` the glitter holds still and there is no trail, burst or rain, and forced-colors mode hides it. The **✦ Glitter** toggle in the top bar switches it off, and the choice is remembered per viewer.
- **Charts.** RiNGSiDE marks are filled and glow, in **TP4 electric blue** or **TP2 hot pink** (dark `#4a8cff`/`#f04d93`, light `#2f6bff`/`#e2337f`). Both pairs pass the data-viz palette checks in both themes: lightness band, chroma, colour-vision separation of at least 16 ΔE all-pairs, and contrast. Shape encodes effort: High ●, Low ■, Max ◆. Medians and single rounds carry a twinkling sparkle. Marks pop in and RiNGSiDE lines draw in with a gradient wash. Comparison recipes stay neutral ink with monogram tokens (**M**, **T**, **K**) and distinct dashes, so RiNGSiDE stays in front and gold/holographic colour never encodes data.
- **Encoding rules are unchanged.** Faint marks are individual rounds. An outlined mark with whiskers is a repeated cohort's median and observed range (not a confidence interval). A solid mark is a single round. ★ marks a reported output-cap truncation. ∅ marks a value recorded as null. Hatching marks a setting that was not measured.

## X/Twitter trailer and graphics

`social/` holds post-ready drafts: a 40-second 1920×1080 trailer with an original synthesised soundtrack (`scripts/soundtrack.mjs`, no samples), a poster frame, and six cards (hero, race, scatter and speed at 16:9; square; profile header). Every number on them is computed from the snapshot by the site's code, and the e2e suite checks them against the JSON. [`social/README.md`](social/README.md) has the specs, a draft thread, alt text, a claims ledger and wording rules. **Nothing has been posted**; posting is the owner's call.

## Sources on the recipe cards

Each fact on the "who's in each corner" cards is tagged with where it came from:
- `receipt`: the packaged benchmark receipts or evidence JSON.
- `repo`: our recipe repository [othexmr/GLM-5.3-Flash-NVFP4-2x-4x-DGX-Sparks-RiNGSiDE](https://github.com/othexmr/GLM-5.3-Flash-NVFP4-2x-4x-DGX-Sparks-RiNGSiDE), read at `6606f76`. It contributes the base model zai-org/GLM-5.3-Flash, the incoai DFlash2 drafter `7d74cdd8`, the NVIDIA tokenizer, the engine, and the credits.
- `team`: stated by the RiNGSiDE team; not recorded in the packaged receipts or the recipe repository.

The measured runs used lab image `017fd0ba`; the site never presents repository HEAD as the measured build.

See [VALIDATION.md](VALIDATION.md) for exactly what was checked.
