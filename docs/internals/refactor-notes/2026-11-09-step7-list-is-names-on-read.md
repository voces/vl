# Step 7: `listIsIdentNames` leaves collectA#2

Measured 2026-11-09 on a 4-core box. The base is #6938's branch (`8584e920`). Both seeds are
fixpoints (two `refresh-compiler.sh` runs byte-identical). The population is the sweep's
23,751 programs.

| | base (fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| sweep | | 23,751 same; 0 bytes-only, 0 output movers, 0 runs lost, 0 new traps |
| seed bytes | 6,570,910 | 6,570,887 (−23) |

## What moved

`listIsIdentNames` was a by-name set. It held the name of every variable that some `is K[]`
tests, with `K[]` a list type. collectA#2's `IsExpr` arm filled it, and `collectAResetTables`
cleared it. Seven readers used it as a prefilter: `listFitArmTyOf`, `listNarrowRecvTyOf`,
`fitPushSlotOf`, `listFitGrowRow`, `listFitGrowWalk`, `listFitCaptureStandIn`, and the lift
refusal in `emit_lift.vl`.

It is now `listIsTestedName(name)` (`emit_base.vl`). The scan runs on the first ask and is
memoised on the pass generation (`memoPassMoved`), the same idiom as `hfvSync`. A scan that
resumes from a memo is exempt from `arena-scan-outside-pass`, so the scan budget does not
move. The set uses the predicate the walk used: the receiver is an `Ident`, and the `is`
type's slot is a `TyArray`.

This reads the arena when the answer is needed, not when collectA#2 ran. Two things could
differ: nodes the passes after collectA#2 append, and node types recorded after it. In this
population neither makes a difference. The sweep is identical down to every module's hash.

## What stands

The set is still keyed by NAME, as before, so two variables with the same name in unrelated
functions share an answer. Keying it by declaration (`identDeclOf`) would narrow the answer.
A capture would then need the enclosing declaration, not the read's. That changes behaviour,
so it gets its own PR and its own sweep.

The `IsExpr` arm of collectA#2 still calls `forceListLeafRepsOfTy` (D4911, D4912). That is a
ref-list row mint, and it goes with the ref-list slots.
