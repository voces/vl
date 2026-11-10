# Step 7: a named alias or intersection row is found by its type; group 7 re-shadowed, 2026-11-10

Base: master `ce2f9fbb` (#7026). Both seeds are fixpoints (two `refresh-compiler.sh` runs,
byte-identical). The population is the 23,816-program sweep list. Measured on a 4-core box.

## What changed

A named one-member alias of a record (`type AB = A & B`, `type MyCat = Cat`) is a one-member
`TyUnion` in the arena. The structural reader declined it at its `TyObj` gate, so no typed reader
could name the row that a binding of that type is stored in.

* **The row is keyed by the alias's type where the row is made.** `internShapeAs` interns an
  alias's row while `collectS` lowers the declaration. It now also records the alias's own arena
  type against that row (`structTyIxAlias`). This is the first lowering of the type, not a mint
  on a miss in a question reader. No new row is made.
* **`repStructRowOfTy` folds a one-member alias.** For a one-member union it answers the row
  recorded for the alias type, else its record member's row. A union with more members still
  answers -1.
* **`recordStructRow` (the annotation side, `retStructRowIndex`) admits the same one-member
  alias.** That makes a return annotation `(): M` find its row.

The recorded row matters when two declarations share a shape. In
`intersection-elem-permuted-arm-field-alias.vl` the folded member `{b, a}` found row 0 (`W.xs`'s
element) by shape, while `q: AB[]` is stored at `AB`'s row 1. Those two rows are twins, but the
recorded alias row is the one that is always right.

## Group 7 re-shadowed

A scratch compiler ran each classifier beside its typed twin under `$VL_CLS_CENSUS=1`, as round 26
did. Counts are post-mono calls.

**`structIndexOfExpr`**, twin `repStructRowOfTy(nonNullTy(nodeTyAt(e)))`:

| | master | with this change |
| --- | --- | --- |
| same | 3,445,691 | 3,446,099 |
| layout twins | 4,904 | 4,943 |
| only the classifier names a row | 12,478 | 12,025 |
| only the type names a row | 29,851 | 29,851 |
| different rows, not twins | 4,190 | 4,190 |

The 453 calls that moved were every named alias in the population (`AB`, `CD`, `MyCat` and the
`d362in`/`d402` named cells). After the change, no disagreement has a named alias type. The rest
are not this lane's:

* **Only the classifier names a row (12,025).** The binding's value is stored in a wider row than
  its type, as with `{f: i32}` held as `{f, g}` in the `soundness/record-*-held-wider-runs.vl`
  family, plus records holding function lists. These are storage facts (group 1, the emitter's own
  storage), and the type cannot carry them.
* **Only the type names a row (29,851).** The classifier answers -1 for a union arm on purpose
  (`Circle` 11,354, `A`/`B`/`J`/`Sq` and others), because an arm's layout is `exprVariantIndex`'s.
  A typed twin needs `repTyIsVariant`'s guard, as `retStructIndex` has.
* **Different rows (4,190).** Mostly `{f: i32}`, `{r: null}` (D14495's narrowed record) and
  function-holding records. These are the same storage facts.

`structIndexOfExpr` is not switched. It is at 98.6%.

**`letCellSlot`'s struct arm**, twin `repStructRowOfTy(nonNullTy(letBindTy(b)))`: 19 of the
224,901 calls reach it, because `holderRecordRow`, the map and reflist arms and `letBindRepClaims`
answer first. 18 agree. The one miss is `soundness/fresh-literal-at-generic-delivered-wider-runs.vl`:
`const r = back(a)` is typed `{y: i32, x: i32}` and stored at `V`'s row, which only the callee's
published join knows (group 9). Its reflist arm is group 2's. It is not switched.

## Graded at the consumers

3,246 programs were compiled by both seeds and their wasm compared. They are every program with a
one-line alias or intersection declaration, plus every program with a shadow disagreement. 3,227
gave the same wasm, 18 gave the same refusal, and one moved.

**D14162** (an intersection alias over a recursive record) has no row of its own. Its filed
binding witness used to refuse, and it now runs (`1`) on `Node`'s row. A return position runs too.
A parameter's body read and an `M[]` element still refuse loudly
(`field access receiver is not a struct`). The row is re-filed on the parameter witness and stays
open, with the position table in the row.

D14041 and D14042 refuse as filed on both seeds.

## Proof

| check | base | this branch |
| --- | --- | --- |
| fixpoint seed | 6,597,010 | 6,597,334 (+324) |
| `classifier-census.vl` probed | 42 | 42 |
| `rep-fuzz-check.sh` | | exact, 0 baselined failures |
| `late-demands.vl --check` | 6 | 6 |
| `check-filed-witnesses.vl --strict`, both inventories | | 4,679 graded, 4,679 as filed |
