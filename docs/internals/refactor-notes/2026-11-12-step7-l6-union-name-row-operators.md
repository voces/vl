# Step 7 L6: an operator expression's union name hands back its type's row, 2026-11-12

This is step B, part 3, of the `unNames` spelling readers. After part 2 (#7441), a census over
the whole sweep counted, by expression kind, the programs where `unionNameOfExpr` answered with a
name and no row. A second probe then asked, for each such answer, whether the row the expression's
own type keys to (`unRowOfTyKey(nodeTyAt(ix))`) is the row the name names (`unMemRowOfName`).

| kind | type row agrees | differs | name has no row | type keys none |
| --- | --- | --- | --- | --- |
| `??` | 428 | 0 | 5 | 7 |
| `?.` read | 88 | 0 | 7 | 0 |
| arithmetic operators | 78 | 0 | 4 | 0 |
| `as?` | 41 | 0 | 1 | 1 |
| unary | 1 | 0 | 0 | 0 |
| identifier | 2,721 | 135 | 55 | 1,270 |
| member | 1,983 | 105 | 0 | 58 |
| call | 1,856 | 12 | 15 | 16 |
| index | 44 | 27 | 0 | 33 |
| `if` join | 173 | 2 | 11 | 1 |

For the first five kinds the type's row never differs from the name's. So where the rung that
answered read no row, `unionNameOfExpr` now records that row (`unionKeyRowOfOperator`). The
identifier, member, call, index and `if` rungs do differ, so their rows come from the rung itself,
one at a time.

The base is master `0fd63e23`, with a fixpoint seed on both sides. The population is the whole
sweep, 24,004 programs.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 24,004 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Checks.** `emitter-state-audit --check` is clean. `rep-fuzz-check.sh` is exact. `cases_wasm`
  passes 7,484 with 0 failed. lint-self is clean. The export budget, with findings, has 0 dead
  exports. Render-parse is flat at 13 renders and 55 parses.
