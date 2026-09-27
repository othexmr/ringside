# Recipe comparison — unpublished review package

Main charts contain 60 completed temperature-zero, 92-case tool-eval rounds. The six temperature-one observations are retained separately in sampled-appendix.json and are never pooled into those medians. Knapcio TP2 quality remains unmeasured. Tony TP2 contributes three High/C4 and one Max/C4 result; its owner-stopped parent and ten unrun planned rounds remain explicit. Earlier 69-case results only appear in the separate history variants.

Open index.html together with style.css. It now leads with RiNGSiDE's exact 37-round TP4/TP2 chart and speed chart from the established generators, followed by the four-recipe comparisons. The visible C4 summary and source-identity table keep our results and the distinct quality/speed commits or lab plans in view. SVGs are vector exports suitable for further layout. Source CSVs and redacted benchmark receipts are included. Hover plotted marks for precise values; open their links for tool-eval receipts.

## Reproduce locally

`python3 -B render.py` recreates the six four-recipe SVGs, the exact original tool-eval chart pair, HTML and CSVs using the included chart generators. The original speed chart pair is copied byte-for-byte from its reviewed snapshot; its historical source files are not reconstructed here. Standard library only, no hardware or network. `SHA256SUMS` binds this prepared snapshot. Original source hashes and redacted export hashes are distinguished in the manifests.

## Interpretation

- Scores are benchmark outcomes, not a universal model-quality rating. Different checkpoints, runtimes, drafters and templates make this a recipe comparison.
- Tool time is a completed 92-case round, excluding boot, preparation and queue. Historical values are second-resolution phase times; newer process receipts retain subsecond precision.
- Every repeated temperature-zero cohort has individual runs plus coordinate-wise median/range, not confidence intervals. Knapcio and Max cohorts are singletons.
- Preserve reported TC-46/TC-62 Knapcio High truncations and RiNGSiDE C16 truncation. No reported truncation does not prove no cap exhaustion.
- Tool-eval uses RedHat weights for RiNGSiDE TP4 and TP2. The historical TP2 speed profile uses NVIDIA weights. Do not join these into a single identical-config quality/speed claim.
- RiNGSiDE TP4 quality used lab plan `92817b8d`, whereas the historical speed window used plan `89dfef84`. RiNGSiDE TP2 quality used plan `b80911ec`, whereas the historical speed window used plan `69ad74fc`. A lab plan hash is not a Git commit. Mia quality used recipe `70b2f332` and historical speed used `7cded8e`; Knapcio's measured recipe used `dddb0347`.
- Knapcio is the measured dddb0347 switchless transport port. Its NVIDIA native template ignores the thinking-off flag; equivalent effective thinking behavior remains unproved. The later fork branch also contains upstream changes and is not this measured runtime.
- SparkBench uses the retained 400-output-token reproduction, C1/2/3/4, four workloads. RigMark metrics are separate: decode, cold/warm TTFT, aggregate end-to-end throughput, and both staggered directions. The historical recipes retain their original settings/sample counts and workload coverage.
- Parent campaign cancellation/failure is retained for Tony and Knapcio. Completed clients and clean cleanup are reviewed independently; parent status is not relabelled successful.

## Before publication

Owner approval is still required. Review exact recipe/config/date labels and the native-template caveat, inspect redactions and all charts, and select where to publish. No upload, public commit, PR, release or social post was performed by this chart task.

Benchmark credit: SeraphimSerapis/tool-eval-bench, alexellis/rigmark and MiaAI-Lab/sparkDash. Recipe credit: othexmr, MiaAI-Lab, tonyd2wild and knapcio. Existing source license headers remain intact.
