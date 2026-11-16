# Type hash-cons stage 6b, tier 2: check_elab_cap.vl's reached walk limits (lane HASH), 2026-11-16

The census's three reached, non-sentinel `walk-limit` hits in `check_elab_cap.vl`; the file goes
12 → 9. `fnTagPlaceRep` (row 45) is a sentinel the lint already skips.

| census row | function | was | now |
| --- | --- | --- | --- |
| 41 | `elabTyClosed` (`elabTyClosedOwn`) | `depth > 16` answered closed; memo keyed by type and depth | path of (type, `own` size); a revisit answers closed as far as it goes (`ETC_CUT`), which is not memoised; the memo is keyed by type |
| 50 | `fnTagParamCopyOf` | `hops < 8` | bindings seen |
| 54 | `elabParamCopyOf` | `hops < 8` | bindings seen |

`elabTyClosed` loses its depth argument at 106 call sites. Two of them passed 16, which asked
only the top row: `elabHeldShut` (`emit_elab.vl`) and the binding check in `emit_mono.vl`. Both
are documented as "no type variable ... in it", so they now ask the whole type. The identity sweep
shows no program moves.

## Grading (fixpoint seeds, master `c4052ed4e` vs this branch)

- Identity sweep: all 3,223 programs byte-identical.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent, no cell changed class.
- Deep-nesting grid: 240 of 240 run.
- Self-compile fuel: 94,316.8M against master's 94,311.7M (+0.005%).
- `walk-limit` baseline: 542 (`check_elab_cap.vl` 12 → 9).
