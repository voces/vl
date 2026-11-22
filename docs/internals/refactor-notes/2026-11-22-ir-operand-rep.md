# IR coverage: a literal `is` test over a null-tagged box (2026-11-22, lane IR-N1)

`x is N` with `x: N | null` and `N` a numeric or string literal union reps `x` as the null-tagged
box (`RNullable` discipline 4): its `null` is one more tag of the same box. Legacy's literal arms
(`emitIsTestLitArms`' `boxLits` and `numBox`, and `emitLitMemberEq`'s `union` member) read that
box's tag exactly as over a plain box, but the IR accepted only an `RBox` operand and left the test
`is literal arms operand rep` (or `is literal member union at nullable`).

## What landed

- **`tagBoxRep`** (`ir_build.vl`): whether a rep is a box whose tag a literal's test reads, a box or
  a null-tagged box. The `boxLits`/`numBox` operand check and `memberEqMissOf`'s `union` arm ask it.
  It is a rep comparison: which arm fires, and each literal's test, are still legacy's
  `litIsArmOf`, `litMemberEqArmOf` and `unionLitIsPlanOf`.

## Coverage

Measured on fixpoint seeds of this branch and of master `eda16676`, each building this branch's
source.

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,644 | 19,644 |
| corpus with no blocker (45,678) | 44,798 | 44,798 |
| `tests/cases` covered / matched (armed shadow) | 67,078 / 67,077 | 67,113 / 67,112 |

On `tests/cases` `is literal arms operand rep` falls from 43 rows to 0 and `is literal member union
at nullable` from 2 to 0; the tests that still miss reach `is literal arms receiver` (36 → 43, a
receiver read more than once that is not a variable). The armed shadow adds no fail, differ or
mismatch row (the one fail row, `generics/hole-map-tail-value.vl`, is on master too).

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,602, differ 0, witnesses same 60;
  `--claimless` identical 14,017, fail under both 3,267, differ 0; `tests/cases` A/B same 8,716,
  differ 0.
- **Fuel:** L2 self-compile per PR +0.00% on master `eda16676`.
