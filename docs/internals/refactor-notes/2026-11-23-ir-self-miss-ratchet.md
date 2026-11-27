# IR: the self-compile's IR misses are ratcheted at 0 (2026-11-23, lane IR-S1)

IR-S1 (#9682) brought the self-compile's IR misses from 35 to 0. The gate row `self ir misses`
(`scripts/self-ir-misses.vl`, retired at I8) keeps them there. It checks `compiler/entry.vl` once under the
blocker census (`$VL_IR_SHADOW=4`, `vl check --codegen`) and sums the `blockers` rows other than
`none`. It reds above `scripts/self-ir-misses-baseline.txt` (0; retired at I8). `--write-baseline` only lowers
the baseline, and a census that prints no row exits 2. The coordinator ruled 2026-11-23 that the
row joins the gate.

## Readings (4-core box)

| run | seed | result |
|---|---|---|
| the row | ir-self-sweep (#9682) | 0 missed, rc 0; 61 CPU-s, about 1.2 GiB peak |
| the row | master before #9682 | 35 missed, rc 1; `--write-baseline` refuses to raise |
| `gate.sh --fast` | this branch | every row ok; `self ir misses` 64.4 CPU-s |
| `gate.sh --fast` | mutant `selfirmiss` | `self ir misses` FAILED (`1 for in element f32`); every other row ok |

The cost is about 5.5% of the gate's ~1,100 CPU-s.

## Why no other row catches it

The mutant (`scripts/kill-matrix/mutants/selfirmiss.diff`) adds a self-compile function whose
shape the IR misses: `for x in xs` over an `f32[]`. Only the new row catches it.

- **Identity.** A missed function falls back to legacy under both seeds, so the bytes stay identical.
- **Shadow and claim rows.** They read `tests/ir-shadow-rows/`, `tests/cases` and the distilled
  corpus, not the self-compile.
- **Shadow rows from #9682.** They pin a regression of a mechanism they already cover. They
  cannot see a new self function in a shape nothing pins.

## At I8 cutover

The row should widen to the corpus and `tests/cases` populations when those reach 0 misses too.
It then becomes one ratchet over every population I8 claims, not the self-compile alone.
