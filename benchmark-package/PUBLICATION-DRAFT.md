# GLM-5.3 Flash on DGX Spark: recipe comparison

Tool-eval quality versus elapsed time is shown first, followed by RigMark and SparkBench speed. TP4 and TP2 are separate. Dots show every completed temperature-zero round; repeated settings include medians and observed ranges. Single measurements have no estimated variance.

These results compare the measured RiNGSiDE, Mia, Tony2wild and Knapcio configurations and their historical software/checkpoint versions. They do not isolate quantization or a single kernel. Knapcio was ported to the lab’s direct-cabled switchless topology; its native chat template does not honor the thinking-off flag. Truncation, sample counts, missing coverage and settings are retained alongside the results.

This draft has not been published. See README.md before drawing or publishing broader speed or quality conclusions.
