# The self-compile fuel ratchet gets a per-PR tier and a ledger, 2026-11-15

Lane P. The L2 tripwire (`scripts/self-compile-time.sh`) failed only past 1.5× its baseline.
Between #8053 and master `3d526470a` the self-compile went from 83.20G to 85.99G of guest fuel
(+3.36%), peaking at 87.14G, and no gate fired.

## The attribution

Fixpoint seeds on both sides, each commit compiling its own `compiler/` from the checkout root,
over the 57 compiler-touching first-parent merges after #8053. Every fifth merge was sampled, and
every interval that moved at least 0.3% was bisected to one merge.

| merge | L2 step | mechanism |
| --- | ---: | --- |
| #8072 `b45a06ef3` | +2.72% | `tyTestMemberFit` / `tyTestMeet` / `tyTestIsMember` (the one type-test predicate) ask `sameVariantTy`, a mutual `assignable`, per member pair on every test. 1.8% inclusive CPU on the self-compile. `assignable`'s pair memo is cleared after each top-level call (D9930), so record pairs are re-related on every test. |
| #8080 `ce2748443` | +0.98% | `recPartFitArm` runs on every union `is` narrowing and asks the same predicate per member. |
| #8115 `d9f498cf9` | +0.35% | the place-class engine; not profiled |
| #8114 `2c9ecbde3` | −2.05% | the bank presence columns |
| `fa3b0e83b..a2e10b45b` | +0.35% | spread; no merge reaches 0.3% |
| the other ~50 merges | ≈ +1.4% | each under 0.3% |

A memo of the type-test pair is the natural fix for the two largest steps. It was measured and
not built: the family is 1.8% of the self-compile's CPU samples, and a perfect memo stays inside
the ±2% noise of a median-of-10 CPU reading on this VM.

The proposal to grade CI on the optimized (`optimize-seed.sh`) seed was also measured and
dropped. Warm, `regress.vl` and the distilled sweep read the same CPU on both seeds, because
their cost is per process and per program, not the compiler's guest time.

## The change

* `self-compile-baseline.json` carries `"tier": 0.01`, and `--check` reds past `fuel × 1.01`.
* `scripts/self-compile-ledger.txt` holds one line per baseline: fuel, commit, PR, delta and
  mechanism. `--check` reds when its last line does not name the baseline's fuel, so a rewrite
  comes with its reason. `--write-baseline` prints the line to add.
* A fall of more than the tier prints and passes. The PR that earned it may lower the baseline.
* The baseline is rewritten at master `518cdc66d` (86,422,153,023, from that commit's fixpoint).
  The ledger is seeded with the two earlier baselines and this table.

Checked on a fixture `--pair` reading: unchanged passes, +0.9% passes, +1.25% reds, −2.8%
passes with the note, and a ledger without the baseline's line reds. The fuel is the same from a
checkout five directories deeper (86,422,153,023 against 86,424,455,086, +0.003%), so the tier is
not sensitive to where CI checks out.
