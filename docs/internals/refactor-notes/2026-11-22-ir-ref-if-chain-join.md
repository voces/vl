# IR: a reference join's chain opens every link at its head's join, 2026-11-22

Lane IR-N4, the self-compile tail (coordinator assignment). This takes over IR-D1's design
(`2026-11-21-ir-ref-if-variant.md`, ruling (a)). In a valued `if` chain or a `match` at a
reference join, legacy's `emitIfExprRef` writes every link at the head's kind and slot. An inner
link's own `ifRefJoinOf` can name another one: in a `match` of string-literal arms, for example,
the head is `str` and an inner link is `-`. The IR refused that link in `refIfLink`
(`ref if chain join`), because its lowering asked `ifRefJoinOf` of each link.

## Change

- **The decided join on `SIf`.** `siJoinAt` is the chain head whose join the link opens at.
  Every `SIf` is built through one constructor, `sIf`, which defaults it to -1; that constructor
  replaces the 18 literals in `ir_build.vl`, `ir_helper.vl` and `ir_selftest.vl`. Only
  `refIfLink` sets it, to the head.
- **The lowering** asks `ifRefJoinOf` of `siJoinAt` where it is set, and of the link otherwise.
  Nullability stays per link (`ifLinkYieldsNull`), because the builder already refuses a link
  whose accumulated null is not its own.
- `refIfLink` drops the miss and takes the head.

The design note named kind, slot and null as the field. The head's index carries the first two
through legacy's own answer, and the builder guards the third, so no second rep channel is added.

New admission predicates (R8): none. The lowering's join is `ifRefJoinOf`, legacy's answer, at
the node legacy asks it of.

Compiler lines +58 / −122 (`ir.vl`, `ir_build.vl`, `ir_lower.vl`, `ir_helper.vl`, `ir_selftest.vl`),
mostly the literal-to-constructor change. The shadow row `tests/ir-shadow-rows/ref-if-chain-head-join.vl`
is a `match` of string-literal arms (`ifExprPlainWhy`'s shape).

## Readings (base: fixpoint seed at master `8ff2d2f1`; candidate fixpoint)

| reading | base | this step |
| --- | ---: | ---: |
| self-compile `blockers none` | 19,686 | 19,688 |
| self-compile `ref if chain join` | 3 | 0 |
| self-compile `for in pinned slot` | 1 | 2 |
| self-compile covered = matched | 19,686 | 19,688 |
| self-compile claimed | 19,573 | 19,575 |
| armed `tests/cases` covered = matched + 1 pre-existing | 67,123 | 67,124 |
| armed `tests/cases` start covered = matched + 1 pre-existing | 5,468 | 5,469 |
| corpus covered = verified = matched | 44,812 | 44,812 |
| L2 self-compile fuel per PR | | −0.02% |

One of the three now stops at `for in pinned slot`, which is in this lane's tail. The fail and
mismatch rows are the same on both seeds. Self-compile identity: identical.
`ir-identity.sh --cases`: 7,604 identical, 0 differ. `--claimless`: 14,018 identical, 0 differ.
