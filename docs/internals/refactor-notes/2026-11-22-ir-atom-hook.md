# IR coverage: a direct `else if` link at a destination's type has no prelude (2026-11-22, lane IR-N1)

`const c: Op = if a { "lt" } else if b { "le" } else { "ge" }`, a chain of member literals at a
literal-union destination, is legacy's `emitIfExprAs` through the atom hook's `litJoin` arm. Its
links are written by `emitIfExprAsLink` along the spine, never through `emitExpr`, so a link meets
no `emitExpr` prelude. The IR's `ifExprAt` asked each link's `exprPrePathWhy`, and a link of
member literals answers `pre-path atom hook`, so the chain missed.

## What landed

- **`ifExprAt`** asks a link's prelude only where legacy writes the link through `emitExpr`: at a
  destination's type, a direct `else if` link has none.

## Coverage

Measured on fixpoint seeds of this branch and of master `dfc71b02`, each building this branch's
source.

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,660 | 19,664 |
| corpus with no blocker (45,678) | 44,812 | 44,812 |
| `tests/cases` covered / matched (armed shadow) | 67,194 / 67,193 | 67,194 / 67,193 |

Self-compile `pre-path atom hook` rows fall from 7 to 2. The two left are `pinHint` (a
string-repped literal into an atom list, legacy's `strToAtom`) and `objLitAt` (with `string atom
part route`); IR-N4 owns both. The armed shadow adds no fail, differ or mismatch row (the one fail
row, `generics/hole-map-tail-value.vl`, is on master too).

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,604, differ 0, witnesses same 60;
  `--claimless` identical 14,017, fail under both 3,267, differ 0; `tests/cases` A/B same 8,718,
  differ 0.
- **Fuel:** L2 self-compile per PR -0.00% on master `dfc71b02`.
