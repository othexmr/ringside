# RiNGSiDE: GLM-5.3 Flash on DGX Sparks

**Live site: https://othexmr.github.io/ringside/site/**

RiNGSiDE is our GLM-5.3 Flash recipe for four DGX Sparks in a switchless ring (TP4) and for two Sparks (TP2).
This site compares it with the independently authored MiaAI-Lab, tonyd2wild and knapcio recipes at matched settings:
tool-eval score against completed-round time first, then matched recipe comparisons, then RigMark and SparkBench speed.
Every run, setting, source hash, missing measurement, truncation and receipt is inspectable.

- Recipe: https://github.com/othexmr/GLM-5.3-Flash-NVFP4-2x-4x-DGX-Sparks-RiNGSiDE
- `benchmark-package/` is the hash-verified measurement snapshot (`SHA256SUMS`, 278 files). The site links its receipts in place.
- `site/` is the static site: no backend, no analytics, no external requests. See [site/README.md](site/README.md) and [site/VALIDATION.md](site/VALIDATION.md).

Complete-recipe comparison of historical measurements: weights, runtime, drafter, template and topology all differ.
The headline is about round time at matched settings; scores are the same within the round-to-round spread.

Deploys with GitHub Actions: **Actions → Deploy to GitHub Pages → Run workflow**. The workflow verifies the snapshot and data before publishing.

## Credits

- **Recipes:** RiNGSiDE by othexmr (ours); comparison recipes by MiaAI-Lab, tonyd2wild and knapcio, with thanks.
- **Weights and drafters:** zai-org (GLM-5.3 Flash), RedHatAI, NVIDIA and brandonmusic, and incoai (DFlash2, on z-lab's DFlash).
- **Benchmarks:** SeraphimSerapis/tool-eval-bench, alexellis/rigmark and MiaAI-Lab/sparkDash.

## Licence

- **Code** (`site/` scripts, styles and markup): MIT. See [LICENSE](LICENSE).
- **Data, charts, social cards and trailer:** CC BY 4.0, except third-party material. See [LICENSE-DATA.md](LICENSE-DATA.md).
- **Fonts:** SIL Open Font License, in `site/assets/fonts/`.
