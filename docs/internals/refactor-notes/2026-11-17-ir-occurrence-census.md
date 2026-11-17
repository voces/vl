# IR occurrence census: per-family node counts under the armed shadow (lane H), 2026-11-17

Design §10 counts a family's readiness per occurrence, not per function. Until now the shadow
counted only per function (`fns`, `covered`, `matched`), so no reading said how much of a family
the dual emit had proven.

## What landed

- `occurrenceRows` (`ir_build.vl`), armed only. Each function the shadow builds adds its IR nodes,
  by `irNodeFamily`, plus its slotted reference-rep variables (as `claimable` counts them, as
  `list`), as rows `occ <family> <verdict>`.
  - **matched** or **mismatched**: the function's dual-emit outcome.
  - **unverified**: the verifier refused the function.
  - **uncovered**: the nodes built before the function's first miss.
  - A function whose rep tree moved mid-build counts nothing.
- `ir-shadow.vl` prints one line per family: its occurrences in matched functions and the share
  they are, then the other verdicts. It is never graded; only `mismatch` and `fail` rows are.
- Dual emit compares whole functions, so only an occurrence in a matched function is proven. An
  occurrence in an uncovered function is counted but unproven. A family's legacy dispatcher can
  delete through the op seam when its proven share reaches 100% on the corpus and the
  self-compile.

## Readings (master `abf14795b` plus this PR, fixpoint seed)

Distilled corpus (`cells/` + `named/`): 45,661 functions, 24,100 covered, 24,100 matched.

| family | matched (proven) | share | mismatched | unverified | in uncovered functions |
|---|---:|---:|---:|---:|---:|
| scalar | 69,959 | 85.1% | 0 | 0 | 12,285 |
| control | 140,229 | 85.7% | 0 | 0 | 23,470 |
| call | 15,161 | 91.7% | 0 | 0 | 1,379 |
| global | 3,410 | 69.6% | 0 | 0 | 1,489 |
| list | 56,856 | 72.7% | 0 | 0 | 21,313 |

Self-compile (`vl check --codegen compiler/entry.vl`): 18,396 functions, 5,746 covered, 5,744
matched.

| family | matched (proven) | share | mismatched | in uncovered functions |
|---|---:|---:|---:|---:|
| scalar | 17,052 | 59.3% | 5 | 11,720 |
| control | 47,534 | 63.5% | 18 | 27,278 |
| call | 14,449 | 69.7% | 6 | 6,283 |
| global | 8,608 | 69.6% | 3 | 3,756 |
| list | 18,363 | 59.7% | 12 | 12,390 |
| map | 181 | 56.0% | 0 | 142 |

No family is ready to delete. Every family's unproven occurrences are mostly in functions the
builder does not cover yet; the coverage steps raise the share, not the dual emit. The self-compile has two covered functions whose dual emit does not match. The
gate's `ir shadow` row grades the corpus only, so it does not see them.
