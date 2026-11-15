# Rep ADT: declared rows no longer rebuild the rep tree, 2026-11-15 (lane E)

This note continues [stage 2's gate](2026-11-15-rep-adt-stage2-gate.md), which left one emit-state
cause of rep-tree rebuilds after `passes`: `declRows`, 1,393 corpus rebuilds.

## The input

`repTyHasDeclRow(ty)` asks whether record type `ty` has a declared struct row of its own: one
minted (`repSlotOfTyDecl`) or one `collectS` is about to mint (`rvsDeclPending`). It is an input
to every arm answer (`repVariantShapeHas`).

`repDeclRowsPending` sets and clears the pending set three times per collect round:
- empty, at the start of `collectU`;
- the declared types, at its end;
- empty again, after `collectS` mints them.

Each call dropped the whole tree.

## The change

- **Recording:** while a tree build is on the stack (`rtBuildDepth`), `repTyHasDeclRow` records
  each answer it gives in `rtDeclSeen`, keyed by record type. This is what the tree consumed.
- **Dropping:** `repDeclRowsPending` drops the tree only when one of those answers now reads
  otherwise (`rtDeclMoved`).
- **Lifetime:** the map is cleared with each tree build.

So the tree is dropped exactly when an input it consumed changed, and is otherwise kept, since a
rebuild would reproduce it.

## Measured

Both seeds are fixpoints of the same master commit (`518cdc66d`), one with this change and one
without.

| | before | after |
|---|---|---|
| self-build: tree builds | 3 (`first`, 2 `declRows`) | **1** (`first`) |
| corpus (12,037 cells, 8,684 reach emit): rebuilds after `passes` | 1,500 (1,393 `declRows`, 107 `tyMutEpoch`) | **107**, all `tyMutEpoch` |
| corpus exit codes / module bytes changed | — | **0 / 0** |
| self-build bytes | — | identical (fixpoint) |
| guest fuel (`plumb-shape-cost.vl`) | 9,057,147,556 / 6,561,305,444 | 9,060,877,394 (+0.04%) / 6,563,841,022 (+0.04%) |
| peak live heap | 120,046 / 84,103 KiB | 120,049 / 84,104 KiB |

After this change, no emit-state input rebuilds the rep tree. The only cause left after `passes`
is `tyMutEpoch` during monomorphization, in 103 programs, which lane H's per-instance holes
(#8073) remove.

Net compiler lines: +24 (`emit_rep.vl`). Pin-helper delta: 0.

## The shared-instance trap, caught by the gate

The first version cleared `rtDeclSeen` only when the tree was rebuilt. A shared instance compiling
a second program (the `cases_wasm` oracle, the instance-leak tests) reached `repDeclRowsPending`
before its first rebuild. It then read the previous program's type indices: an array access out of
bounds inside the compiler. Now:
- every `repTreeDrop` clears the map, since a dropped tree's answers mean nothing;
- a type index outside the arena reads as moved.

The child reads in `elabBoxedUnionsInto` and `rtGo` came from master with #8162, already on
`tyElemOf`, `tyKeyOf` and `tyValOf`.
