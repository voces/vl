# D15656: a list literal of a kept-call join's binding is built where the arms are, 2026-11-11

Clause-1 close. Base is master `09b00b57`.

## What was wrong

`const b = if k > 0 { mk2() } else { mk2() }; const xs = [b]`, with `mk2` kept at
`J = { f: i32 | null }`. D15654 holds `b` at `J` emit-side (`letJoinHeldTy`). The checker's store
column (`storeLetsResolve`) answered a call initialiser but not a join, so the list literal never
learned its element was held at `J`. The list was typed at `{f: i32}`. That row is not interned
without a declared `K`, which gave `ref valtype with no interned shape`. With `K` declared, it gave
invalid wasm. Separately, `[b, mk2()]` was refused by `recStoresAgree`. `recKeptValueDst(b)`
followed a binding to a kept call (`recFreshOriginDecl`) but not to a join of them.

## The fix (checker)

- `storeJoinHeldAt` (check_store_rep.vl): `storeHeldAt` at a value `if`/`match` whose every tail
  is a call answers the record the calls' results agree on (`callBuiltTy`). `storeLetBuilt` then
  holds the join, `storeLitHeldAt` builds the literal there, and emit's `letStoreHeldTy` agrees.
- `recKeptJoinOf`/`recKeptJoinDst` (check_fit_rules.vl): `recKeptValueDst` follows a join, or a
  binding of one, to its arms' kept storage when they agree.

Each one is load-bearing. Without the first, the repro is still an emit error. Without the second,
`[b, mk2()]` is still refused. Extending `recBuildPush` to joins changed nothing, so it was dropped.

## Graded

The repro and its un-annotated neighbours all run (listed on the row). Two kept makers
`if … { mk2() } else { mk3() }` moved from emit error to runs. A literal arm, arms kept at different
rows, and an unkept arm refuse the same as on master. Filed: [D15657](../inventory/D15657.md), a push of
a kept call into such a list. It is refused on master too, for `[mk2()]` alone.
