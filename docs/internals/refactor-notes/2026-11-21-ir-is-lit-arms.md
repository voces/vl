# IR coverage: an `is` test at the `litArms` rung, first slice (2026-11-21, lane IR-N1)

`litArms` is `isArmOf`'s literal rung. `litIsArmOf` splits it into sub-arms. In `tests/cases`
(armed shadow, first miss), before this step: `memberEq` 87, `atomEq` 81, `boxLits` 72,
`nicheTest` 46, `numBox` 42, `nicheNever` 11; in the corpus, `nicheTest` 24, `nicheNever` 15,
`memberEq` 8, `atomEq` 5. This slice takes the arms the IR already has an op for.

## What landed

`isLitArms` (`ir_build.vl`) takes `litIsArmOf`'s answer, as `emitIsTestLitArms` does, over a
`_`-less match:

- **`mapNull`, `mapHas`**: the scalar map read's `RMapHas`, negated for `null`. This is the same
  build as a map read's `== null` (`mapReadHas`, shared with `nulTestMapHas`).
- **`nicheTest`**: the niche's own null test, the `RNulTest` the `nulTest` rung builds.
- **`nicheNever`, `atomTrue`, `memberTrue`**: the constant. Legacy writes no receiver read before
  it, so it is built only over a re-readable receiver (`unionEqOperandOk`), where skipping the read
  loses no effect.
- `nicheRaw`, `atomNotNul`, `atomEq`, `boxLits`, `numBox`, `memberEq`, `memberNoRecv`: named misses
  (`is rung litArms <arm>`). `memberEq` writes each member through `emitLitMemberEq`'s four
  shapes, and `atomEq` interns atom ids as it writes; both are their own step.

## Measured vs #9358's merged head (fixpoint seeds on both sides)

| population | base | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,271 | 19,272 |
| self-compile `is rung` alone | 1 | 0 |
| self-compile claimed (mode 3) | 19,251 | 19,252 |
| corpus covered = verified = matched | 43,154 | 43,166 |
| `tests/cases` covered / matched (armed shadow) | 57,757 / 57,746 | 57,809 / 57,798 |

`tests/cases` gains no fail, differ or mismatch row.

- **Byte proof:** mode 3 self identical; `ir-identity --names` 9,037 identical, differ 0,
  self-compile identical; `--cases` 7,558 identical, differ 0, witnesses 60 same; `tests/cases`
  A/B 8,672 same, differ 0.
- **Ratchets:** L2 fuel 104,700,431,233 → 104,705,898,507 (+0.005%); `gate.sh --fast` passed.
