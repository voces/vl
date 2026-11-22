# IR coverage: a `??` past the nullable-reference core takes legacy's named rung (2026-11-22, lane IR-N1)

A `??` whose operand is no plain nullable reference reaches the later rungs of legacy's
`emitCoalesceNullableRefs`: a value-union box stashed once, the null test `coalNullTestIf` spells
(a pinned instance's cell, an atom niche joining a box, numbers joining apart, a list cell), a
nullable map's core, the `??` moved onto an `if`'s other arm, a shared `scalar | null` field. The
IR named them all `coalesce nulRef heap`. Stacked on #9517.

## What landed

- **`coalNulRefsArmOf`**, the rungs named in legacy's own order (`CoalNulRefsArm`, registered in
  `lint.vl`); `emitCoalesceNullableRefs` is a `match` on it, its bodies as they were (D960's stash
  moved out as `emitCoalesceBoxStash`). `armIf`'s shape test is split out of the minting
  `coalNullArmIf` as the pure `coalNullArmIfFits`, so the plan mints nothing.
- **`coalNulRefsHeapOf`**, the heap the core is written at on the `heap` and `mapHeap` arms,
  shared by legacy's dispatch and `coalNulRefPlanOf`.
- **The IR's `coalNulRef`** routes on the plan: `heap` and `mapHeap` take the core;
  `pinnedCellIf`, `atomJoinIf` and `cellIf` build the valued `if` `coalNullTestIf` mints once
  (#9452's cache); the rest are misses by their arm. `numJoinIf` re-types its node
  (`nodeTyRecord`), which the builder must not.

## Coverage

Measured on fixpoint seeds of this branch and of #9517's head `4d50b17f`, each building this
branch's source.

| population | #9517 | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,805 | 19,805 |
| corpus with no blocker (45,678) | 45,106 | 45,106 |
| `tests/cases` covered / matched (armed shadow) | 68,510 / 68,509 | 68,523 / 68,522 |
| `tests/cases` start bodies covered / matched | 5,729 / 5,728 | 5,731 / 5,730 |

`coalesce nulRef heap` (45 rows, 17 start) is gone; what does not yet build names its arm:
`boxStash` 13 (start 8), `numJoinIf` 6 (2), `boxFieldScalar` 5 (2). The armed shadow adds no fail,
differ or mismatch row (the one fail row, `generics/hole-map-tail-value.vl`, is on master too).

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,615, differ 0, witnesses same 61;
  `--claimless` identical 14,019, fail under both 3,267, differ 0; `tests/cases` A/B same 8,729,
  differ 0.
- **Order check (#9508, mode 6):** `ir-prepost.vl` reads 0 order rows over 21,040 programs; no
  new `prepost differs` row.
- **Stack margin:** the labelled-loop case passes at 960 and 940 KB and fails at 920 KB, as its
  base does.
- **Fuel:** L2 self-compile per PR +0.04% on master `d5192673`.
