# IR coverage: litArms' `memberEq` arm, a string receiver's member compares (2026-11-21, lane IR-N1)

`s is J` over a plain string receiver, `J` a literal union, is legacy's `memberEq` literal arm: per
member, the receiver and its string compare with the member's literal, each after the first or-ed
in. At a `string | null` each compare is guarded, a null answering 0. The IR left the arm the miss
`is rung litArms memberEq`.

## What landed

- **One plan and shared tails.** `litMemberEqArmOf` states the shape `emitLitMemberEq` compares a
  member in: a value-union box, a nullable string, a string or a number. The string compare
  (`strMemberEqTail`, which makes the member's literal node as legacy did and writes it through
  `emitStrLitAt`), the nullable string's guard (`nulStrMemberOpen`, `nulStrMemberGuard`,
  `nulStrMemberClose`) and the members' or (`memberOrTail`, also `atomEqIsTail`'s) are the writer
  tails legacy and the `RLitArms` lowering both call.
- **The IR arm.** `memberEq` is an `RLitArms` arm. The builder holds each member to a string
  compare over a string receiver, or a guarded one over a `string | null`, and the receiver to a
  variable, as `atomEq`'s. The verifier holds the variable.
- **Named misses.** A member over a value-union box, written by `emitUnionLitIs` (`is literal member
  union at <rep>`), which the `boxLits` arm shares, and a receiver that is a temp (`is literal arms
  receiver`).

## Coverage

Measured on fixpoint seeds of this branch and of #9394's head `ce3ad5e5` (litArms' operand arms,
master `1d7e639b` merged), each building this branch's source.

| population | #9394 | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,479 | 19,479 |
| self-compile claimed (mode 3) | 19,454 | 19,454 |
| corpus with no blocker (45,678) | 44,209 | 44,217 |
| `tests/cases` covered / matched (armed shadow) | 62,816 / 62,815 | 62,848 / 62,847 |

On `tests/cases` `is rung litArms memberEq` (90 rows, 16 at `@start`) is gone. Left: `is literal
member union at box` 31 and `at nullable` 2, and `is literal arms receiver` 34 (15 on the base).
The armed shadow adds no fail, differ or mismatch row.

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0, self-compile identical; `--cases` identical 7,584, fail under both
  68, differ 0, witnesses same 60; `--claimless` identical 14,014, fail under both 3,267, differ 0;
  `tests/cases` A/B same 8,698, differ 0.
- **Fuel:** L2 self-compile 106,421,860,745 against #9394's fixpoint 106,395,790,975 (+0.02%).
