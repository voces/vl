## Infrastructure (Track F)

- **`scripts/ready-check.sh`, the one command a lane runs before READY:** it refuses a dirty tree, runs `gate.sh --fast`, checks a Q58 sweep given with `--sweep` (committed, and built under the armed shadow and run where gate and CI do not already grade it), checks the PR's `changelog.d` entry, names a std export change's reviewer need, and prints a block to paste into the READY. `lane-brief.md`'s "Before READY" points to it and drops the hand-run `ir-identity.sh`, which CI's `ci-ir-identity` now runs.
