# IR coverage: a narrowed field's boxed-nullable storage, an intersection's field kid (2026-11-23, lane IR-N7)

| Mechanism | Change | blocker class, functions (alone), before → after |
|---|---|---|
| narrowed field receiver rep | `storedBoxRead` (`ir_build_ref.vl`) admits a receiver at a boxed nullable (`heldAsBox`), the same `{tag, payload}` struct whose null is a tag, as legacy reads the field's declared box; the verifier's rule 2 admits it too, in N9's #9738 form (merged first, its keyed self-tests `stored-read-of-i32-field` and `stored-read-of-boxed-nullable-field` cover it) | corpus `narrowed field receiver rep` 8 → 0 |
| field kid | `repRecordKidOf` (`emit_rep.vl`, called only by the IR) names an intersection's or alias's fields by the record rep it builds (`repRecordFieldNames`), not by `objFieldNames` of a type that is no object | corpus `field kid` 8 → 0; tests/cases 2 → 0 |

Witness: `tests/cases/types/intersection-arms-in-other-field-orders.vl`. Two intersections declare
the same four fields in other arm and field orders and are read through a parameter, a returned
value, a list element and a nested field. The output is the same under both seeds, and every
function plus the start body is matched on head.

## Measured

Fixpoint seeds: master 1d35bb971 and the head before the master merge (63a8115e4).
- tests/cases functions with no blocker: 79,079 → 79,081; covered = verified = matched.
- Corpus functions with no blocker: 45,451 → 45,467; covered = verified = matched.
- `ir-only-census`: programs fully IR-only, 5,689 of 7,151 → 5,701 of 7,152 (the witness adds one).
- Self-compile 20,355, unchanged. L2 fuel −0.00% per PR; late demands 9 / 9, late tag rows 307 / 307.
- A/B over tests/cases: same 7,440, differ 0.

| Predicate the IR asks | Legacy writer it mirrors |
|---|---|
| `heldAsBox` (existing, `ir_build.vl`) | legacy's read of the field at its declared box, the boxed nullable's struct included |
| `repRecordFieldNames` (existing, `emit_rep.vl`) | the record layout legacy builds for the intersection |

## Legacy tails the IR calls

None new.
