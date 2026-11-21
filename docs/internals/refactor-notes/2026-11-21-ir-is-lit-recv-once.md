# IR coverage: a literal arm over a temp receiver legacy reads once (2026-11-21, lane IR-N1)

The IR's literal arms (`atomEq`, `memberEq`, `boxLits`, `numBox`) refused any receiver that is a
temp (`is literal arms receiver`), since a member compare re-reads the receiver. Legacy reads it once
per compare, and a box's tag test twice unless the box is stashed (`emitUnionLitIs`' tee). Where
that count is one, a single member or a stashed or statically false box, a temp is consumed once.

## What landed

- **The read count.** `litArmsReadsOf` states how many times `emitIsTestLitArms` reads the receiver
  at an arm, from the same member lists and box plan its writers use (`litIsMemberTexts`,
  `litIsBoxLexes`, `unionLitIsPlanOf`). The builder refuses a temp only where it is read more than
  once.
- **Why not a stash.** Legacy stashes no multi-read receiver here: it accepts several reads only
  over a re-readable place (`unionEqOperandOk`: a field or element path), and writes the place
  again per read. The 35 rows left are such places the IR builds as a temp; serving them is
  building the place once per read, not a stash slot, so `RStashSet` (a record literal's field
  order stash) is not the node.

## Coverage

Measured on fixpoint seeds of this branch and of #9412's head `2159381e`, each building this
branch's source.

| population | #9412 | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,519 | 19,519 |
| corpus with no blocker (45,678) | 44,449 | 44,449 |
| `tests/cases` covered / matched (armed shadow) | 64,388 / 64,387 | 64,400 / 64,399 |

`is literal arms receiver` on `tests/cases` is 56 → 35; the armed shadow adds no fail, differ or
mismatch row.

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,589, differ 0, witnesses same 60;
  `--claimless` identical 14,014, fail under both 3,267, differ 0; `tests/cases` A/B same 8,703,
  differ 0.
- **Fuel:** L2 self-compile 106,940,090,554 against #9412's fixpoint 106,934,711,338 (+0.005%).
