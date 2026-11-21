# IR coverage: a folded atom compare, and an `else if` link at a destination's type (2026-11-21, lane IR-N1)

Two self-compile classes the coordinator assigned, 4 functions each.

- **`atom compare fold`.** `atomEqPlanOf`'s `fold` arm is a compare whose two sides are typed as
  single string literals: legacy writes each side as its literal's atom (`emitStaticLitAtom`), drops
  it, then the constant. The fold's drop and constant are now shared tails (`atomFoldSideTail`,
  `atomFoldTail`); the IR builds both sides as static sides (`staticSideOf`) into `RAtomEq` with
  `aeStatic` 3, which the lowering writes as `staticSide`, the drop, `staticSide`, the drop and the
  constant. The verifier reads an immediate side as unread there too.
- **`atom if join chain`.** An `if` chain built at a destination's type (the atom hook's
  `emitIfExprAs`) refused every link. Legacy walks a direct `else if` as a link at the head's kind,
  which the chain already builds; only an `else` block whose value is an `if` is not a link there,
  and stays the miss.

## Coverage

Measured on fixpoint seeds of this branch and of master `755a6b9f`, each building this branch's
source.

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,591 | 19,594 |
| self-compile claimed (mode 3) | 19,566 | 19,569 |
| corpus with no blocker (45,678) | 44,594 | 44,594 |
| `tests/cases` covered / matched (armed shadow) | 65,996 / 65,995 | 66,000 / 65,999 |

On the self-compile census `atom compare fold` (4, and 1 beside `pre-path atom hook`) and `atom if
join chain` (4, and 1 beside `string operand coercion`) are gone; the chain's functions reach a
later blocker. The armed shadow adds no fail, differ or mismatch row.

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,594, differ 0, witnesses same 60;
  `--claimless` identical 14,017, fail under both 3,267, differ 0; `tests/cases` A/B same 8,708,
  differ 0.
- **Fuel:** L2 self-compile per PR +0.02% on master `755a6b9f`'s L2.
