# Step 7 L6: an undeclared spelling's registry membership is its bound row, 2026-11-12

Cut D of the `unKey` retirement (`2026-11-11-step7-union-reg-unkey-dead-readers.md`). The base is
#7311.

## Changed

`isUNameDeclAB`, asked of a spelling no declaration types, answers from the row the spelling is
bound to (`unRowOfName`), not from the row its softened key (`unKey`) finds. Its armed tally
compares the same bound row. A declared name still asks its declared type's key. Its six callers
outside `emit_mono` (sites 73 to 78) hold only a spelling. `emit_mono`'s three (79 to 81) are
w317's.

## The census behind it

A probe compiler, built in the scratchpad and never refreshed into a seed, recorded each
undeclared call that found a row by either reader. It read every `tests/cases` file and every
distilled `cells/` cell (9,202):

| site | both agree | key only | programs |
| --- | --- | --- | --- |
| 75 (`fieldCodeOfSpelling`'s box rung) | 77 | 1 | 13 |
| 77 (`nameIsStructDecl`) | 12 | 0 | 3 |
| 73, 74, 76, 78 | 0 | 0 | 0 |

The one key-only hit is `Box<i32>|i32` in `generics/nested-application-close-continuation.vl`,
whose output is unchanged.

## Proof

- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against #7311:

  ```
  same                            23941
  bytes-only movers                   0
  output movers                       0
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  ```
- **Locally:** lint-self, rep-fuzz, `cases_wasm`, the memo-generation, state-audit and scaling
  tests, emitter-state-audit, capability probes (`--live-sites`, `--floor`), splice-scan,
  seed-size, late-demands, and the dead-export and render-parse budgets.
