# A node type mono records in a frame that shares its body is that frame's own (2026-11-08)

Lane "per-(instance, node) recording keys", PR 1. It follows
[2026-11-07-rep-facts-behind-mono-guards](2026-11-07-rep-facts-behind-mono-guards.md) (class (c))
and [2026-11-07-slot-field-read-identity-type](2026-11-07-slot-field-read-identity-type.md)
(guard (b)).

## The defect

A generic instance's clone rebuilds only its statement spine (`monoCloneBody`). A nested lambda
is cloned per instance (`monoCloneLambdaSubst`), or the first instance keeps the template's own
node, and every leaf of the lambda's body is shared. `monoRecordOpen` wrote onto that shared node
(`nodeTyRecord`). The first instance's type then read as closed in the second, and the second
skipped its own record. In `k("s"); k(2.5)` with guard (b)'s identity test removed,
`monoRetFnListTy` recorded `[t]` at `string[]` in `k<string>`'s lambda (frame 13) and returned
early in `k<f64>`'s clone. The clone was built as invalid wasm.

## What changed

- `check_node_tys.vl` keeps a per-frame overlay: node → `[frame, type, …]`, the node's type before
  the first frame's record, and the set of frames that share a body. `nodeTyRecordIn(fx, ix, ty)`
  writes it. The FIRST frame to record also writes the column, so a program with one instance
  reads the column as it did before.
- `nodeTyIxOf` reads at the current frame (`nodeTyInstEnter`): that frame's record, else, in a
  sharing frame, the type before any record, else the column. While a frame is current, a direct
  `nodeTyRecord` on an overlaid node updates that frame's entry too.
- Mono sets the frame in `monoWalkFnBody`. The emitter sets it in `emitFuncCode` and clears it for
  the start and init bodies.
- `monoRecordOpen` records per frame when `monoFrameSharesBody(wf)` (`value_reach.vl`): `wf` is
  no generic instance, and an ancestor in `fnParent` is a generic (`monoGen`) or a generic instance (`fnInstOrigin`).

The key is the frame (the emitted `FuncDecl`), not the enclosing instance. A lambda clone's
`fnParent` is the template's (`monoLamParentOf`), so `monoFrameInstTmpl` finds no instance above
it. Two clones of one lambda in one instance also get their own keys.

A generic instance's own frame still leaves a shared node unrecorded (`monoNodeOwnedBy`), as
before. Guard (b)'s generic half (PR 3) moves that.

## Measured

Base: `claude/slot-rep-identity-3` (`841e82d3`), a fixpoint at 6,496,234 bytes. Candidate: a
fixpoint at 6,498,641 bytes (+2,407, +0.037%). `scripts/sweep.vl -- diff`: 23,613 same, 0
bytes-only, 0 output movers, 0 `runs → not-runs`, 0 new traps.

With guard (b)'s identity test also removed (PR 2), `lambda-list-join-type-param-pin.vl` runs
and prints its filed output. Without this PR it is invalid wasm in `__lambda_3`.
