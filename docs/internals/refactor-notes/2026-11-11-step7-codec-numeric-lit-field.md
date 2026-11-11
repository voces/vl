# Step 7 codecs: a numeric literal union field stores its base scalar, 2026-11-11

This stacks on #7199 (`2026-11-11-step7-codec-field-store-own-type.md`). It is the last family of
typed field rows whose stored type disagreed with their code: D2541's fixture, where a field of
type `1 | 2` sat in the union box (code 16) while `repOfTy` reps the type as `i32`.

## The ruling

`one-literal-union-rep` (`open-rulings.md`, ruled 2026-10-13) says that a numeric literal union
(`1 | 2`) keeps its base scalar. The union box was the deviation. A local, parameter or list
element of that type is already an `i32`, so the field now agrees with every other position.

## What changed

The shared code producer (`fieldCodeOfTy`) and the anonymous row's producer (`anonFieldCode`) both
code a numeric literal union at its base scalar's code (`numLitUnionBaseTy`). They do this ahead of
the box arm. Before, `isValueUnionTyOr` declined the type, and the registry's key rung boxed it.

## Measurement

The probe compared the code's kind with `repOfTy(sFieldStoreTy)` on every typed field row, over the
population (`scripts/sweep.vl`, 23,885 programs, scratch build, never refreshed):

| typed rows that disagree | #7179 | #7199 | this slice |
| --- | --- | --- | --- |
| programs | 7 | 2 | **0** |

Against #7199's probe recording, no other program moved outcome, output or module bytes. The two
probe programs were masked by their marker, so their movement is left to CI's Sweep job.

By hand, a `1 | 2` field built, assigned, compared with an annotated twin, handed to a parameter
of the record type and stored in a list prints the same lines as master. The fixture
`unions/union-field-literal-row-positions.vl` prints its eleven lines.

## Found and not fixed (other lanes)

An inline-annotated `{ k: 1 | 2 | null }` initialised with `{ k: null }` and read with `?? 7` is
check-clean invalid wasm on master (`expected i32, found nullref`). The alias spelling
`type R = { k: 1 | 2 | null }` runs. It is reported for filing; it is unchanged here.

## What is left

Every typed, covered field row's stored type now reps the way its code stores the field. The
readers can take `repOfTy(sFieldStoreTy)` wherever a row is reached. The code answers only for
holes, type parameters and the spelling-only interns. That is the next slice.

## Proof

One refresh. `regress.vl`, rep-fuzz, lint-self, `cases_wasm_*` and the six static budgets are run
before push. The corpus identity is CI's.
