# IR coverage: union casts (lane COV-UNION, 2026-11-25)

The `union cast *` classes of the I8 census (`2026-11-25-ir-i8-census.md`), 32 rows over 20
programs on a fixpoint of master d27b5082. One mechanism per commit:

| class | rows before | mechanism |
|---|---:|---|
| union cast niche propagate | 13 | the propagating `as` over a niche is the nullable-reference block `??` already lowers (`SCoalBox`, new arm `asProp`), its null path the function's null return (`RRetNull`, `SReturn`, legacy's `unreachable`); heap and eligibility are one shared decision, `asPropNicheHeapOf` |
| union cast list across reps | 9 | `emitAsListAcrossReps` split at its operand; `emitAsUnionTagged` (the IR's `RAsUnion` tail) takes `emitAsListAcrossTail` |
| union cast literal union | 5 | `emitAsBoxToLitUnion` split at its operand (`emitAsBoxToLitUnionTail`), the same route |
| union cast niche one list | 4 | `emitAsOneListCast` split at its operand (`emitAsOneListTail`); the verifier admits a list operand under `RAsUnion` |
| union cast after an operand | 1 | open: `as?`'s valued `if` reads its value from the stack, so a temp an earlier operand built cannot wait below it |

## Census, cut to the 20 programs (rows = unclaimed distinct functions + start bodies)

| population | before | after |
|---|---:|---:|
| tests/cases (12 programs) | 19 + 7 = 26 | 2 + 2 = 4 |
| probes (1) | 1 + 0 = 1 | 0 |
| witnesses (7) | 4 + 3 = 7 | 0 |

The 4 left: `union cast after an operand` (1 start body); `box ladder` (1 start body, there
before); `expression as` (1, there before, in `generics/as-union-pin-no-member-propagates.vl`);
`box of a valued if` (1, `unions/as-trio-nullable-closure-niche.vl`, unmasked by the propagate claim).

## Position sweeps (Q58)

Each builds under `VL_IR_SHADOW=6`, runs, and is identical to `ir-identity.sh --claimless`:
- `tests/cases/unions/as-prop-niche-in-each-position.vl`: 75 of 79 functions matched; the 4 left
  stop in classes this change does not touch (`box of a valued if` ×2, `map read receiver
  computes`, `short-circuit right operand`).
- `tests/cases/unions/as-list-across-reps-in-each-position.vl`: 76 of 76.
- `tests/cases/literal-unions/as-litunion-arm-of-box-in-each-position.vl`: 80 of 80.
- `tests/cases/narrowing/as-cast-one-list-union-in-each-position.vl`: 76 of 76.
