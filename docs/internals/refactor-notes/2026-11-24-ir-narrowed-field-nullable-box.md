# IR: a narrowed variant's union-box field read as a boxed nullable on that box, 2026-11-24

Lane IR-N6, the class `narrowed field unbox rep` (the queue's ack; N7 confirmed it is not part of
`narrowed read`). Every one of its 17 tests/cases functions is the same shape: a field read off a
box local narrowed to one variant, whose field row is a union box (`narrowedFieldIsUnionBox`), on
the arm where legacy writes no unbox after the box read (`unionFieldNarrowUnboxOf` answers
`"none"`), at a read rep that is an `RNullable` over the field's type (`i64 | null`, `i32 | null`,
`f32 | null`, `Node | null`, a closure union with `null`).

## The mechanism

A nullable of discipline 4 (`boxedNullable`, the predicate ir_build already spells) is the
nullable carried as a union box: the same wasm value, the box ref, that legacy leaves on the stack.
`narrowUnboxRepIs`'s `"none"` arm accepted only an `RBox`. It now also accepts a boxed nullable
whose box is the one the variant record stores the field in (`fieldBoxOf`: the field kid is the
rep itself or shares its box core, `repBoxCore`). A boxed nullable on any other box is refused as
`narrowed field unbox nullable disc`; every other arm is unchanged. `boxedNullable` is now
exported from ir_build for this file.

What decides the field's rep: the ablation of the witness. With only `print(u.x ?? -1)` the base
already covers the read; a second read of the same field elsewhere (`u.x != null` in another
function) moves the field to the boxed nullable the base refused.

## Legacy tails the IR calls

None new.

## Readings (fixpoint seeds on both sides, master 4435b3e3)

Functions with no blocker, `VL_IR_SHADOW=4`: tests/cases 79,702 -> 79,720; distilled corpus 46,812
-> 46,812 (the class had no corpus cell). `narrowed field unbox rep`: tests/cases 18 -> 0 (all
sole). `narrowed field unbox nullable disc`: 0 in tests/cases and the corpus. No program loses a
function.

| tests/cases program | change |
| --- | ---: |
| `narrowing/narrowed-variant-union-box-field.vl` | +2 |
| `unions/arm-nullable-field-of-own-union.vl` | +2 |
| `unions/struct-field-union-arm-nesting.vl` | +2 |
| `closures/nul-closure-nullable-field-arm-union-graduation.vl` | +1 |
| `closures/rebind-union-arm-closure-field-call.vl` | +1 |
| `records/map-value-literal-to-union-arm.vl` | +1 |
| `records/repointed-let-alias-to-union-arm.vl` | +1 |
| `types/type-name-walk-homes-coverage.vl` | +1 |
| `unions/inferred-return-self-union-nullable.vl` | +1 |
| `unions/narrowed-variant-nullable-field-reads-its-box.vl` (new witness) | +1 |
| `unions/record-arms-same-field-narrowed-read-into-union.vl` | +1 |
| `unions/rolled-unrolled-arm-one-tag.vl` | +1 |
| `unions/shared-field-atom-and-string-arms.vl` | +1 |
| `unions/tagged-arm-nullable-field-literal.vl` | +1 |
| `unions/variant-nullable-litunion-field.vl` | +1 |

## Position sweep (Q58)

`scripts/capability-probes/matrix/narrowed-variant-nullable-field.matrix.vl`: the narrowed read
`u.x` (`@@GUARD@@ u is A`) at every built-in position the guard opens, in both faces, plus three
cells: a closure-or-null field called after its `??` default, a record-or-null field read through
a local, and the scalar field at `null`. 50 of 50 graded cells RUN before and after (22 positions
the harness skips for a guarded value). Under `VL_IR_SHADOW=6` the 50 programs are covered 180 =
verified 180 = matched 180, every start matched, nothing uncovered; `ir-identity.sh --claimless`
over them is identical 50, differ 0.

Witness: `tests/cases/unions/narrowed-variant-nullable-field-reads-its-box.vl` reads an
`i64 | null`, a record-or-null and a closure-or-null field at a set value and at `null`, the
closure called after its `??` default; it prints `41 -2 103 -1 7 13 0 1` under both seeds (base 3
of 4 functions covered, candidate 4). Shadow row `tests/ir-shadow-rows/narrowed-variant-nullable-field-box.vl`
(base 1 of 2 covered, refused at the class; candidate 2 of 2).

Legacy lines deleted: 0. Moved to `@ir`: 0.
