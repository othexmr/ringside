# Validation record

Run on 2026-09-27 in the review container, and re-run after the "Fight Night" redesign (glitter, new palette, bundled fonts), the head-to-head charts, and the mirror ball and X assets: Node 22.22.2, Playwright 1.56.1 with headless Chromium. No benchmark was run, no DGX Spark was contacted, and nothing was deployed or published. Machine-readable results: [`validation/data-report.json`](validation/data-report.json) and [`validation/e2e-report.json`](validation/e2e-report.json).

## Snapshot preserved

- `benchmark-package/SHA256SUMS`: **278/278 files OK**. Checked with `sha256sum -c` and again inside `build.mjs` and `validate.mjs`.
- `git diff` shows `benchmark-package/` and `original-chart-generator/` unmodified, with nothing staged or untracked. All new work is in `site/`, plus the root `README.md`, `.gitignore` and `.github/workflows/pages.yml`. The recipe repository was cloned read-only outside this repo to verify credits; nothing was pushed to it.
- `build.mjs --check` confirms the committed `generated/` bundles are byte-for-byte what the snapshot produces.

## Data checks: `node site/scripts/validate.mjs` → 26/26 pass

This is an independent Node implementation and shares no code with the browser.

| Check | Result |
|---|---|
| Main rounds | 60, all temperature 0, 92 scenarios, 184 points available |
| RiNGSiDE rounds | **23 = 13 TP4 + 10 TP2** |
| Per recipe | Mia 9 TP4 + 7 TP2 · Tony2wild 13 TP4 + 4 TP2 · Knapcio 4 TP4 + 0 TP2 |
| Cohorts | 28, all complete, round counts equal to `completed` |
| `tool-eval-rounds.csv` ↔ JSON | 60/60 rows equal (score, seconds at full stored precision, settings, run id, truncation ids) |
| 37-round snapshot | 37 = 23 RiNGSiDE + 14 Mia, 37/37 byte-identical records in the 60-round file, all 23 of our run ids present. Not labelled as "37 of ours". |
| Receipts | 60/60 `result.json` match `receipt.result_sha256`. 60/60 summaries equal their receipt (score, points, pass/partial/fail, run id, concurrency). Tool-eval manifest 215/215, speed/sampled manifest 27/27. |
| Missing receipt files | The 4 Knapcio rounds have no `console.log`. The inspector and runs table show it as absent. |
| Truncation | Exactly 4 flagged rounds, each confirmed as `reasoning_truncated` in its receipt: `ours-tp4-high-c16-2` TC-88, `knapcio-tp4-high-c4-1` TC-46, `knapcio-tp4-high-c8-1` TC-46, `knapcio-tp4-high-c16-1` TC-62. No unreported `reasoning_truncated` scenario exists. |
| TP2 gaps | No Knapcio TP2. Tony2wild TP2 = 3 High/C4 + 1 Max/C4. No TP2 C16. Only RiNGSiDE at TP2 C8. No Knapcio Low. |
| `speed-cells.csv` ↔ `speed-evidence.json` | 309/309 cells equal; the JSON holds exactly 309 cells; the 2 empty cells (Mia decode-first at 6, TP4 and TP2) stay empty |
| Speed vs raw receipts | 50/50 cold and warm-replay TTFT values equal the raw `code-full.json` `ttft_seconds` |
| Source identities | 7 rows, suite commit `bd35ba91…`, rendered verbatim |
| Appendices | 6/6 temperature-one observations match their receipts (T 1, top_p 0.95, score). The 69-case history has 2 rounds, 96/100 (133/138), with no elapsed time. |

## Browser checks: `node site/scripts/e2e.mjs` → 40/40 pass

The charts are validated against the source values, not only the DOM. For every plotted round, the test reads the chart's own axis tick labels, reconstructs the linear scales, and checks that the mark's centre sits within **0.75 px** of `(seconds / 60, score)` from the JSON.

- **Headline claims:** the test recomputes them from the JSON and checks they match the page. RiNGSiDE had the fastest median round in 8/8 matched settings (settings where RiNGSiDE and at least one other recipe ran), and its slowest round beat every other recipe's fastest in 8/8. The hero line and the callouts show exactly those numbers.
- **Round-time race:** all 26 bars equal the JSON median, or the single value for singletons, in both time and score. RiNGSiDE's bar is the shortest in every setting.
- **Section 01 scatter:** the default C4 view shows 41 rounds from all four recipes across the TP4 and TP2 panels. With C6/C8/C16 on, it shows **all 60**; with only RiNGSiDE selected, **our 23** (13 TP4, 10 TP2). Values, pixel positions and accessible labels were checked for every mark. The cohort table has 9 cohorts, and the two singletons are labelled "single".
- **Section 02:** **all 60** rounds sit at their data positions across 10 matched-setting panels. The TP filter (39 marks) and recipe filter (35 marks) were rechecked. The coverage matrix is **40/40 cells** correct against JSON medians or single values, and all 12 not-measured cells are hatched rather than shown as zero.
- **Section 03:** every plotted RigMark point equals `speed-evidence.json`: TP4 7 charts / 127 points, TP2 7 charts / 68 points, line positions within 0.75 px. SparkBench TP4 has 64 points and TP2 48. Knapcio has no TP2 point. Mia's null decode-first value is drawn as `M∅`, not 0.
- **Section 04:** the tables finish progressive rendering (60 rounds, 309 speed cells). The in-browser integrity panel passes 11/11. The scenario grid holds 60 × 92 = 5,520 cells.
- **Interaction and keyboard:** Space toggles a filter chip. Enter on a focused chart mark opens the run inspector with focus inside, and Escape closes it. Arrow keys switch the RigMark/SparkBench tabs. The deep link `#run/ours-tp4-high-c16-2` opens with TC-88, the receipt-hash match, lab plan `92817b8d` and a 92-cell scenario strip.
- **Viewports and themes:** at 1360 px light and dark, 768 px light, and 390 px light and dark, there is no horizontal page scroll, all 60 matched marks are correctly positioned, and the console has no errors.
- **Glitter:** all three glitter canvases are `pointer-events: none` and `aria-hidden`, and glitter is on by default. A pointer trail and a wordmark click spawned 178 live particles in the test. A real mouse click on a chart mark still opens the inspector through the glitter layers. The toggle switches glitter off, persists across reload, and stops bursts (0 particles). Under `prefers-reduced-motion`, trail, burst and rain spawn **0** particles and CSS animations are neutralised.
- **Disco ball:** the `#disco` canvas is `aria-hidden` and `pointer-events: none`. Between two samples 600 ms apart its pixels change, so it spins. A wordmark click speeds up its animation clock about 5× (0.96 → 4.69), and the boost then eases off. Under `prefers-reduced-motion` the samples are identical and the clock does not move, so it holds a still frame. Both states draw a lit ball, with more than 1,000 lit sample points.
- **X cards:** the test renders all six cards at their exact size. For each card it checks:
  - nothing overflows the frame, and the page throws no errors;
  - the hero, square and header show the recomputed `8 of 8`, `8/8` and TP4 `1.30–1.59×`;
  - every race-card bar equals its JSON median or single value, with one bar per recipe and setting (18 bars across the 5 TP4 settings);
  - the speed card shows `346` tok/s and `2.8 s`, from `speed-evidence.json`.
- **Trailer:** the test hooks `fillText`/`strokeText` and renders one frame from each of the 8 scenes. It then checks that the drawn strings include:
  - exactly `4`, `60` and `92` in the stats scene;
  - the recomputed `8/8`, the "In all 8…" line and the end-card claim;
  - the TP4 lead range, `346 tok/s` and `2.8 s`;
  - all four race labels (`6:22 · 91/100`, `8:16 · 89/100`, `11:11 · 90/100`, `19:19 · 91/100`), recomputed as JSON medians.
- **Other:** The site opens directly from `file://` with charts, tables and extracts loaded and no errors. Accessibility basics pass: 122 chart marks all labelled, no unnamed buttons, no images without alt text, one `h1`, `lang="en"`. There are no external script or style requests.

## Visual inspection (desktop and mobile)

Screenshots are in [`validation/screenshots/`](validation/screenshots/): desktop 1360 px light and dark, tablet 768 px, and mobile 390 px light and dark. They cover the hero, the section 01 chart, the matrix, the RigMark grid, recipe cards, matched panels, the integrity card, the scenario grid and the inspector. I inspected them and fixed what they showed:

- Recipe-card label columns collapsed long values into one-character columns. Values now sit under their labels in a 2×2 grid.
- The wordmark wrapped onto two lines. It now stays on one line at every width.
- A RiNGSiDE end label collided with the Knapcio token in the decode-first chart. The label now moves below the point when crowded.
- A matrix header rendered "RiNGSiDE" as "RINGSIDE". Headers now keep the brand casing.
- A gap label implied which Tony2wild TP2 rounds had been planned. It now says only "Not measured · TP2 campaign owner-stopped".

The redesign's data colours were checked with the data-viz palette validator. TP4 electric blue and TP2 hot pink pass every check against the new surfaces: dark `#4a8cff`/`#f04d93` on `#1a1634`, and light `#2f6bff`/`#e2337f` on `#fffdf9`, with all-pairs colour-vision ΔE of 16–20 and normal-vision ΔE of about 30. No four-hue palette passed the all-pairs checks, so comparison recipes remain neutral ink with a monogram, a dash pattern and a label; gold and holographic colour are decoration only.

Redesign fixes found by inspecting renders:
- The dotless-ı letters vanished inside the gradient-clipped wordmark (Chrome paints positioned children in their own layer), so they now get their own text clip.
- The gem dots were moved onto the ı stems.
- Per-frame canvas `shadowBlur` stalled rendering, so glitter now draws pre-rendered glowing sprites.
- The ambient sky was hidden behind the hero's opaque background, so a hero-specific layer was added.
- `requestIdleCallback` starved under continuous animation and delayed the receipt extracts, so it now has a 1.2 s timeout.

## Trailer and graphics (visual and media checks)

- `ringside-trailer-1920x1080.mp4` was probed and fully decoded with ffmpeg: 1,200 frames, 40.00 s, 1920×1080, 30 fps, H.264 High in yuv420p, AAC-LC 44.1 kHz stereo, faststart, about 3.6 Mb/s, and no decode errors. The audio sits at a mean of −17.3 dB and a peak of −2.4 dB.
- I inspected a nine-frame contact sheet across all scenes and every card PNG, and fixed what they showed:
  - a Knapcio race label ran off the frame;
  - the footnote overflowed;
  - the scatter legend collided with the axis, and RiNGSiDE labels collided with marks;
  - "same settings" is now "matched settings";
  - the race clock now rounds like the labels;
  - the race card is split into two panels so its labels fit;
  - the mirror ball's highlights formed a face, so the lights are now asymmetric.
- The header keeps its text in the upper-left band, clear of the avatar and X's mobile crop.
- Mobile top bar: the section nav scrolls sideways at 390 px. It now fades at its right edge, so a partly hidden link reads as scrollable rather than clipped.

## Evidence notes and limitations

- **A team/receipt discrepancy is shown, not resolved.** The RiNGSiDE team describes Tony2wild as an NVIDIA checkpoint with an offline NVFP4 dense conversion. That matches the **TP4** speed receipt (NVIDIA `423acf37` plus the publisher's lane-A conversion, lab-pinned DFlash2 `7d74cdd8`, K7). The **TP2** speed receipt instead records `RedHatAI/GLM-5.3-Flash-NVFP4` identical to `18d55bfd`, "as shipped by the recipe". Tony2wild's tool-eval receipts record only the served name `glm-5.3-flash` and path `/models/glm-5.3-flash-nvfp4`. The recipe card shows all three.
- **Team-only details** are tagged `team` on the recipe cards, because the packaged receipts do not state them. They are: RiNGSiDE's "mixed dense FP8/NVFP4 runtime paths"; Knapcio's KDA MXFP8, block-128 FP8 MLA/shared projections and retained BF16 tensors; and Knapcio's FP8-converted DFlash2 decoder. The Knapcio receipt says "NVIDIA NVFP4 with upstream lossless8 conversion; FP8 drafter bf582e4e". The base-model credit (zai-org/GLM-5.3-Flash), the RiNGSiDE drafter (incoai/GLM-5.3-Flash-DFlash2 @ 7d74cdd8, DFlash by z-lab), the NVIDIA tokenizer, the engine and the "built on" credits come from our recipe repository at `6606f76`. They are tagged `repo`, and the repository is later than the measured lab image `017fd0ba`. The repository's comparison table independently confirms that the Tony2wild TP2 arm loaded RedHatAI 18d55bfd.
- **Prefill:** warm replay is labelled as a cached-prefix measurement (RiNGSiDE plans document prefix-cache retention and a replay boundary). No receipt documents speculative prefill, so it is left unknown. The external speculative-prefill example is cited as not a RiNGSiDE measurement.
- **Two `budget_exceeded` scenarios** (`ours-tp2-high-2` TC-62 and `ours-tp4-high-c16-2` TC-62) are turn-budget outcomes in the receipts, not reported output-cap truncations. They appear as recorded in the scenario grid and inspector and are not added to the ★ flags.
- **Missing fields are shown as missing.** The 23 rounds added after the 37-round snapshot have no `started`/`finished` in the summary; the run id carries the UTC start. Several speed rows have no `sparkdash_rounds`; the page shows "not stated (speed-cells.csv lists 1)". Mia and Tony2wild prose throughput is not in the reviewed speed table.
- **Speed x-axes are categorical** (concurrency levels and prompt depths are evenly spaced), and each chart says so. Each chart also lists the levels each recipe ran.
- **Testing limits:** checks ran in headless Chromium only. Firefox, Safari, real phones, screen readers, forced-colors mode and print were not exercised; their CSS is present but untested. Inline receipt viewing and in-browser re-hashing need the local server, and the page says so under `file://`.
- **Glitter is decorative, and its cost varies by device.** Canvas work is bounded: at most 380 hero and 200 page sprites, 700 live particles, a loop that stops when idle or hidden, and a hero layer that pauses off-screen. Frame rate was not profiled on real phones.
- **How the headline is framed.** The claim is about round time at matched settings, where the evidence is unambiguous: no range overlaps in any of the 8 settings. For scores the page claims only "the same scores". RiNGSiDE is top or tied-top in 6/8 and at most 1 point behind in 2/8, which is inside the observed 5-point spread between rounds of the same setting. Several comparison cohorts are single rounds. These are complete recipes: weights, runtime, drafter, template and topology all differ.
- **Trailer and cards are drafts.** Nothing was uploaded or posted. X's own re-encoding and cropping were not tested, because that would require uploading.

- **Publication:** on 2026-09-27 the owner approved publishing this site and the snapshot. It is licensed MIT (code) and CC BY 4.0 (data and media), and it is indexable. The recipe cards keep the `team`-tagged details, marked as the team's own statements.
