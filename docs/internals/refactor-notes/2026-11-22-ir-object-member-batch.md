# IR: shift-mask fold narrowing sources and pinned template holes (2026-11-22, lane IR-N5)

Two classes from the coordinator's batch for IR-N5, on master 4cb73575.

## Shift-mask fold narrowing (43 + 12 functions, 3 files)

`shiftMaskFold` missed the narrowing source: an i64 shift wrapped to i32 (`srWrappedMask`).
Legacy's `srPushSource` writes the source at i64 and then `i32.wrap_i64`. The IR now builds the
source, widens it to i64 by the plain plan, and wraps it with `RNumWiden` from kind 3 to kind 1,
typed `i32`. `ir_lower` writes `i32.wrap_i64` for that pair and nothing else, so
`emitNumOpOf` is untouched. The narrowing form without an outer shift (`srEmitNarrowed`) is the
same fold at j 0: an optional `>>> k`, then `& m`.

`RNumCast` at the `as%` node was tried first. `numCastKindOf` gives no kind for a cast legacy
folds into the shift, so `numCastTail` refuses it.

## Template hole pinned (32 functions, 11 files)

A render call whose template hole this instance pins to a string or atom (`tplStrHoleOf`) is
that hole's string. `emitCallCore` writes it (`emitStrValue`) before any call route. The IR
builds it in the expression path and, dropped, in the statement path, through `tplHoleStr`: an
atom by `deliverStr`, a string as itself. A plain copy (`RRetag`) was tried first. The verifier's
rule 2 refuses a `str` → `str` retag, so the hole is returned as the operand.

New test cases: `bitwise/shift-mask-fold-wrapped-i64-source-at-i32.vl` and
`templates/hole-pinned-string-as-statement-and-value.vl`.

The measurements are in the PR body.
