# IR coverage: litArms' box arms, a value-union box tested against literals (2026-11-21, lane IR-N1)

`v is L` over a still-boxed value union, `L` a literal union of strings (`boxLits`) or numbers
(`numBox`), and `memberEq` over a box receiver are `emitUnionLitIs` once per literal, each after the
first or-ed in: the box's tag tested against the literal's rep, then the payload unboxed and
compared. A literal whose rep has no arm is a static false over the box's evaluation. The IR left
the three as `is rung litArms boxLits`, `numBox` and `is literal member union at box`.

## What landed

- **A plan and shared tails.** `unionLitIsPlanOf` states `emitUnionLitIs`'s answer: no recorded
  members or no arm of the literal's rep in a box that cannot hold it (both refused), a static
  false, or the tag test, with the literal's ABI code and whether the box is stashed. Legacy writes
  from it through `unionLitNeverTail`, `unionLitTagHead` and `unionLitPayloadTail`, which the
  `RLitArms` lowering also calls; the string payload's compare is `strMemberEqTail`. `boxLits` and
  `numBox` read their literals from `litIsBoxLexes`. The bytes are unchanged.
- **The IR arms.** `boxLits` and `numBox` are `RLitArms` arms over a box variable, and
  `memberEq`'s union member writes the same compare. The builder refuses a literal the plan
  refuses (`is literal box noSet|noArm`); the verifier holds the receiver a variable.
- **Named misses.** A receiver that is not a box (`is literal arms operand rep`, a nullable box
  among them) and a receiver that is a temp (`is literal arms receiver`).

## Coverage

Measured on fixpoint seeds of this branch and of #9404's head `74fa5d73`, each building this
branch's source.

| population | #9404 | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,516 | 19,516 |
| self-compile claimed (mode 3) | 19,491 | 19,491 |
| corpus with no blocker (45,678) | 44,447 | 44,447 |
| `tests/cases` covered / matched (armed shadow) | 63,339 / 63,338 | 63,387 / 63,386 |

On `tests/cases` `is rung litArms boxLits` (77 rows) and `numBox` (48), and `is literal member
union at box` (31), are gone; `is literal arms operand rep` is 40 and `is literal arms receiver` 56
(34 on the base). The armed shadow adds no fail, differ or mismatch row. The corpus has no function
these arms alone blocked.

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0, self-compile identical; `--cases` identical 7,588, fail under both
  68, differ 0, witnesses same 60; `--claimless` identical 14,014, fail under both 3,267, differ 0;
  `tests/cases` A/B same 8,702, differ 0.
- **Fuel:** L2 self-compile 106,761,459,620 against #9404's fixpoint 106,742,533,235 (+0.02%).
