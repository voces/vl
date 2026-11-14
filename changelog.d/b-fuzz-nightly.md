## Infrastructure (Track F)

- **fuzz-nightly, proposed nightly:** one `fuzz-sweep.sh` over the four legs at 50 seeds (about 7-9 min on a 4-vCPU runner), every leg gating, red only on an unsound finding no open row files (`--filed scripts/fuzz-filed.txt`); row drafts ship in the artifact. The 50-seed triage filed D16314-D16317 and named set `fuzz-2026-11-14b`.
