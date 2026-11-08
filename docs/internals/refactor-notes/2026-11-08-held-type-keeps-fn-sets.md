# The elaboration's held type keeps its function sets; guard (b)'s generic half is deleted (2026-11-08)

Lane "D15296, and the last function-holding guard". It follows
[2026-11-08-guard-b-identity-test-deleted](2026-11-08-guard-b-identity-test-deleted.md) and
[2026-11-07-heldval-consumers](2026-11-07-heldval-consumers.md).

## The mechanism (ablation)

With `monoRetFnListTy`'s `monoFrameIsGenericInstance(ctx) && holdsLit` test removed, D15296's
witness was invalid wasm in `mk`, with the record row `$0 = {fs: ref $4, x: i32}` and `$4` a list
of `$0`. Probes, one ingredient at a time:

| probe | reading |
| --- | --- |
| type `monoRecordObjLitAt` records on the record | `{fs: ((i32) => i32)[], x: i32}` |
| the row's `fs` field code and key (`iisPushFieldElem`) | 5 (closure ref-list), element `((i32)=>i32)` |
| set on the identity type's `fs` leaf (`elabIdentityTy`) | set 0 (`inc0`) |
| set on `elabHeldValTy`'s `fs` leaf | none |
| `idSlotHeldTy` on the same literal | unchanged: no slot write is keyed by the instance's clone |
| `x: 1` for `x: x` (no type variable in the record) | runs: the identity type is closed and kept as it is |

The values are tagged ids (`fnTagLeafId`), so the right row is the id list the non-generic twin
uses. The producer is `elabHeldValTy`: closing the identity type rebuilt each function leaf as a
bare signature and dropped its set. The closure ref-list key then resolved to the outer list's
slot.

## What changed

- `elabHeldKeepSets` (`emit_elab.vl`): a closed type's function leaf with no set takes its
  identity leaf's set. `elabHeldValTy` returns its type through it.
- `elabHeldListFacts` no longer skips a set a call reaches (the D15296 exclusion), and keeps sets
  the same way. That moves the `const`-bound spelling.
- `monoRetFnListTy`'s `holdsLit` test is deleted. Guard (b) is gone.

`monoRetFnListTy` now leaves a list to mono only where `elabHeldValTy` declines (D4515,
`container-of-generic-flow-reads.vl` L39/L40). `monoPinReturnedObj` still declines every generic
instance, so a bare record returned from `mk<T>` (D15297) still refuses. `monoCloseRetFnTy`
already read the reader always.

## Measured

Base: master `cbc9406c`, a fixpoint at 6,500,254 bytes. Candidate: a fixpoint at 6,501,062 bytes
(+808, +0.012%). `scripts/sweep.vl -- diff`: 23,612 same, 0 bytes-only, 10 output movers, 0
`runs → not-runs`, 0 new traps. Every mover is `emit_reject → runs`: D15296's row,
`d15293_called`, `d15293_called_two`, and the seven new `named/d15296_*` cells.

`regress.vl --verify-fresh` passes. The baseline write also corrects nine stale rows (`d15203_*`,
`d15209_*`, `d15221_*`) that already ran on master's fixpoint.

Still refusing on both seeds, with a non-generic twin that refuses too: two records whose sets
differ (`the lists this function returns are built at different rows`), and a lambda element
(`cannot infer a type for parameter`).
