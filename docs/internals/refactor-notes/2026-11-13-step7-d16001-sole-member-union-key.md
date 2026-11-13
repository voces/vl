# D16001: a one-member union keys as its member, 2026-11-13

Lane A. A step-7 blocker filed by #7760 (one row per type). Emit only, in the rep layer.

**Mechanism.** `type M = Node & { v: i32 }` is a one-member union over a fresh record that is
`tyEq` to `Node`. `repIdOf(M)` pushed `M` on the hash-cons stack and walked its member.
`repFoldDepth` asks `tyUnrollsTo`, under which an alias and its body are one recursive type,
so the member met `M` on the stack as itself and keyed as a back-edge (`HC_BACK(1)`). Asked on
its own, the member bridges to `Node`'s declared slot. So `M[]` and `Node[]` interned two
ref-list rows. Bisected at the end of emit:

| ask | id |
|---|---|
| `repElemId(Node)` | 6 |
| `repElemId(M)` | 4 |
| `repElemId(M)`, memo cleared first | 4 |
| `hcUnionId(M.members)`, empty stack | 6 |
| `repIdGo(M)` with `M` on the stack | 4 |

Neither a stale memo nor the `sTyIx` push ordering was the cause; both were ruled out.

**The change.** `repIdOf` peels a one-member union to its member before pushing it
(`repSoleMemberOf`), in every key mode, since the wrapper and its member are one type in all of
them. A member that is a literal is not peeled (`repUnionIsOneType` refuses a `TyLit`), so a
one-member literal union keeps its own row. A first attempt folded inside the `TyUnion` arm,
after the push; it missed this case and split 27 `Json[]` programs into new duplicates.

**Grading.**
- **Duplicate-row probe**, over the full population (two rows whose types are `tySame` and
  `tyEq`, newtypes excluded): D16001's duplicate is gone and none is new. D16000 (lane G)
  remains.
- **Sweep**, fixpoint seeds on both sides, 24,212 programs: 24,211 same and 1 bytes-only mover,
  D16001's own witness. Its module keeps its 6 types, drops one local (369 → 366 bytes) and
  prints `3`. 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **`scripts/rep-fuzz-check.sh`**: exact.
- **`scripts/mono-tyaram-grid.sh`**: base and candidate are identical cell by cell (252 OK,
  9 REJECT, no BAD cell).
