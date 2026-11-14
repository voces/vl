## Infrastructure (Track F)

- **fuzz-nightly, proposed nightly:** one `fuzz-sweep.sh` over every leg at 50 seeds on a 4-vCPU runner, each leg gating, red only on an unsound finding no open row files (`--filed scripts/fuzz-filed.txt`; `--gate-all`); row drafts ship in the artifact.
