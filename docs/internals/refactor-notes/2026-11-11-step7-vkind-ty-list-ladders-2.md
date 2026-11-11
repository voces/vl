# Step 7: the last two arena-type list ladders are descriptor reads at their callers, 2026-11-11

This finishes conversion 2 of `2026-11-10-step7-vkind-census.md` §4, after
`2026-11-10-step7-vkind-ty-list-ladders.md`. Base is master `5edb783b` (#7136). Its fixpoint seed
is 6,615,486 bytes.

## What changed

- **`tyScalarListKind` is deleted.** It was a filter over `repOfTy(ty)`: a covered `TyArray` whose
  `rdKind` is one of the six scalar list kinds. Its three readers now read the descriptor
  themselves and put it through the total kind map they already applied after it:
  - `forceCloListOfTy` (`emit_union_atoms.vl`) asks `forceScalarListBacking(d.rdKind)` of a
    covered descriptor;
  - `emitListCopyTail` (`wasmEmit.vl`) asks `scalarListElemOfListKind(d.rdKind)`, which is null
    for `strlist`, the ref list and every non-list kind, so the explicit `strlist` and `reflist`
    exclusions go;
  - `tyListRepKind` (`emit_ref_list_kinds.vl`) asks `listRepOrNull(d.rdKind)` and keeps every
    answer but `reflist`.
- **`tyListRepKind` keeps its ref-list rung.** `"reflist"` still comes only from the caller's row
  (`emptyArrHoleElemSlot`, `emptyArrUnionArmSlot`), never from the descriptor, because that row is
  resolved by name where the arena declines. The function is a descriptor read with the storage
  rung the classifier-half ruling allows.
- The `tyScalarListKind` re-export in `emit_ref_list_kinds.vl` goes with it.

That leaves the census's arena-type family empty.

## Where the answers could move

The old filter required `tyAt(ty) is TyArray`; the descriptor reads do not. A non-array type whose
covered `rdKind` is a scalar list kind could now answer where it answered `null`.

**The differential.** A probe compiler (built by the base seed into scratch, never refreshed into
`build/`) computed the old answer beside the new one at all three readers and called a distinctive
`emitFail` (`W308DIFF-force`, `-copy`, `-tylist`) on any disagreement.

- **The control fires.** A control compiler with an unconditional `emitFail` at each of the three
  points, swept over shard 1/20 (1,195 programs), records `W308CTL-force` in 101 cells,
  `W308CTL-copy` in 67 and `W308CTL-tylist` in 55. Each count is a lower bound: a cell records only
  its first failure.
- **The probe does not fire.** The probe's sweep of all 23,882 programs records 0 cells with a
  `W308DIFF-*` message, and is otherwise the same as the base on every program.

## Proof

- **Seed:** 6,615,486 → 6,615,336 bytes (−150). Two refreshes are byte-identical.
- **Sweep:** `sweep.vl -- record` over all 23,882 programs, base against candidate: **23,882 the
  same**, with 0 bytes-only movers, 0 output movers, 0 `runs → not-runs` and 0 new compiler traps.
