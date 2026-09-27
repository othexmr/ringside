#!/bin/sh
# tool-eval-bench in a serving window (main session, 2026-09-24 23:3x; owner 23:2x "u install it yes", pointing to
# github.com/SeraphimSerapis/tool-eval-bench as the tool evaluation he wants beside llama-benchy).
# Pinned: commit 5381d58954a5ea45a979f29f6143313523c723c8 (MIT), installed with uv into work/tool-eval-bench-5381d589/venv
# (freeze.txt here). Code reviewed before first use: the OpenAI-format tool scenarios talk only to --base-url; the
# optional GSM8K/MMLU/IFEval plugins (Hugging Face datasets server), the perf mode (uvx llama-benchy) and the
# Anthropic/Gemini adapters are NOT used here.
# Runs the 69 core scenarios (TC-01..TC-69) against the window's server (OWN_BASE) with the plan's served model name,
# temperature 0, seed 42, 4 scenarios in parallel, a 300 s request timeout and a 45 min cap. Everything it writes goes
# to OWN_OUT/tool-eval/ (its runs/ reports, its data/ SQLite, result.json). Information only: exit 0 always.
# Usage: run_tool_eval.sh PLAN LABEL
PLAN="$1"; LABEL="$2"
ROOT=$(pwd); T=$ROOT/work/tool-eval-bench-5381d589
OUT="$OWN_OUT/tool-eval"; mkdir -p "$OUT"
MODEL=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['served_model_name'])" "$PLAN")
echo "tool-eval-bench 5381d589: start $(date +%T) model $MODEL base $OWN_BASE label $LABEL" > "$OUT/tool-eval.log"
( cd "$OUT" && timeout 2700 "$T/venv/bin/tool-eval-bench" run --base-url "$OWN_BASE" --model "$MODEL" --backend vllm \
    --temperature 0 --seed 42 --timeout 300 --parallel 4 --no-live --label "$LABEL" \
    --json-file "$OUT/result.json" --output-dir "$OUT/runs" ) >> "$OUT/tool-eval.log" 2>&1
echo "tool-eval-bench: exit $? $(date +%T)" >> "$OUT/tool-eval.log"
exit 0
