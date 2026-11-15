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
| guest fuel (`plumb-shape-cost.vl`) | FUEL_BEFORE | FUEL_AFTER |

After this change, no emit-state input rebuilds the rep tree. The only cause left after `passes`
is `tyMutEpoch` during monomorphization, in 103 programs, which lane H's per-instance holes
(#8073) remove.

Net compiler lines: +22 (`emit_rep.vl`). Pin-helper delta: 0.

## Not done here

The four raw child reads from #8151 stay: three in `elabBoxedUnionsInto` and `rtGo`'s
`t.aElem`. Master has `tyOpen` (#8155) but not yet the child accessors `tyElemOf`, `tyKeyOf`
and `tyValOf`, which are still on lane H's hole-rows branch. These reads are child reads, not
openness tests.
