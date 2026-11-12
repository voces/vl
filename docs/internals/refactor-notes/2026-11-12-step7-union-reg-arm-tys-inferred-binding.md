# Step 7 L6: a union box's arm readers ask an un-annotated binding's inferred type, 2026-11-12

One of the text callers of `unionMemberTysOf` that still reach the softened key through
`unRowOfSetText` (`2026-11-12-step7-union-reg-shape-arms-by-type.md`'s list).

## Changed

Four `unionSetArmTysAB` callers in `wasmEmit.vl` hand it the receiver binding's type:
`unionBoxLacksTag` (site 91), the `is` arm reader (92), `mapSoftTwinTagFail` (94) and the
list-arm test (95). They used the DECLARED type only (`unionDeclTyIxOfIdentRead`), so
`const v = mkval()` gave -1, the row by type was never asked, and the arms were read off the
alias's member-set text. They now ask `unionTyIxOfIdentRead`: the type the binding holds as
declared or inferred at its declaration (`unionTyIxOfIdentAt`), which is still blind to
narrowing.

## The reading

A probe compiler, built in the scratchpad and never refreshed into a seed, recorded each
set-text hit behind `unionSetArmTysAB`. It read every `tests/cases` file and every distilled
`cells/` cell (9,202):

| | hits | programs |
| --- | --- | --- |
| master | 29 | 10 |
| this PR | 10 | 5 |

Of the 10 left, 4 are D4320's one-list `f64[]|f64[]`, a floor. The other 6 are receivers that
are not a plain identifier, whose read can be narrowed.

## Proof

- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against master
  `02395fd8`:

  ```
  same                            23959
  bytes-only movers                   0
  output movers                       0
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  ```
- **Locally:** lint-self, rep-fuzz, `cases_wasm`, the memo-generation, state-audit and scaling
  tests, emitter-state-audit, capability probes (`--live-sites`, `--floor`), splice-scan,
  seed-size, late-demands, and the dead-export and render-parse budgets.
