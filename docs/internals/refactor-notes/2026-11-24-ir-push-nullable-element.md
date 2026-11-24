# IR: a push onto a nullable element slot, as legacy builds the value, 2026-11-24

Lane IR-N6, the class `push nested list element` (the queue's ack, 2026-11-24). The sentence is
`pushPlainWhy`'s for any push plan with `pushNestSlot` set, and `pushPlanOf` sets it for every ref
list whose element slot is nullable (`rlElemNullable`), not only nested lists: `(R | null)[]`, a
nullable closure list, a generic `(T | null)[]`, std's idtable slot list.

## The mechanism

Legacy writes such a push's value with a plain `emitExpr(arg)` (`emitPushValue`'s `pushNestSlot`
arm) and appends it; a non-null ref stored into a `ref null` slot writes no conversion. `pushRhs`
now treats the sentence as admissible and delivers the argument at the element rep as it does for
every other push, under one condition, `pushNullableElemPlain(arg, er)`:

1. the value's own rep is the slot's (`exprRepOf(arg) == er`);
2. the slot is a ref nullable (`refNullable`) over the value's own rep: the widen writes no bytes;
3. the value is a bare `null`, which legacy's `emitExpr` writes as the slot's null ref.

Anything else stays a miss, under the narrower `push nullable element coercion`. `pushPlainWhy`
and the lowering (`ir_lower_ref`) are unchanged.

## Legacy tails the IR calls

None new.

## Readings (fixpoint seeds on both sides, master 0fccbcba)

Functions with no blocker, `VL_IR_SHADOW=4`: tests/cases 79,544 -> 79,562; distilled corpus 46,799
-> 46,799 (the class had no corpus cell). `push nested list element`: tests/cases 20 -> 0 (19 sole),
and its start rows 12 -> 0 (start matched 7,045 -> 7,056). `push nullable element coercion`: 0.
No program loses a function.

| tests/cases program | change |
| --- | ---: |
| `inference/container-null-hole-filled.vl` | +4 |
| `std/idtable-plumb-witness.vl` | +2 |
| `arrays/nullable-closure-element-list.vl` | +1 |
| `closures/context-typed-nullable-variant-param.vl` | +1 |
| `closures/lambda-empty-list-deep-record-result.vl` | +1 |
| `generics/hole-guarded-member-read-through-nullable-field.vl` | +1 |
| `generics/nullable-type-param-list.vl` | +1 |
| `generics/return-only-type-param-bound-by-destination-runs.vl` | +1 |
| `lists/push-nullable-element-slot-reads-back.vl` (new witness) | +1 |
| `loops/for-in-nullable-niche-elements.vl` | +1 |
| `std/idtable-basics.vl` | +1 |
| `std/idtable-negative-id-traps.vl` | +1 |
| `types/nullable-struct-array-push.vl` | +1 |
| `types/nullable-struct-array.vl` | +1 |

The self-compile, which holds std's idtable, is identical under `--names` and armed covered =
verified = matched (20,497) on both seeds.

## Position sweep (Q58)

`scripts/capability-probes/matrix/push-nullable-element.matrix.vl`: the push's value (the new
length) at every built-in position in both faces, plus six element cells (`null`, a literal, a
narrowed local, a parameter, a field, a closure into a nullable closure list), each reading the
element back. 52 of 52 graded cells RUN before and after; `local_assign`, `struct_field_assign`
and `array_element_assign` are skipped: the harness writes the value twice at those positions (an
initializer and an assignment), so the generated program pushes twice. Under `VL_IR_SHADOW=6` the 52 programs are covered 60 = verified 60 = matched 60 with no
fail or mismatch row, and `ir-identity.sh --claimless` over them is identical 52, differ 0. The
position functions left uncovered under both seeds are other classes this change does not touch
(Q58 as #24 reads it): `coalesce optional staged receiver`, from the cells' `?.` read-back, and
`push late receiver`, a module global's push read after its value.

The witness turned up a clause-1 defect on master that is not this class: `print(null)` checks
clean and builds an invalid module (`expected i32, found nullref`), reported to the queue.

Witness: `tests/cases/lists/push-nullable-element-slot-reads-back.vl` prints each push's length and
reads each element back, the pushed `null` included (`1 2 3 4 4 none 5 6 2 9 none`, both seeds;
base covers 3 of 4 functions, candidate 4). Shadow row
`tests/ir-shadow-rows/push-nullable-element-slot.vl` (base 1 of 2 covered, candidate 2 of 2).

Legacy lines deleted: 0. Moved to `@ir`: 0.
