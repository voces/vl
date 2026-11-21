# IR coverage: an `is` test at litArms' operand arms (2026-11-21, lane IR-N1)

`isLitArms` built the literal arms that are a map read's presence, a ref niche's null test or a
constant. The arms that read the operand and write a test after it (`nicheRaw`, `atomNotNul`,
`atomEq`) were the miss `is rung litArms <arm>`, `atomEq` the largest.

## What landed

- **Shared tails.** Legacy's `emitIsTestLitArms` writes those three arms as the operand, then
  `nicheRawIsTail` (the null test, negated unless the test is for `null`), `atomNotNulIsTail` (the
  atom against the `-1` null id) or `atomEqIsTail` (per member, its id compared, each after the first
  or-ed in). The bytes are unchanged. `litIsMemberTexts` names the members `atomEq` compares.
- **`RLitArms`.** The builder's `isLitArmsTest` checks the operand's rep for its arm and builds one
  bool temp; the lowering asks `litIsArmOf` again, writes the operand, and the arm's tail, the
  operand once per member for `atomEq`. The verifier holds that an `atomEq` operand is a variable.
- **Named misses.** An `atomEq` receiver that is a temp (`is literal arms receiver`). The box arms
  `boxLits` and `numBox`, and `memberEq`, which `emitUnionLitIs` and `emitLitMemberEq` write, stay
  `is rung litArms <arm>`: `memberEq` compares against a string literal node legacy makes per member
  at emit time, which needs a plan the two writers share before the IR can write it.

## Coverage

Measured on fixpoint seeds of this branch and of master `2ddcb70b`, each building this branch's
source.

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,434 | 19,434 |
| self-compile claimed (mode 3) | 19,409 | 19,409 |
| corpus with no blocker (45,678) | 43,954 | 43,959 |
| `tests/cases` covered / matched (armed shadow) | 61,130 / 61,129 | 61,178 / 61,177 |

On `tests/cases` `is rung litArms atomEq` (84 rows, 3 at `@start`) is gone; `is literal arms
receiver` is 15, and the rest reach a later blocker. Left: `boxLits` 77, `numBox` 46, `memberEq`
90. The armed shadow adds no fail, differ or mismatch row.

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0, self-compile identical; `--cases` identical 7,582, fail under both
  68, differ 0, witnesses same 60; `--claimless` identical 14,014, fail under both 3,267, differ 0;
  `tests/cases` A/B same 8,696, differ 0.
- **Fuel:** L2 self-compile 105,852,643,955 against master's fixpoint 105,702,424,697 (+0.14%).
