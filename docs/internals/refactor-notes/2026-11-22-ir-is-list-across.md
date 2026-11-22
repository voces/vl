# IR coverage: `x is L` over a box of list arms, the `listAcross` rung (2026-11-22, lane IR-N1)

The bare `is rung` miss is every `isArmOf` rung the IR does not build. Grouped by rung on master
`2934a520` (a diagnostic seed naming the arm, over `tests/cases` functions plus start bodies):
`listAcross` 27 + 7, `listFit` 11 + 8, `litMember` 9 + 4, `recordFit` 7 + 0. Their shapes differ:
`listAcross` reads its receiver once into the shared slot, `listFit` reads it amid its own slot
allocation, `recordFit` re-reads a place, and `litMember` routes per member. This takes the
largest, `listAcross`.

## What landed

- **Legacy's writer, split**: `emitListIsAcrossReps` is the plan (`listIsAcrossPlanOf`, a record
  over `listIsAcrossRepsPlan`), the shared slot (`sharedFieldRecvSlot`), the receiver, then the
  exported `listIsAcrossTail`.
- **`RListIsAcross { laV, laAt }`**, a new `Rhs` in the claimed `list` family, threaded through
  `ir.vl`, the verifier (a bool) and `lint.vl`. The builder admits a receiver that is an
  identifier: legacy mints the slot before writing the receiver, so the receiver must mint nothing.
  The lowering keeps legacy's order (plan, slot, receiver, tail). `emitListIsAcrossReps` is a
  fourth site of IR-N2's slot-before-operand order (`legacy-shared-slot-after-operand`); widening
  past an identifier waits for that.
- **An element store through a box of list arms** is legacy's per-arm write (`emitArmIndexWrite`).
  The IR's `elemStore` asked `idxStorePlanOf` first, which records a refusal, and once the rung
  built, `arrays/is-list-arm-write-at-numeric-literal-set.vl` failed to build in every mode. The
  arm question is split out (`armIndexWriteArmsOf`) and asked first, a named miss
  (`store arm write`). The hazard class is D17051.

## Coverage

Fixpoint seeds of this branch and of master `2934a520`.

| population | master | this branch |
| --- | ---: | ---: |
| `tests/cases` functions covered / matched (armed shadow) | 69,280 / 69,279 | 69,302 / 69,301 |
| `tests/cases` start bodies covered / matched | 6,014 / 6,013 | 6,018 / 6,017 |
| `is rung` rows, functions / start | 57 / 19 | 27 / 12 |
| self-compile functions with no blocker | 19,909 | 19,909 |
| corpus with no blocker (45,678) | 45,243 | 45,243 |

The armed shadow adds no fail, differ or mismatch row.

- **Byte proof:** mode 3 self-compile identical; `--names` self-compile identical; `--cases`
  identical 7,627, fail under both 68, differ 0, witnesses same 61; `--claimless` identical
  14,021, fail under both 3,267, differ 0; `tests/cases` A/B same 8,741, differ 0.
- **The write witness** prints the same on this branch's claimed and claimless compilers and on
  master.
- **Order check (mode 6):** 0 order rows over 21,045 programs.
- **Stack margin:** 960 and 940 KB pass, 920 KB fails, on this branch and on master.
- **Fuel:** L2 +0.13% on master's fixpoint. It is source growth: the head seed builds master's
  tree at +0.004%.
