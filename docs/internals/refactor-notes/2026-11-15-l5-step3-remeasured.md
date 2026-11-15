# L5 step 3, re-measured: the family registry does not pay (2026-11-15)

This note corrects the step-3 row of `2026-11-14-phase-products-design.md` §3 and §5.3. That row
estimated **−900 to −1,300** lines from a generic mark and drop over a family registry. Measured on
the tree after steps 3a–3c, the registry nets about **−15 to +20**, so it is not scheduled.

## What step 3 delivered

| slice | PR | net compiler lines | what it bought |
|---|---|---:|---|
| 3a: quiet re-check brackets as `QuietRun` | #8333 | −7 | the brackets became values; `inferQuiet` scope rows went from 14 to 10 |
| 3c: `monoRecheckBegin`/`End` open a `QuietRun` | #8347 | −24 | `MonoSave` deleted |
| 3b: `RB_ELAB_PIN` family | #8350 | +46 | the mechanism lane relate's P3 needs to delete two quiet gates |

## Why the registry does not pay

- **Today's layout is about one line per table, in three places:** a `CheckMark` field, a
  `checkMark` line and a `checkRollback` ladder line.
- **A registry row needs a family's bit, its mark and its cut.**
  - Multi-column families need flat offsets or an array per family: `holeRows` has 5 lengths,
    `infer` 3, and `tpIf` also takes the undo log.
  - Typed lambdas pass 100 columns, so `vl fmt` wraps each row to 3–5 lines.
  - `match` dispatch costs one arm in a mark match and one in a cut match per family, plus index
    constants for `solveUnannotParams`'s `holeFlow` read.
- **The `*Truncate` functions stay.** About 30 of them are `while x.length > n { x.pop() }` over
  heterogeneous columns, and they become the registry's cuts.
- **The rollback assertion stays.** `PRB_TABLES` and `prbLens` (179 lines) are per table, not
  per family. Folding them in needs one entry per table (about 150), or the probe test loses its
  per-table output.
- **The ladder's order is load-bearing.** `tpIf`, `dJoin` and `lpValTy` all replay the same undo
  log, so a registry would have to keep the ladder's order.

## Fuel (measured, for the record)

A micro-benchmark ran 200,000 iterations over two families, measured as guest fuel through
`vl run`:

| variant | fuel | per family operation |
|---|---:|---:|
| direct calls (today's ladder) | 3,451,129 | 17.3 |
| `match` on a family id | 4,493,925 | 22.5 |
| closure rows `{len, cut}` | 5,112,107 | 25.6 |

Step 3b's one record per mark cost +2.36M of L2 fuel, which puts the self-compile at about 60,000
marks. At that count, either dispatch costs +0.006% to +0.011%. Cost is not the reason the
registry is dropped; lines are.

## What remains of step 3

- **Lane relate's P3.** It adds `RB_ELAB_PIN` to its fork and deletes the two quiet gates.
- **`inferQuiet` becomes `quietDepth > 0`.** That happens once lane relate's fit brackets are
  gone.
- **The cursor part is not worth a PR.** `check_cursor.vl` has 12 hidden rows in the
  phase-state census, 10 of them `inferQuiet`, and the rest measure about −5 to −15.
