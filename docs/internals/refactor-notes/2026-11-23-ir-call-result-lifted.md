# IR: lifted extra results and stored-alike call results (2026-11-23, lane IR-D1)

Two classes from the IR-only census at 81061fd1, re-measured at 7a517757 (36 functions each).

## Lifted extra results

A lifted function that assigns a capture hands it back after its result: legacy's `fbRetExtra`,
the IR's `irRetExtra` (`liftRetExtra`, lowered by every exit). Shadow mode already built,
verified and matched these functions. Only the claim gate in `emit_sections.vl` still kept them
on legacy, through a `fbRetExtra.length == 0` condition. The condition is gone.

## Call result coercion: results that store alike

The census class is a call whose node is typed at another rep than its callee's signature result.
A probe at the miss labelled each one with its two reps and whether they store at one valtype:

| shape | rows | taken here |
| --- | --- | --- |
| record → record, other row | 27 | no: legacy lays the generic's instance out at the destination's row |
| closure → closure, stores alike | 7 | yes |
| list → list, stores alike | 2 | yes |
| list, box, map at another valtype | 14 | no |
| numeric (i32 ↔ f64 and similar) | 14 | no: a hole function's shared call resolves another instance (the holes lane) |

A pair that stores alike (`repStoresAs`) is built at the destination's rep, as #9627 does at an
argument and a global. The verifier's call rule accepts a result rep that stores as the callee's.

The measurements are in the PR body.
