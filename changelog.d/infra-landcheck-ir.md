## Infrastructure (Track F)

- **land-check grades the merged compiler:** where master's `compiler/` moved after a PR's merge base, `scripts/land-check.sh` builds the master+PR tree's compiler with the current seed and runs the IR shadow over `tests/cases` and `tests/vl_ir_shadow_test.ts` on it before LAND-OK. Two PRs green against an older master no longer land a verifier failure only their merge has. Measured cost: about 3.8 CPU-minutes, and nothing when master's compiler did not move.
