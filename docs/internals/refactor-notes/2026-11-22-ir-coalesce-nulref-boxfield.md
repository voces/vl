# IR: a shared `scalar | null` field read under `??` (2026-11-22, lane IR-N2)

`coalesce nulRef boxFieldScalar`, one of the rungs #9547 named. On the forced IR-only census at
master 14d707ae it holds 6 functions and 2 module starts, 5 of them in
`unions/shared-nullable-scalar-field-read.vl`.

Legacy (`emitCoalesceBoxFieldScalar`) writes the field's box, which since #9599 is followed by
its stash slot. It then tests the box's tag in an `if` typed at the `??`'s scalar: the present
arm unboxes and widens, and the `else` holds the default.

## The change

- The arm is a plan and an open writer in `wasmEmit.vl`, which legacy and the IR both use:
  - `coalBoxFieldScalarPlanOf`: the box's atom kind and the result kind, both -1 where no
    conversion joins them;
  - `coalBoxFieldScalarOpen`, from the stash to the `else`.
- `CoalValArm` gains `boxFieldScalar`. The builder takes the operand at a boxed nullable rep and
  the result at the result kind's scalar rep, with the default delivered there in the `else`. The
  verifier checks those two reps, and the lowering writes operand, open, default and end.

The census module start of `soundness/union-shared-record-field-runs.vl` moves on to
`field store shared`.

Row file `tests/ir-shadow-rows/shared-nullable-scalar-field-coalesced.vl`; witness
`tests/cases/unions/shared-nullable-scalar-field-coalesced-to-its-scalar.vl`.
