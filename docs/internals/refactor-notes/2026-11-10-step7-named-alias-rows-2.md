# Step 7: a recursive intersection alias reads its record's row at a parameter and a list, 2026-11-10

This follows [2026-11-10-step7-named-alias-rows](2026-11-10-step7-named-alias-rows.md). Base: that
PR's head merged with master `3de5b959`. Both seeds are fixpoints (two `refresh-compiler.sh` runs,
byte-identical).

## What changed

`structRowOfRecordTy`, the reader the parameter, list and map positions ask, now folds a
one-member alias of a record the way `repStructRowOfTy` does: the row its declaration recorded,
else its record member's row. A union with more members still answers -1.

The alias that needs this is D14162's `type M = Node & { v: i32 }`. The canonicaliser leaves a
recursive intersection spelled `Node&{v:i32}` instead of folding it to a shape, so `collectS`
interns no row named `M`. Its type is still a one-member union over `Node`'s record. Every position
asked by type now reads `Node`'s row:

| position | before | after |
| --- | --- | --- |
| binding, reassignment, closure capture, through a generic | runs (previous PR) | runs |
| return `(): M` | runs (previous PR) | runs |
| parameter `f(m: M)`, reading `m.v` | `field access receiver is not a struct` | runs |
| list `M[]`, built, pushed and walked | `field access receiver is not a struct` | runs |
| map value `{[string]: M}` | `ref valtype with no interned shape` | runs |
| record field `type H = { m: M }` | `field access receiver is not a struct` | same |
| nullable parameter `M \| null` | `ref valtype with no interned shape` | same |

The last two are lowered by name, and `M` names no row. Interning a row for `M` would mean
`collectS` folding the recursive intersection, which is emit_collect's declaration pass and not
done here. D14162 is re-filed on the record-field witness and stays open.
`tests/cases/types/intersection-alias-recursive-positions.vl` pins the positions that run.

## Filed

**D15635.** `==` over a record that recurses through a nullable field (`type Node = { v: i32,
next: Node | null }`, `a == a`) passes `vl check` and exhausts the compiler's GC heap while
building. It is the same with or without the alias. Recursion through a list runs.

## Graded at the consumers

The previous PR's 3,246 programs were compiled by both seeds and their wasm compared: 3,228 gave
the same wasm, 18 gave the same refusal, and none moved. D14041 and D14042 refuse as filed.

## Proof

| check | base | this branch |
| --- | --- | --- |
| fixpoint seed | 6,598,614 | 6,598,755 (+141) |
| `rep-fuzz-check.sh` | | exact, 0 baselined failures |
| `late-demands.vl --check` | 6 | 6 |
| `check-filed-witnesses.vl --strict`, both inventories | | 4,681 graded, 4,681 as filed |
| `cases_wasm` shards 0–3 | | 7,391 passed, 0 failed |
