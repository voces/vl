## Infrastructure (Track F)

- **The sweep's oracle step stops failing every labelled PR:** `oracle.ts recording` now reads the distilled manifests, so a known `runs but wrong value` cell (the oracle prints the expectation, the compiled program does not) is COMPILED-BAD, not a new disagreement. With `--base` it also forgives a disagreement the base recording already has; `sweep.yml` passes `out/base.jsonl`.
