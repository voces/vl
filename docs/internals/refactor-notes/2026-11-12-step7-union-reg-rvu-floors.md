# Step 7 L6 (lane G, cut 5c): the value-union floors, each converted or under a contract, 2026-11-12

The base is master `25ddb6cb`. Cut 5a (#7651) left `registerValueUnionNameAB` named floors that
gave a mechanism, not a contract. The coordinator ruled that each one needs a contract sentence or
a conversion.

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, recorded at each floor
call the type it was handed: for sites 56 to 59, the nullable's inner. It ran over the sweep list
(24,020 programs graded).

| site | calls (programs) | what it holds |
| --- | --- | --- |
| 56, 57, 58, 59 (map-read and list-element `T \| null` boxes) | 1,541 (1,048) | a primitive inner: the type is `nulNumScalarUnionRowTy`'s |
| 57, 59 | 445 (291) | a function inner: `(_) => _`, `(T) => T`, `(T) => T[]` |
| 47 (an optional call's result) | 56 (31) | a concrete `T \| null` |
| 47 | 1 (1) | D10130's generic body type `V \| null` |
| 51's literal-set call (`valueUnionNameOfSoftTy`, handed -1) | 0 | never reached |

## Changed

- **56 to 59** go through `registerNulScalarBox(site, name, ty)`.
  - A primitive inner registers from the type (`registerValueUnionOfTy`).
  - A function inner keeps the rep's spelling, under this contract: *a non-primitive inner is a
    function-value set's id, and a function-value-set row has no element type: it is keyed by its
    set.* This is lane F's accepted function-set contract. The census found no inner that is
    neither a primitive nor a function.
- **47** registers from its type (`registerValueUnionOfTy`).
  - D10130's `V | null` spells no value union, so nothing registers.
  - D10130 is a loud emit reject on master (`??` over this nullable value) and prints the same
    message on the candidate. Its row is open and unchanged.
- **51's literal-set call** becomes a loud floor (`emitFail`), since no program reaches it. A join
  of a literal set and a scalar is named by its type in the call above it (D14750, D14751, and
  `unions/shared-field-atom-set-beside-scalar-arm.vl`, which print what master prints).

## `registerValueUnionNameAB` after this

- **Lane G's callers:** the function-set floor (sites 56 to 59, one helper) and the entry's own
  use inside `registerValueUnionOfTy`.
- **Lane E's five** (`emit_shape_intern`), handed over.

## Filed

**D15977.** `valueUnionVerdict` has no kind for a list of a literal union, so `isValueUnionTyOr`
declines `Z[] | i32`, which the spelling calls a value union. It runs today (status "runs today
and must keep running"). No lane owns `check_ty_rep`, so the conversion waits until after step 7,
per the coordinator's ruling.

## Proof

- **Seed:** fixpoint, 6,710,226 bytes. The comment move after it is byte-identical.
- **Output, master seed against the candidate:** D10130, the D15116 cell,
  `shared-field-atom-set-beside-scalar-arm.vl` and D14750. 0 differ.
- **Locally:** lint-self, regress (no runs lost), rep-fuzz, check-filed-witnesses `--strict` (0
  moved, D15977 as filed), late-demands, seed-size, dead-exports, emitter-state-audit.
- **The full sweep:** CI's `sweep` label. Expected identity.
